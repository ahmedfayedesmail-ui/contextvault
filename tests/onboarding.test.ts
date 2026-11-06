import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi
} from "vitest";

import {
  mkdtemp,
  rm,
  writeFile
} from "node:fs/promises";

import os from "node:os";
import path from "node:path";

import request from "supertest";

import type { Express } from "express";
import type { DatabaseSync } from "node:sqlite";

vi.mock("../src/indexer/embedder", () => ({
  generateEmbedding: vi.fn(async () => [0.1, 0.2, 0.3]),
  generateEmbeddingBatch: vi.fn(async (texts: string[]) => {
    await new Promise<void>((resolve) => {
      setTimeout(resolve, 20);
    });
    return texts.map(() => [0.1, 0.2, 0.3]);
  })
}));

let database: DatabaseSync;
let app: Express;
let fixtureDirectory: string;

const originalDatabasePath = process.env.DATABASE_PATH;

interface TestIndexJob {
  jobId: string;
  status: string;
  totalFiles: number;
  completedFiles: number;
  totalChunks: number;
  completedChunks: number;
  filesCount: number | null;
  chunksCount: number | null;
  error: string | null;
}

async function waitForIndexJob(jobId: string): Promise<TestIndexJob> {
  for (let attempt = 0; attempt < 200; attempt++) {
    const response = await request(app).get(`/api/index/${jobId}`);

    if (response.status !== 200) {
      throw new Error("Unable to retrieve index job.");
    }

    const job = response.body.job as TestIndexJob;

    if (job.status === "completed" || job.status === "failed") {
      return job;
    }

    await new Promise<void>((resolve) => {
      setTimeout(resolve, 5);
    });
  }

  throw new Error("Index job did not finish within the test timeout.");
}

beforeAll(async () => {
  process.env.DATABASE_PATH = ":memory:";

  const dbModule = await import("../src/storage/db");
  const serverModule = await import("../src/server");

  database = dbModule.database;
  app = serverModule.app;
});

beforeEach(async () => {
  database.exec(`
    DELETE FROM chunks;
    DELETE FROM files;
  `);

  fixtureDirectory = await mkdtemp(
    path.join(os.tmpdir(), "contextvault-onboarding-")
  );
});

afterEach(async () => {
  if (fixtureDirectory) {
    await rm(fixtureDirectory, {
      recursive: true,
      force: true
    });
  }
});

afterAll(() => {
  if (database) {
    database.close();
  }

  if (originalDatabasePath === undefined) {
    delete process.env.DATABASE_PATH;
  } else {
    process.env.DATABASE_PATH = originalDatabasePath;
  }
});

