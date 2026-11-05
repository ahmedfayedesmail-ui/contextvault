import { scanProject, chunkFile } from "./fileWatcher";
import { generateEmbeddingBatch } from "./embedder";
import { saveIndexedData } from "../storage/vectors";
import type { ProjectFile } from "../types";

const EMBEDDING_BATCH_SIZE = 16;

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

async function embedChunksInBatches(
  chunks: ReturnType<typeof chunkFile>,
  onBatchComplete?: (completedInFile: number) => void
): Promise<number[][]> {
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

    const batchEmbeddings = await generateEmbeddingBatch(
      batch.map((chunk) => chunk.content)
    );

    if (batchEmbeddings.length !== batch.length) {
      throw new Error(
        `Embedding batch returned ${batchEmbeddings.length} vectors for ${batch.length} chunks.`
      );
    }

    embeddings.push(...batchEmbeddings);
    onBatchComplete?.(embeddings.length);
  }

  return embeddings;
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

  console.info(`[ContextVault] Starting indexing: ${rootPath}`);

  const files = await scanProject(rootPath);
  const totalChunks = files.reduce(
    (total, file) => total + chunkFile(file).length,
    0
  );

  let completedFiles = 0;
  let completedChunks = 0;

  console.info(`[ContextVault] Found ${files.length} files.`);
  console.info(`[ContextVault] Generated ${totalChunks} chunks.`);
  console.info(
    `[ContextVault] Embedding batch size: ${EMBEDDING_BATCH_SIZE} chunks per Ollama request.`
  );

  onProgress?.({
    stage: "embedding",
    totalFiles: files.length,
    completedFiles,
    totalChunks,
    completedChunks,
    currentFile: null
  });

  for (const file of files) {
    const chunks = chunkFile(file);
    let completedChunksInFile = 0;

    onProgress?.({
      stage: "embedding",
      totalFiles: files.length,
      completedFiles,
      totalChunks,
      completedChunks,
      currentFile: file.path
    });

    const embeddings = await embedChunksInBatches(
      chunks,
      (fileBatchProgress) => {
        completedChunksInFile = fileBatchProgress;
        onProgress?.({
          stage: "embedding",
          totalFiles: files.length,
          completedFiles,
          totalChunks,
          completedChunks: completedChunks + completedChunksInFile,
          currentFile: file.path
        });
      }
    );

    // Commit each complete file atomically. A failed batch does not persist
    // a partially embedded version of the current file.
    saveIndexedData([file], chunks, embeddings);

    completedFiles++;
    completedChunks += chunks.length;

    onProgress?.({
      stage: "embedding",
      totalFiles: files.length,
      completedFiles,
      totalChunks,
      completedChunks,
      currentFile: file.path
    });

    console.info(
      `[ContextVault] Saved ${completedFiles}/${files.length} files; ` +
      `${completedChunks}/${totalChunks} chunks`
    );
  }

  console.info("[ContextVault] Indexing completed successfully.");

  return {
    filesCount: files.length,
    chunksCount: completedChunks
  };
}

export async function indexSingleFile(
  file: ProjectFile
): Promise<void> {
  const chunks = chunkFile(file);
  const embeddings = await embedChunksInBatches(chunks);
  saveIndexedData([file], chunks, embeddings);
}
