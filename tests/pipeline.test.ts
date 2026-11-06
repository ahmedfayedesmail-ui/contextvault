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

import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import type { DatabaseSync } from "node:sqlite";

vi.mock("../src/indexer/embedder", () => ({
  generateEmbedding: vi.fn(async () => [0.1, 0.2, 0.3]),
  generateEmbeddingBatch: vi.fn(async (texts: string[]) =>
    texts.map((_, index) => [index + 0.1, 0.2, 0.3])
  )
}));

let database: DatabaseSync;
let indexProject: (rootPath: string) => Promise<{
  filesCount: number;
  chunksCount: number;
}>;

let firstProjectRoot = "";
let secondProjectRoot = "";

const originalDatabasePath = process.env.DATABASE_PATH;

beforeAll(async () => {
  process.env.DATABASE_PATH = ":memory:";

  const dbModule = await import("../src/storage/db");
  const pipelineModule = await import("../src/indexer/pipeline");

  database = dbModule.database;
  indexProject = pipelineModule.indexProject;
});

beforeEach(async () => {
  database.exec("DELETE FROM chunks; DELETE FROM files;");

  firstProjectRoot = await mkdtemp(
    path.join(os.tmpdir(), "contextvault-stale-first-")
  );
  secondProjectRoot = await mkdtemp(
    path.join(os.tmpdir(), "contextvault-stale-second-")
  );

  await mkdir(path.join(firstProjectRoot, "src"), { recursive: true });
  await mkdir(path.join(secondProjectRoot, "src"), { recursive: true });
});

afterEach(async () => {
  await Promise.all([
    firstProjectRoot
      ? rm(firstProjectRoot, { recursive: true, force: true })
      : Promise.resolve(),
    secondProjectRoot
      ? rm(secondProjectRoot, { recursive: true, force: true })
      : Promise.resolve()
  ]);
});

afterAll(() => {
  database.close();

  if (originalDatabasePath === undefined) {
    delete process.env.DATABASE_PATH;
  } else {
    process.env.DATABASE_PATH = originalDatabasePath;
  }
});

describe("indexProject stale-file reconciliation", () => {
  it("removes deleted files and their chunks after a successful reindex without touching another project", async () => {
    const deletedPath = path.join(firstProjectRoot, "src", "obsolete.ts");
    const retainedPath = path.join(firstProjectRoot, "src", "retained.ts");
    const otherProjectPath = path.join(secondProjectRoot, "src", "obsolete.ts");

    await writeFile(
      deletedPath,
      "export function obsoleteInFirstProject() { return 'old'; }",
      "utf8"
    );
    await writeFile(
      retainedPath,
      "export function retainedInFirstProject() { return 'keep'; }",
      "utf8"
    );
    await writeFile(
      otherProjectPath,
      "export function obsoleteInSecondProject() { return 'other project'; }",
      "utf8"
    );

    const firstIndex = await indexProject(firstProjectRoot);
    const secondIndex = await indexProject(secondProjectRoot);

    expect(firstIndex).toEqual({ filesCount: 2, chunksCount: 2 });
    expect(secondIndex).toEqual({ filesCount: 1, chunksCount: 1 });

    const firstRoot = path.resolve(firstProjectRoot);
    const secondRoot = path.resolve(secondProjectRoot);

    const staleBeforeReindex = database.prepare(`
      SELECT id
      FROM files
      WHERE root_path = ? AND path = ?
    `).get(firstRoot, path.join("src", "obsolete.ts")) as
      | { id: number | bigint }
      | undefined;

    expect(staleBeforeReindex).toBeDefined();
    const staleFileId = Number(staleBeforeReindex?.id ?? -1);
    expect(staleFileId).toBeGreaterThan(0);

    const staleChunkCountBefore = database.prepare(`
      SELECT COUNT(*) AS total
      FROM chunks
      WHERE file_id = ?
    `).get(staleFileId) as { total: number | bigint };

    expect(Number(staleChunkCountBefore.total)).toBe(1);

    await rm(deletedPath);
    const reindexResult = await indexProject(firstProjectRoot);

    expect(reindexResult).toEqual({ filesCount: 1, chunksCount: 1 });

    const firstProjectFiles = database.prepare(`
      SELECT path
      FROM files
      WHERE root_path = ?
      ORDER BY path
    `).all(firstRoot) as Array<{ path: string }>;

    expect(firstProjectFiles.map((file) => file.path)).toEqual([
      path.join("src", "retained.ts")
    ]);

    const secondProjectFiles = database.prepare(`
      SELECT path
      FROM files
      WHERE root_path = ?
      ORDER BY path
    `).all(secondRoot) as Array<{ path: string }>;

    expect(secondProjectFiles.map((file) => file.path)).toEqual([
      path.join("src", "obsolete.ts")
    ]);

    const staleChunkCountAfter = database.prepare(`
      SELECT COUNT(*) AS total
      FROM chunks
      WHERE file_id = ?
    `).get(staleFileId) as { total: number | bigint };

    expect(Number(staleChunkCountAfter.total)).toBe(0);
  });
});