describe("ContextVault onboarding", () => {
  it("returns accurate system statistics after files and chunks are added", async () => {
    const insertFile = database.prepare(`
      INSERT INTO files (
        path,
        root_path,
        content,
        mtime,
        size,
        language
      )
      VALUES (?, ?, ?, ?, ?, ?)
    `);

    insertFile.run(
      "src/one.ts",
      "/contextvault-onboarding-stats-test",
      "export const one = 1;",
      "2026-11-04T10:00:00.000Z",
      21,
      "typescript"
    );

    insertFile.run(
      "src/two.ts",
      "/contextvault-onboarding-stats-test",
      "export const two = 2;",
      "2026-11-04T10:00:00.000Z",
      21,
      "typescript"
    );

    const firstFile = database.prepare(`
      SELECT id
      FROM files
      WHERE path = ?
    `).get("src/one.ts") as { id: number };

    const insertChunk = database.prepare(`
      INSERT INTO chunks (
        file_id,
        content,
        start_line,
        end_line,
        chunk_index
      )
      VALUES (?, ?, ?, ?, ?)
    `);

    insertChunk.run(firstFile.id, "first chunk", 1, 1, 0);
    insertChunk.run(firstFile.id, "second chunk", 2, 2, 1);

    const response = await request(app)
      .get("/api/stats");

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      totalFiles: 2,
      totalChunks: 2
    });
  });

  it("starts background indexing and completes successfully", async () => {
    const projectFilePath = path.join(
      fixtureDirectory,
      "welcome.ts"
    );

    const source = "export function welcome() { return 'ContextVault'; }";
    await writeFile(projectFilePath, source, "utf8");

    const startResponse = await request(app)
      .post("/api/index")
      .send({ rootPath: fixtureDirectory });

    expect(startResponse.status).toBe(202);
    expect(startResponse.body.success).toBe(true);

    const jobId = startResponse.body.job.jobId;
    expect(jobId).toBeTruthy();

    const job = await waitForIndexJob(jobId);

    expect(job.status).toBe("completed");
    expect(job.filesCount).toBe(1);
    expect(job.chunksCount).toBe(1);

    const statsResponse = await request(app).get("/api/stats");

    expect(statsResponse.status).toBe(200);
    expect(statsResponse.body).toEqual({
      totalFiles: 1,
      totalChunks: 1
    });

    const savedFile = database.prepare(`
      SELECT path, content
      FROM files
      WHERE path = ?
    `).get("welcome.ts") as
      | { path: string; content: string }
      | undefined;

    expect(savedFile).toBeDefined();
    expect(savedFile?.path).toBe("welcome.ts");
    expect(savedFile?.content).toBe(source);
  });

  it("updates database statistics while indexing is still running", async () => {
    for (let index = 0; index < 18; index++) {
      await writeFile(
        path.join(fixtureDirectory, `file-${String(index).padStart(2, "0")}.ts`),
        `export function function${index}() { return ${index}; }`,
        "utf8"
      );
    }

    const startResponse = await request(app)
      .post("/api/index")
      .send({ rootPath: fixtureDirectory });

    expect(startResponse.status).toBe(202);
    const jobId = startResponse.body.job.jobId;

    let observedPartialProgress = false;
    let finalJob: TestIndexJob | null = null;

    for (let attempt = 0; attempt < 200; attempt++) {
      const jobResponse = await request(app)
        .get(`/api/index/${jobId}`);

      const statsResponse = await request(app).get("/api/stats");
      const job = jobResponse.body.job as TestIndexJob;

      if (
        job.status === "running" &&
        job.totalFiles === 18 &&
        job.completedFiles === 16 &&
        statsResponse.body.totalFiles === 16
      ) {
        observedPartialProgress = true;
      }

      if (job.status === "completed" || job.status === "failed") {
        finalJob = job;
        break;
      }

      await new Promise<void>((resolve) => {
        setTimeout(resolve, 2);
      });
    }

    expect(observedPartialProgress).toBe(true);
    expect(finalJob?.status).toBe("completed");
    expect(finalJob?.filesCount).toBe(18);
    expect(finalJob?.chunksCount).toBe(18);
  });

  it("rejects clearing the index while a background indexing job is active", async () => {
    await writeFile(
      path.join(fixtureDirectory, "slow.ts"),
      "export function slow() { return 1; }",
      "utf8"
    );

    const startResponse = await request(app)
      .post("/api/index")
      .send({ rootPath: fixtureDirectory });

    expect(startResponse.status).toBe(202);

    const clearResponse = await request(app)
      .delete("/api/index");

    expect(clearResponse.status).toBe(409);

    const jobId = startResponse.body.job.jobId;
    const job = await waitForIndexJob(jobId);
    expect(job.status).toBe("completed");
  });

  it("clears all indexed files and chunks", async () => {
    database.prepare(`
      INSERT INTO files (
        path,
        root_path,
        content,
        mtime,
        size,
        language
      )
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(
      "src/temporary.ts",
      "/contextvault-onboarding-clear-test",
      "temporary indexed content",
      "2026-11-04T10:00:00.000Z",
      25,
      "typescript"
    );

    const file = database.prepare(`
      SELECT id FROM files WHERE path = ?
    `).get("src/temporary.ts") as {
      id: number | bigint;
    };

    database.prepare(`
      INSERT INTO chunks (
        file_id,
        content,
        start_line,
        end_line,
        chunk_index
      )
      VALUES (?, ?, ?, ?, ?)
    `).run(
      Number(file.id),
      "temporary chunk",
      1,
      1,
      0
    );

    const response = await request(app).delete("/api/index");

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      success: true,
      deletedFiles: 1,
      deletedChunks: 1
    });

    const statsResponse = await request(app).get("/api/stats");

    expect(statsResponse.body).toEqual({
      totalFiles: 0,
      totalChunks: 0
    });
  });
});
