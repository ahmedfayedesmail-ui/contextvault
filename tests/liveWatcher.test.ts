import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi
} from "vitest";

import request from "supertest";

import type { Express } from "express";
import type { DatabaseSync } from "node:sqlite";

import type { ProjectFile } from "../src/types";

vi.mock("../src/indexer/embedder", () => ({
  generateEmbedding: vi.fn(async () => [0.1, 0.2, 0.3]),
  generateEmbeddingBatch: vi.fn(async (texts: string[]) =>
    texts.map(() => [0.1, 0.2, 0.3])
  )
}));

let database: DatabaseSync;
let app: Express;

let getSystemStats: () => {
  totalFiles: number;
  totalChunks: number;
};

let indexSingleFile: (file: ProjectFile, rootPath: string) => Promise<void>;

const originalDatabasePath = process.env.DATABASE_PATH;

beforeAll(async () => {
  process.env.DATABASE_PATH = ":memory:";

  const dbModule = await import("../src/storage/db");
  const pipelineModule = await import("../src/indexer/pipeline");
  const serverModule = await import("../src/server");

  database = dbModule.database;
  getSystemStats = dbModule.getSystemStats;
  indexSingleFile = pipelineModule.indexSingleFile;
  app = serverModule.app;
});

beforeEach(() => {
  database.exec(`
    DELETE FROM chunks;
    DELETE FROM files;
  `);
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

describe("getSystemStats", () => {
  it("returns total file and chunk counts from SQLite", () => {
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
      "src/first.ts",
      "/contextvault-live-watcher-test",
      "export const first = true;",
      "2026-11-04T10:00:00.000Z",
      27,
      "typescript"
    );

    insertFile.run(
      "src/second.ts",
      "/contextvault-live-watcher-test",
      "export const second = true;",
      "2026-11-04T10:00:00.000Z",
      29,
      "typescript"
    );

    const firstFile = database.prepare(`
      SELECT id FROM files WHERE path = ?
    `).get("src/first.ts") as { id: number };

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

    const stats = getSystemStats();

    expect(stats).toEqual({
      totalFiles: 2,
      totalChunks: 2
    });
  });
});

describe("GET /api/stats", () => {
  it("returns HTTP 200 and the correct system statistics", async () => {
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
      "src/stats-test.ts",
      "/contextvault-live-watcher-stats-test",
      "export const stats = true;",
      "2026-11-04T10:00:00.000Z",
      27,
      "typescript"
    );

    const file = database.prepare(`
      SELECT id FROM files WHERE path = ?
    `).get("src/stats-test.ts") as { id: number };

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

    insertChunk.run(file.id, "first chunk", 1, 1, 0);
    insertChunk.run(file.id, "second chunk", 2, 2, 1);

    const response = await request(app)
      .get("/api/stats");

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      totalFiles: 1,
      totalChunks: 2
    });
  });
});

describe("indexSingleFile", () => {
  it("saves a file, its chunks, and generated embeddings to the in-memory database", async () => {
    const content = "export function greet() { return 'hello'; }";

    const file: ProjectFile = {
      path: "src/live.ts",
      content,
      mtime: new Date("2026-11-04T10:00:00.000Z"),
      size: Buffer.byteLength(content, "utf8"),
      language: "typescript"
    };

    await indexSingleFile(file, "/contextvault-live-watcher-index-test");

    const savedFile = database.prepare(`
      SELECT id, path, content, mtime, size, language
      FROM files
      WHERE path = ?
    `).get(file.path) as
      | {
          id: number;
          path: string;
          content: string;
          mtime: string;
          size: number;
          language: string;
        }
      | undefined;

    expect(savedFile).toBeDefined();
    expect(savedFile?.path).toBe(file.path);
    expect(savedFile?.content).toBe(content);
    expect(savedFile?.mtime).toBe(file.mtime.toISOString());
    expect(savedFile?.language).toBe("typescript");

    const savedChunks = database.prepare(`
      SELECT content, start_line, end_line, chunk_index, embedding
      FROM chunks
      WHERE file_id = ?
      ORDER BY chunk_index
    `).all(savedFile?.id) as {
      content: string;
      start_line: number;
      end_line: number;
      chunk_index: number;
      embedding: Uint8Array;
    }[];

    expect(savedChunks).toHaveLength(1);
    expect(savedChunks[0].content).toBe(content);
    expect(savedChunks[0].start_line).toBe(1);
    expect(savedChunks[0].end_line).toBe(1);
    expect(savedChunks[0].chunk_index).toBe(0);
    expect(savedChunks[0].embedding).toBeInstanceOf(Uint8Array);
    expect(savedChunks[0].embedding.byteLength).toBe(
      3 * Float32Array.BYTES_PER_ELEMENT
    );
  });
});
