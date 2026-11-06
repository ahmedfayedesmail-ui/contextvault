import { scanProject, chunkFile, countProjectFiles } from "./fileWatcher";
import { generateEmbeddingBatch } from "./embedder";
import { pruneProjectIndex, saveIndexedData } from "../storage/vectors";
import path from "node:path";
import type { ProjectFile } from "../types";
import { enforceFreeFileLimit } from "../billing/entitlements";

const EMBEDDING_BATCH_SIZE = 8;

export interface IndexProjectResult {
  filesCount: number;
  chunksCount: number;
}

export interface IndexProjectProgress {
  stage: "scanning" | "embedding";
  totalFiles: number;
  completedFiles: number;
  totalChunks: number;
  completedChunks: number;
  currentFile: string | null;
}

export type IndexProgressCallback = (
  progress: IndexProjectProgress
) => void;

interface FileEmbeddingState {
  file: ProjectFile;
  chunks: ReturnType<typeof chunkFile>;
  indexedChunks: ReturnType<typeof chunkFile>;
  embeddings: number[][];
  completedChunks: number;
}

interface EmbeddedChunkBatch {
  chunks: ReturnType<typeof chunkFile>;
  embeddings: number[][];
}

async function embedChunksInBatches(
  chunks: ReturnType<typeof chunkFile>
): Promise<EmbeddedChunkBatch> {
  const indexedChunks: ReturnType<typeof chunkFile> = [];
  const embeddings: number[][] = [];

  for (
    let offset = 0;
    offset < chunks.length;
    offset += EMBEDDING_BATCH_SIZE
  ) {
    const batch = chunks.slice(
      offset,
      offset + EMBEDDING_BATCH_SIZE
    );

    const batchResults = await generateEmbeddingBatch(
      batch.map((chunk) => chunk.embeddingText ?? chunk.content),
      batch.map((chunk) => chunk.filePath)
    );

    if (batchResults.length !== batch.length) {
      throw new Error(
        "Embedding batch returned " + batchResults.length +
        " results for " + batch.length + " chunks."
      );
    }

    for (let index = 0; index < batch.length; index++) {
      const embedding = batchResults[index];

      if (embedding === null) {
        continue;
      }

      if (!embedding) {
        throw new Error("Ollama returned an incomplete embedding batch.");
      }

      indexedChunks.push(batch[index]);
      embeddings.push(embedding);
    }
  }

  return {
    chunks: indexedChunks,
    embeddings
  };
}

