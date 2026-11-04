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
  generateEmbedding: vi.fn(async () => [0.1, 0.2, 0.3])
}));

let database: DatabaseSync;
let app: Express;
let fixtureDirectory: string;

const originalDatabasePath = process.env.DATABASE_PATH;

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
        content,
        mtime,
        size,
        language
      )
      VALUES (?, ?, ?, ?, ?)
    `);

    insertFile.run(
      "src/one.ts",
      "export const one = 1;",
      "2026-11-04T10:00:00.000Z",
      21,
      "typescript"
    );

    insertFile.run(
      "src/two.ts",
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

  it("indexes a valid project directory through POST /api/index", async () => {
    const projectFilePath = path.join(
      fixtureDirectory,
      "welcome.ts"
    );

    const source = "export function welcome() { return 'ContextVault'; }";

    await writeFile(projectFilePath, source, "utf8");

    const response = await request(app)
      .post("/api/index")
      .send({ rootPath: fixtureDirectory });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      success: true,
      filesCount: 1,
      chunksCount: 1
    });

    const statsResponse = await request(app)
      .get("/api/stats");

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
});
