import database from "./db";
import path from "node:path";

import type {
  ProjectFile,
  TextChunk
} from "../types";

// Search result structure.

export interface SearchResult {
  filePath: string;
  content: string;
  score: number;
}

export type SearchFilter = "all" | "code" | "docs";

const DOCUMENTATION_EXTENSIONS = new Set([
  ".md",
  ".markdown",
  ".mdx",
  ".rst",
  ".txt",
  ".adoc"
]);

// Ensure the embeddings BLOB column exists.

interface TableColumn {
  name: string;
}

const chunkColumns = database
  .prepare("PRAGMA table_info(chunks)")
  .all() as TableColumn[];

const hasEmbeddingColumn = chunkColumns.some(
  (column) => column.name === "embedding"
);

if (!hasEmbeddingColumn) {
  database.exec(`
    ALTER TABLE chunks
    ADD COLUMN embedding BLOB
  `);
}

interface FileIdRow {
  id: number | bigint;
}

// Save indexed files, chunks, and embeddings.

export function saveIndexedData(
  files: ProjectFile[],
  chunks: TextChunk[],
  embeddings: number[][],
  rootPath: string = ""
): void {

  if (chunks.length !== embeddings.length) {
    throw new Error(
      `Embedding count mismatch: ${embeddings.length} embeddings ` +
      `for ${chunks.length} chunks.`
    );
  }

  const dimensions = embeddings[0]?.length ?? 0;

  for (let index = 0; index < embeddings.length; index++) {
    const embedding = embeddings[index];

    if (
      embedding.length === 0 ||
      embedding.length !== dimensions ||
      !embedding.every(Number.isFinite)
    ) {
      throw new Error(
        `Invalid embedding vector at index ${index}.`
      );
    }
  }

  const filePaths = new Set(
    files.map((file) => file.path)
  );

  for (const chunk of chunks) {
    if (!filePaths.has(chunk.filePath)) {
      throw new Error(
        `Chunk references an unknown file: ${chunk.filePath}`
      );
    }
  }

  const upsertFile = database.prepare(`
    INSERT INTO files (
      path,
      root_path,
      content,
      mtime,
      size,
      language
    )
    VALUES (?, ?, ?, ?, ?, ?)

    ON CONFLICT(root_path, path) DO UPDATE SET
      root_path = excluded.root_path,
      content = excluded.content,
      mtime = excluded.mtime,
      size = excluded.size,
      language = excluded.language,
      updated_at = CURRENT_TIMESTAMP
  `);

  const findFileId = database.prepare(`
    SELECT id
    FROM files
    WHERE path = ? AND root_path = ?
  `);

  const deleteChunks = database.prepare(`
    DELETE FROM chunks
    WHERE file_id = ?
  `);

  const insertChunk = database.prepare(`
    INSERT INTO chunks (
      file_id,
      content,
      start_line,
      end_line,
      chunk_index,
      embedding
    )
    VALUES (?, ?, ?, ?, ?, ?)
  `);

  database.exec("BEGIN IMMEDIATE");

  try {
    const fileIds = new Map<string, number>();

    for (const file of files) {
      upsertFile.run(
        file.path,
        rootPath ? path.resolve(rootPath) : "",
        file.content,
        file.mtime.toISOString(),
        file.size,
        file.language
      );

      const row = findFileId.get(
        file.path,
        rootPath ? path.resolve(rootPath) : ""
      ) as FileIdRow | undefined;

      if (!row) {
        throw new Error(
          `Failed to retrieve database ID for ${file.path}`
        );
      }

      fileIds.set(
        file.path,
        Number(row.id)
      );
    }

    for (const fileId of new Set(fileIds.values())) {
      deleteChunks.run(fileId);
    }

    for (let index = 0; index < chunks.length; index++) {
      const chunk = chunks[index];

      const fileId = fileIds.get(
        chunk.filePath
      );

      if (fileId === undefined) {
        throw new Error(
          `Missing database file ID: ${chunk.filePath}`
        );
      }

      const floatArray = new Float32Array(
        embeddings[index]
      );

      const embeddingBuffer = Buffer.from(
        floatArray.buffer,
        floatArray.byteOffset,
        floatArray.byteLength
      );

      insertChunk.run(
        fileId,
        chunk.content,
        chunk.startLine,
        chunk.endLine,
        chunk.chunkIndex,
        embeddingBuffer
      );
    }

    database.exec("COMMIT");

  } catch (error) {
    database.exec("ROLLBACK");
    throw error;
  }
}