export async function indexProject(
  rootPath: string,
  onProgress?: IndexProgressCallback
): Promise<IndexProjectResult> {
  onProgress?.({
    stage: "scanning",
    totalFiles: 0,
    completedFiles: 0,
    totalChunks: 0,
    completedChunks: 0,
    currentFile: null
  });

  const normalizedRoot = path.resolve(rootPath);
  console.info("[ContextVault] Starting indexing: " + normalizedRoot);

  const eligibleFileCount = await countProjectFiles(normalizedRoot, 1_001);
  enforceFreeFileLimit(eligibleFileCount);

  const files = await scanProject(normalizedRoot);
  // Re-check the materialized scan result to close the race between counting
  // directory entries and reading file contents.
  enforceFreeFileLimit(files.length);

  const fileStates: FileEmbeddingState[] = files.map((file) => ({
    file,
    chunks: chunkFile(file),
    indexedChunks: [],
    embeddings: [],
    completedChunks: 0
  }));

  const totalChunks = fileStates.reduce(
    (total, state) => total + state.chunks.length,
    0
  );

  let completedFiles = 0;
  let completedChunks = 0;
  let successfulChunks = 0;
  let skippedChunks = 0;
  let nextFileToPersist = 0;

  console.info("[ContextVault] Found " + files.length + " files.");
  console.info("[ContextVault] Generated " + totalChunks + " chunks.");
  console.info(
    "[ContextVault] Embedding batch size: up to " +
    EMBEDDING_BATCH_SIZE +
    " chunks per Ollama request, combined across file boundaries."
  );

  onProgress?.({
    stage: "embedding",
    totalFiles: files.length,
    completedFiles,
    totalChunks,
    completedChunks,
    currentFile: null
  });

  // Flatten only chunk references, not source content. Each file is still
  // persisted atomically after all of its chunks have been attempted.
  const workItems = fileStates.flatMap((state, fileIndex) =>
    state.chunks.map((chunk) => ({
      fileIndex,
      chunk
    }))
  );

  const persistCompletedFiles = (): void => {
    while (nextFileToPersist < fileStates.length) {
      const state = fileStates[nextFileToPersist];

      if (!state || state.completedChunks !== state.chunks.length) {
        break;
      }

      if (state.chunks.length === 0 || state.indexedChunks.length > 0) {
        saveIndexedData(
          [state.file],
          state.indexedChunks,
          state.embeddings,
          normalizedRoot
        );
      } else {
        // Preserve any previous complete index entry when every chunk in
        // this file failed, rather than replacing it with an empty file.
        console.warn(
          "[ContextVault] Preserved the previous index for " +
          state.file.path +
          " because none of its chunks could be embedded."
        );
      }

      completedFiles++;
      console.info(
        "[ContextVault] Processed " + completedFiles + "/" +
        files.length + " files; " + successfulChunks + "/" +
        totalChunks + " chunks embedded, " + skippedChunks + " skipped."
      );

      nextFileToPersist++;
    }
  };

  // Persist zero-chunk files in scan order without making an empty Ollama call.
  persistCompletedFiles();

  for (
    let offset = 0;
    offset < workItems.length;
    offset += EMBEDDING_BATCH_SIZE
  ) {
    const batch = workItems.slice(
      offset,
      offset + EMBEDDING_BATCH_SIZE
    );

    const batchResults = await generateEmbeddingBatch(
      batch.map((item) => item.chunk.embeddingText ?? item.chunk.content),
      batch.map((item) => item.chunk.filePath)
    );

    if (batchResults.length !== batch.length) {
      throw new Error(
        "Embedding batch returned " + batchResults.length +
        " results for " + batch.length + " chunks."
      );
    }

    for (let index = 0; index < batch.length; index++) {
      const item = batch[index];
      const state = fileStates[item.fileIndex];
      const embedding = batchResults[index];

      if (!state) {
        throw new Error("Embedding batch referenced an unknown project file.");
      }

      state.completedChunks++;

      if (embedding === null) {
        skippedChunks++;
        continue;
      }

      if (!embedding) {
        throw new Error("Ollama returned an incomplete embedding batch.");
      }

      state.indexedChunks.push(item.chunk);
      state.embeddings.push(embedding);
      successfulChunks++;
    }

    completedChunks += batch.length;

    const lastItem = batch[batch.length - 1];
    const currentFile = lastItem
      ? fileStates[lastItem.fileIndex]?.file.path ?? null
      : null;

    // Keep the existing per-file atomic persistence boundary even though
    // embedding batches may contain chunks from multiple files.
    persistCompletedFiles();

    onProgress?.({
      stage: "embedding",
      totalFiles: files.length,
      completedFiles,
      totalChunks,
      completedChunks,
      currentFile
    });
  }

  // This also handles the empty-project case and any trailing zero-chunk files.
  persistCompletedFiles();

  // Prune stale paths only after every current file has been processed. A
  // file whose chunks all failed is left out of persistence, preserving its
  // previously stored index entry if one exists.
  const pruneResult = pruneProjectIndex(
    normalizedRoot,
    files.map((file) => file.path)
  );

  console.info(
    "[ContextVault] Stale-file cleanup completed: " +
    pruneResult.deletedFiles + " files, " +
    pruneResult.deletedChunks + " chunks removed."
  );
  console.info(
    "[ContextVault] Indexing completed successfully. Embedded " +
    successfulChunks + " chunks; skipped " + skippedChunks + "."
  );

  return {
    filesCount: files.length,
    chunksCount: successfulChunks
  };
}

export async function indexSingleFile(
  file: ProjectFile,
  rootPath: string
): Promise<void> {
  const chunks = chunkFile(file);
  const result = await embedChunksInBatches(chunks);

  if (chunks.length > 0 && result.chunks.length === 0) {
    console.warn(
      "[ContextVault] Preserved the previous index for " +
      file.path +
      " because none of its chunks could be embedded."
    );
    return;
  }

  saveIndexedData(
    [file],
    result.chunks,
    result.embeddings,
    path.resolve(rootPath)
  );
}
