import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it
} from "vitest";

import type { DatabaseSync } from "node:sqlite";
import path from "node:path";

import type {
  ProjectFile,
  TextChunk
} from "../src/types";

let database: DatabaseSync;

let saveIndexedData: (
  files: ProjectFile[],
  chunks: TextChunk[],
  embeddings: number[][],
  rootPath?: string
) => void;

let pruneProjectIndex: (
  rootPath: string,
  currentFilePaths: string[]
) => { deletedFiles: number; deletedChunks: number };

const originalDatabasePath =
  process.env.DATABASE_PATH;

const testFile: ProjectFile = {
  path: "src/app.ts",
  content: "export function hello() { return 'world'; }",
  mtime: new Date("2026-11-04T10:00:00.000Z"),
  size: 45,
  language: "typescript"
};

const testChunks: TextChunk[] = [
  {
    filePath: "src/app.ts",
    content: "export function hello() { return 'world'; }",
    startLine: 1,
    endLine: 1,
    chunkIndex: 0
  }
];

const testEmbeddings: number[][] = [
  [0.1, 0.2, 0.3, 0.4]
];

beforeAll(async () => {
  process.env.DATABASE_PATH = ":memory:";

  const dbModule = await import("../src/storage/db");

  database = dbModule.database;

  const vectorsModule = await import(
    "../src/storage/vectors"
  );

  saveIndexedData = vectorsModule.saveIndexedData;
  pruneProjectIndex = vectorsModule.pruneProjectIndex;
});

beforeEach(() => {
  database.exec(`
    DROP TRIGGER IF EXISTS fail_chunk_insert;

    DELETE FROM chunks;
    DELETE FROM files;
  `);
});

afterAll(() => {
  database.close();

  if (originalDatabasePath === undefined) {
    delete process.env.DATABASE_PATH;
  } else {
    process.env.DATABASE_PATH = originalDatabasePath;
  }
});

describe("saveIndexedData", () => {
  it("should save files, chunks, and embeddings into SQLite", () => {
    saveIndexedData(
      [testFile],
      testChunks,
      testEmbeddings
    );

    const savedFile = database.prepare(`
      SELECT *
      FROM files
      WHERE path = ?
    `).get("src/app.ts") as
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

    expect(savedFile?.path).toBe("src/app.ts");

    expect(savedFile?.content).toBe(
      testFile.content
    );

    expect(savedFile?.mtime).toBe(
      testFile.mtime.toISOString()
    );

    expect(savedFile?.language).toBe(
      "typescript"
    );

    const savedChunk = database.prepare(`
      SELECT *
      FROM chunks
      WHERE file_id = ?
    `).get(savedFile?.id) as
      | {
          file_id: number;
          content: string;
          start_line: number;
          end_line: number;
          chunk_index: number;
          embedding: Uint8Array;
        }
      | undefined;

    expect(savedChunk).toBeDefined();

    expect(savedChunk?.content).toBe(
      testChunks[0].content
    );

    expect(savedChunk?.start_line).toBe(1);

    expect(savedChunk?.end_line).toBe(1);

    expect(savedChunk?.chunk_index).toBe(0);

    // Verify the embedding was stored as BLOB.

    expect(savedChunk?.embedding).toBeInstanceOf(
      Uint8Array
    );

    const embeddingBuffer = Buffer.from(
      savedChunk!.embedding
    );

    expect(embeddingBuffer.length).toBe(
      Float32Array.BYTES_PER_ELEMENT *
      testEmbeddings[0].length
    );

    // Decode the BLOB back into Float32 values.

    const decodedEmbedding = new Float32Array(
      embeddingBuffer.buffer,
      embeddingBuffer.byteOffset,
      embeddingBuffer.byteLength /
        Float32Array.BYTES_PER_ELEMENT
    );

    expect(decodedEmbedding[0]).toBeCloseTo(0.1, 6);
    expect(decodedEmbedding[1]).toBeCloseTo(0.2, 6);
    expect(decodedEmbedding[2]).toBeCloseTo(0.3, 6);
    expect(decodedEmbedding[3]).toBeCloseTo(0.4, 6);
  });

  it("should rollback all changes when a database insertion fails", () => {
    // Force an SQLite error when inserting a chunk.

    database.exec(`
      CREATE TRIGGER fail_chunk_insert
      BEFORE INSERT ON chunks
      BEGIN
        SELECT RAISE(
          ABORT,
          'forced chunk insert failure'
        );
      END;
    `);

    expect(() => {
      saveIndexedData(
        [testFile],
        testChunks,
        testEmbeddings
      );
    }).toThrow("forced chunk insert failure");

    // The file was inserted before the chunk failure.
    // A successful ROLLBACK must remove it as well.

    const fileCount = database.prepare(`
      SELECT COUNT(*) AS count
      FROM files
    `).get() as { count: number };

    const chunkCount = database.prepare(`
      SELECT COUNT(*) AS count
      FROM chunks
    `).get() as { count: number };

    expect(fileCount.count).toBe(0);

    expect(chunkCount.count).toBe(0);
  });

  it("should remove stale files and cascade-delete their chunks for one project only", () => {
    const currentRoot = path.resolve(process.cwd(), "fixtures", "current-project");
    const otherRoot = path.resolve(process.cwd(), "fixtures", "other-project");

    const currentFile: ProjectFile = {
      ...testFile,
      path: "src/current.ts"
    };
    const currentChunk: TextChunk = {
      ...testChunks[0],
      filePath: "src/current.ts"
    };
    const staleFile: ProjectFile = {
      ...testFile,
      path: "src/renamed-old.ts"
    };
    const staleChunk: TextChunk = {
      ...testChunks[0],
      filePath: "src/renamed-old.ts"
    };
    const otherProjectFile: ProjectFile = {
      ...testFile,
      path: "src/current.ts"
    };
    const otherProjectChunk: TextChunk = {
      ...testChunks[0],
      filePath: "src/current.ts"
    };

    saveIndexedData(
      [currentFile, staleFile],
      [currentChunk, staleChunk],
      [testEmbeddings[0], testEmbeddings[0]],
      currentRoot
    );
    saveIndexedData(
      [otherProjectFile],
      [otherProjectChunk],
      [testEmbeddings[0]],
      otherRoot
    );

    const result = pruneProjectIndex(
      currentRoot,
      ["src/current.ts"]
    );

    expect(result).toEqual({
      deletedFiles: 1,
      deletedChunks: 1
    });

    const remainingFiles = database.prepare(`
      SELECT path, root_path FROM files ORDER BY root_path
    `).all() as Array<{ path: string; root_path: string }>;

    expect(remainingFiles).toEqual([
      { path: "src/current.ts", root_path: currentRoot },
      { path: "src/current.ts", root_path: otherRoot }
    ]);

    const remainingChunks = database.prepare(`
      SELECT COUNT(*) AS count FROM chunks
    `).get() as { count: number | bigint };

    expect(Number(remainingChunks.count)).toBe(2);
  });

  it("should reject mismatched chunk and embedding counts", () => {
    expect(() => {
      saveIndexedData(
        [testFile],
        testChunks,
        []
      );
    }).toThrow("Embedding count mismatch");

    const fileCount = database.prepare(`
      SELECT COUNT(*) AS count
      FROM files
    `).get() as { count: number };

    expect(fileCount.count).toBe(0);
  });
});