interface ProjectFileRow {
  id: number | bigint;
  path: string;
}

interface ProjectChunkCountRow {
  count: number | bigint;
}

export interface PruneProjectIndexResult {
  deletedFiles: number;
  deletedChunks: number;
}

/**
 * Remove records for files that disappeared from a successfully scanned project.
 * Called only after every current file has been embedded and persisted, so an
 * embedding failure never erases the previous complete index.
 */
export function pruneProjectIndex(
  rootPath: string,
  currentFilePaths: string[]
): PruneProjectIndexResult {
  const normalizedRoot = path.resolve(rootPath);
  const currentPaths = new Set(
    currentFilePaths.map((filePath) => path.normalize(filePath))
  );

  const existingFiles = database.prepare(`
    SELECT id, path
    FROM files
    WHERE root_path = ?
  `).all(normalizedRoot) as ProjectFileRow[];

  const staleFiles = existingFiles.filter(
    (file) => !currentPaths.has(path.normalize(file.path))
  );

  if (staleFiles.length === 0) {
    return { deletedFiles: 0, deletedChunks: 0 };
  }

  const countChunks = database.prepare(`
    SELECT COUNT(*) AS count
    FROM chunks
    WHERE file_id = ?
  `);

  const deleteFile = database.prepare(`
    DELETE FROM files
    WHERE id = ? AND root_path = ?
  `);

  let deletedChunks = 0;
  database.exec("BEGIN IMMEDIATE");

  try {
    for (const file of staleFiles) {
      const chunkCount = countChunks.get(file.id) as
        | ProjectChunkCountRow
        | undefined;
      deletedChunks += Number(chunkCount?.count ?? 0);
      deleteFile.run(file.id, normalizedRoot);
    }

    database.exec("COMMIT");
  } catch (error) {
    database.exec("ROLLBACK");
    throw error;
  }

  console.info(
    `[ContextVault] Removed ${staleFiles.length} stale files and ${deletedChunks} chunks from ${normalizedRoot}.`
  );

  return {
    deletedFiles: staleFiles.length,
    deletedChunks
  };
}

interface ClearIndexCountRow {
  count: number | bigint;
}

export interface ClearIndexResult {
  deletedFiles: number;
  deletedChunks: number;
  vacuumed: boolean;
}

export function clearIndexedData(): ClearIndexResult {
  const filesRow = database.prepare(`
    SELECT COUNT(*) AS count FROM files
  `).get() as ClearIndexCountRow | undefined;

  const chunksRow = database.prepare(`
    SELECT COUNT(*) AS count FROM chunks
  `).get() as ClearIndexCountRow | undefined;

  const deletedFiles = Number(filesRow?.count ?? 0);
  const deletedChunks = Number(chunksRow?.count ?? 0);

  database.exec("BEGIN IMMEDIATE");

  try {
    database.exec("DELETE FROM chunks; DELETE FROM files;");
    database.exec("COMMIT");
  } catch (error) {
    database.exec("ROLLBACK");
    throw error;
  }

  // VACUUM must run outside the delete transaction.
  // The data deletion remains successful even if compaction cannot run.
  let vacuumed = false;

  try {
    database.exec("PRAGMA wal_checkpoint(TRUNCATE);");
    database.exec("VACUUM;");
    vacuumed = true;
  } catch (error) {
    console.warn(
      "[ContextVault] Index cleared, but database compaction failed:",
      error
    );
  }

  return {
    deletedFiles,
    deletedChunks,
    vacuumed
  };
}

