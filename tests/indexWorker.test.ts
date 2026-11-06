import {
  afterAll,
  beforeAll,
  describe,
  expect,
  it
} from "vitest";

import { createServer, type Server } from "node:http";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { performance } from "node:perf_hooks";
import request from "supertest";
import type { Express } from "express";
import type { DatabaseSync } from "node:sqlite";

let app: Express;
let database: DatabaseSync;
let ollamaServer: Server;
let fixtureDirectory: string;
let databaseDirectory: string;
let embeddingRequestStarted: Promise<void>;
let resolveEmbeddingRequestStarted: (() => void) | undefined;
let originalDatabasePath: string | undefined;
let originalOllamaUrl: string | undefined;

const embeddingDelayMs = 500;

async function readRequestBody(
  requestStream: AsyncIterable<Buffer | string>
): Promise<string> {
  const chunks: string[] = [];

  for await (const chunk of requestStream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk.toString("utf8") : chunk);
  }

  return chunks.join("");
}

async function waitForJob(jobId: string): Promise<{
  status: string;
  filesCount: number | null;
  chunksCount: number | null;
  error: string | null;
}> {
  for (let attempt = 0; attempt < 200; attempt++) {
    const response = await request(app).get("/api/index/" + jobId);
    expect(response.status).toBe(200);

    const job = response.body.job;

    if (job.status === "completed" || job.status === "failed") {
      return job;
    }

    await new Promise<void>((resolve) => setTimeout(resolve, 10));
  }

  throw new Error("Worker indexing job did not finish within the test timeout.");
}

beforeAll(async () => {
  originalDatabasePath = process.env.DATABASE_PATH;
  originalOllamaUrl = process.env.OLLAMA_URL;

  databaseDirectory = await mkdtemp(
    path.join(os.tmpdir(), "contextvault-worker-db-")
  );
  fixtureDirectory = await mkdtemp(
    path.join(os.tmpdir(), "contextvault-worker-project-")
  );
  await mkdir(fixtureDirectory, { recursive: true });

  const embeddingStarted = new Promise<void>((resolve) => {
    resolveEmbeddingRequestStarted = resolve;
  });
  embeddingRequestStarted = embeddingStarted;

  ollamaServer = createServer(async (req, res) => {
    if (req.method !== "POST" || req.url !== "/api/embed") {
      res.writeHead(404).end();
      return;
    }

    const body = JSON.parse(
      await readRequestBody(req)
    ) as { input?: string[] };

    resolveEmbeddingRequestStarted?.();
    resolveEmbeddingRequestStarted = undefined;

    await new Promise<void>((resolve) => {
      setTimeout(resolve, embeddingDelayMs);
    });

    const inputs = Array.isArray(body.input) ? body.input : [];
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({
      model: "nomic-embed-text",
      embeddings: inputs.map(() => [0.1, 0.2, 0.3])
    }));
  });

  await new Promise<void>((resolve, reject) => {
    ollamaServer.once("error", reject);
    ollamaServer.listen(0, "127.0.0.1", resolve);
  });

  const address = ollamaServer.address();
  if (!address || typeof address === "string") {
    throw new Error("Unable to determine the local Ollama test server port.");
  }

  process.env.DATABASE_PATH = path.join(databaseDirectory, "contextvault.db");
  process.env.OLLAMA_URL = "http://127.0.0.1:" + address.port;

  await writeFile(
    path.join(fixtureDirectory, "worker-test.ts"),
    "export function workerTest() { return 'worker thread'; }",
    "utf8"
  );

  const dbModule = await import("../src/storage/db");
  const serverModule = await import("../src/server");
  database = dbModule.database;
  app = serverModule.app;
});

afterAll(async () => {
  if (database) {
    database.close();
  }

  if (ollamaServer?.listening) {
    await new Promise<void>((resolve) => ollamaServer.close(() => resolve()));
  }

  if (databaseDirectory) {
    await rm(databaseDirectory, { recursive: true, force: true });
  }

  if (fixtureDirectory) {
    await rm(fixtureDirectory, { recursive: true, force: true });
  }

  if (originalDatabasePath === undefined) {
    delete process.env.DATABASE_PATH;
  } else {
    process.env.DATABASE_PATH = originalDatabasePath;
  }

  if (originalOllamaUrl === undefined) {
    delete process.env.OLLAMA_URL;
  } else {
    process.env.OLLAMA_URL = originalOllamaUrl;
  }
});

describe("indexing worker thread", () => {
  it("keeps /health responsive while the worker is embedding project chunks and reports progress", async () => {
    const startResponse = await request(app)
      .post("/api/index")
      .send({ rootPath: fixtureDirectory });

    expect(startResponse.status).toBe(202);
    const jobId = startResponse.body.job.jobId as string;
    expect(jobId).toBeTruthy();

    await embeddingRequestStarted;

    const healthStartedAt = performance.now();
    const healthResponse = await request(app)
      .get("/health")
      .expect(200);
    const healthDurationMs = performance.now() - healthStartedAt;

    expect(healthResponse.body.status).toBe("ok");
    expect(healthDurationMs).toBeLessThan(200);

    const progressResponse = await request(app)
      .get("/api/index/" + jobId)
      .expect(200);
    expect(progressResponse.body.job.status).toBe("running");
    expect(["scanning", "embedding"]).toContain(
      progressResponse.body.job.stage
    );

    const job = await waitForJob(jobId);
    expect(job.status).toBe("completed");
    expect(job.filesCount).toBe(1);
    expect(job.chunksCount).toBe(1);
    expect(job.error).toBeNull();

    const statsResponse = await request(app).get("/api/stats").expect(200);
    expect(statsResponse.body).toEqual({
      totalFiles: 1,
      totalChunks: 1
    });
  });
});
