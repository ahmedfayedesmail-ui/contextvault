import database from "./db";

import type {
  ProjectFile,
  TextChunk
} from "../types";

// Ensure the embeddings BLOB column exists.
// This also supports databases created in Session 1.

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

export function saveIndexedData(
  files: ProjectFile[],
  chunks: TextChunk[],
  embeddings: number[][]
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
      content,
      mtime,
      size,
      language
    )
    VALUES (?, ?, ?, ?, ?)

    ON CONFLICT(path) DO UPDATE SET
      content = excluded.content,
      mtime = excluded.mtime,
      size = excluded.size,
      language = excluded.language,
      updated_at = CURRENT_TIMESTAMP
  `);

  const findFileId = database.prepare(`
    SELECT id
    FROM files
    WHERE path = ?
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

    // Save files and retrieve their database IDs.

    for (const file of files) {
      upsertFile.run(
        file.path,
        file.content,
        file.mtime.toISOString(),
        file.size,
        file.language
      );

      const row = findFileId.get(
        file.path
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

    // Remove previous chunks for reindexed files.

    for (const fileId of new Set(fileIds.values())) {
      deleteChunks.run(fileId);
    }

    // Save chunks and their embedding vectors.

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