// Calculate cosine similarity between two vectors.

export function cosineSimilarity(
  vectorA: number[],
  vectorB: number[]
): number {

  if (vectorA.length !== vectorB.length) {
    throw new Error(
      "Cannot calculate cosine similarity: vector dimensions do not match."
    );
  }

  if (
    vectorA.length === 0 ||
    !vectorA.every(Number.isFinite) ||
    !vectorB.every(Number.isFinite)
  ) {
    throw new Error(
      "Cannot calculate cosine similarity: invalid vector."
    );
  }

  let dotProduct = 0;
  let magnitudeA = 0;
  let magnitudeB = 0;

  for (let index = 0; index < vectorA.length; index++) {
    dotProduct += vectorA[index] * vectorB[index];

    magnitudeA += vectorA[index] ** 2;

    magnitudeB += vectorB[index] ** 2;
  }

  const denominator = Math.sqrt(
    magnitudeA * magnitudeB
  );

  if (denominator === 0) {
    return 0;
  }

  return Math.max(
    -1,
    Math.min(1, dotProduct / denominator)
  );
}

// Decode Float32 embedding from SQLite BLOB.

function decodeEmbedding(
  blob: Uint8Array
): number[] | null {

  if (
    blob.byteLength === 0 ||
    blob.byteLength % Float32Array.BYTES_PER_ELEMENT !== 0
  ) {
    return null;
  }

  const view = new DataView(
    blob.buffer,
    blob.byteOffset,
    blob.byteLength
  );

  const embedding: number[] = [];

  for (
    let offset = 0;
    offset < blob.byteLength;
    offset += Float32Array.BYTES_PER_ELEMENT
  ) {
    const value = view.getFloat32(offset, true);

    if (!Number.isFinite(value)) {
      return null;
    }

    embedding.push(value);
  }

  return embedding;
}

// Search stored vectors and return the best matches.

interface StoredVectorRow {
  content: string;
  filePath: string;
  embedding: Uint8Array;
}

export function searchVectors(
  queryEmbedding: number[],
  limit: number = 5,
  filter: SearchFilter = "all"
): SearchResult[] {

  if (
    queryEmbedding.length === 0 ||
    !queryEmbedding.every(Number.isFinite)
  ) {
    throw new Error(
      "Invalid query embedding."
    );
  }

  const safeLimit = Number.isFinite(limit)
    ? Math.max(0, Math.floor(limit))
    : 5;

  if (safeLimit === 0) {
    return [];
  }

  const rows = database.prepare(`
    SELECT
      chunks.content AS content,
      files.path AS filePath,
      chunks.embedding AS embedding

    FROM chunks

    INNER JOIN files
      ON files.id = chunks.file_id

    WHERE chunks.embedding IS NOT NULL
      AND files.root_path <> ''
  `).all() as StoredVectorRow[];

  const results: SearchResult[] = [];

  for (const row of rows) {
    const extension = path.extname(row.filePath).toLowerCase();
    const isDocumentation = DOCUMENTATION_EXTENSIONS.has(extension);

    if (filter === "code" && isDocumentation) {
      continue;
    }

    if (filter === "docs" && !isDocumentation) {
      continue;
    }

    const storedEmbedding = decodeEmbedding(
      row.embedding
    );

    if (!storedEmbedding) {
      continue;
    }

    if (storedEmbedding.length !== queryEmbedding.length) {
      continue;
    }

    const score = cosineSimilarity(
      queryEmbedding,
      storedEmbedding
    );

    results.push({
      filePath: row.filePath,
      content: row.content,
      score
    });
  }

  results.sort(
    (a, b) => b.score - a.score
  );

  return results.slice(0, safeLimit);
}
