import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it
} from "vitest";

import type { DatabaseSync } from "node:sqlite";

import type {
  ProjectFile,
  TextChunk
} from "../src/types";

import type {
  SearchResult
} from "../src/storage/vectors";

let database: DatabaseSync;

let cosineSimilarity: (
  vectorA: number[],
  vectorB: number[]
) => number;

let searchVectors: (
  queryEmbedding: number[],
  limit?: number,
  filter?: "all" | "code" | "docs"
) => SearchResult[];

let saveIndexedData: (
  files: ProjectFile[],
  chunks: TextChunk[],
  embeddings: number[][],
  rootPath?: string
) => void;

const originalDatabasePath =
  process.env.DATABASE_PATH;

beforeAll(async () => {
  process.env.DATABASE_PATH = ":memory:";

  const dbModule = await import(
    "../src/storage/db"
  );

  database = dbModule.database;

  const vectorsModule = await import(
    "../src/storage/vectors"
  );

  cosineSimilarity = vectorsModule.cosineSimilarity;

  searchVectors = vectorsModule.searchVectors;

  saveIndexedData = vectorsModule.saveIndexedData;
});

beforeEach(() => {
  database.exec(`
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

describe("Cosine Similarity", () => {

  it("should return 1 for identical vectors", () => {
    const result = cosineSimilarity(
      [1, 0, 0],
      [1, 0, 0]
    );

    expect(result).toBeCloseTo(1, 10);
  });

  it("should return 0 for orthogonal vectors", () => {
    const result = cosineSimilarity(
      [1, 0],
      [0, 1]
    );

    expect(result).toBeCloseTo(0, 10);
  });

  it("should return 0 when a vector has zero magnitude", () => {
    const result = cosineSimilarity(
      [0, 0],
      [1, 0]
    );

    expect(result).toBe(0);
  });

  it("should reject vectors with different dimensions", () => {
    expect(() => {
      cosineSimilarity(
        [1, 0],
        [1, 0, 0]
      );
    }).toThrow(
      "vector dimensions do not match"
    );
  });

});

describe("searchVectors", () => {

  beforeEach(() => {

    const files: ProjectFile[] = [
      {
        path: "src/relevant.ts",
        content: "function calculateTotal() {}",
        mtime: new Date("2026-11-04T10:00:00.000Z"),
        size: 30,
        language: "typescript"
      },
      {
        path: "src/unrelated.ts",
        content: "function renderPage() {}",
        mtime: new Date("2026-11-04T10:00:00.000Z"),
        size: 25,
        language: "typescript"
      }
    ];

    const chunks: TextChunk[] = [
      {
        filePath: "src/relevant.ts",
        content: "function calculateTotal() {}",
        startLine: 1,
        endLine: 1,
        chunkIndex: 0
      },
      {
        filePath: "src/unrelated.ts",
        content: "function renderPage() {}",
        startLine: 1,
        endLine: 1,
        chunkIndex: 0
      }
    ];

    const embeddings: number[][] = [
      [1, 0],
      [0, 1]
    ];

    saveIndexedData(
      files,
      chunks,
      embeddings,
      "/contextvault-search-test"
    );
  });

  it("should return the most similar stored chunk first", () => {

    const results = searchVectors(
      [1, 0],
      5
    );

    expect(results.length).toBe(2);

    expect(results[0].filePath).toBe(
      "src/relevant.ts"
    );

    expect(results[0].content).toBe(
      "function calculateTotal() {}"
    );

    expect(results[0].score).toBeCloseTo(1, 5);

    expect(results[1].filePath).toBe(
      "src/unrelated.ts"
    );

    expect(results[1].score).toBeCloseTo(0, 5);

  });

  it("should restrict results to code or documentation when a filter is supplied", () => {
    const docsFile: ProjectFile = {
      path: "README.md",
      content: "# Project documentation",
      mtime: new Date("2026-11-04T10:00:00.000Z"),
      size: 24,
      language: "markdown"
    };
    const docsChunk: TextChunk = {
      filePath: "README.md",
      content: "# Project documentation",
      startLine: 1,
      endLine: 1,
      chunkIndex: 0
    };

    saveIndexedData(
      [docsFile],
      [docsChunk],
      [[1, 0]],
      "/contextvault-search-test"
    );

    const codeResults = searchVectors([1, 0], 10, "code");
    const docsResults = searchVectors([1, 0], 10, "docs");
    const allResults = searchVectors([1, 0], 10);

    expect(codeResults.map((result) => result.filePath)).not.toContain("README.md");
    expect(docsResults.map((result) => result.filePath)).toEqual(["README.md"]);
    expect(allResults.map((result) => result.filePath)).toContain("README.md");
  });

  it("should respect the requested result limit", () => {

    const results = searchVectors(
      [1, 0],
      1
    );

    expect(results).toHaveLength(1);

    expect(results[0].filePath).toBe(
      "src/relevant.ts"
    );
  });

  it("should return an empty array when no vectors are stored", () => {

    database.exec(`
      DELETE FROM chunks;
      DELETE FROM files;
    `);

    const results = searchVectors(
      [1, 0]
    );

    expect(results).toEqual([]);
  });

  it("should reject an invalid query embedding", () => {

    expect(() => {
      searchVectors([]);
    }).toThrow(
      "Invalid query embedding"
    );

  });

});
