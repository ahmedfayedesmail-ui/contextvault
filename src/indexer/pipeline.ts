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

interface FileEmbeddingState {
  file: ProjectFile;
  chunks: ReturnType<typeof chunkFile>;
  embeddings: number[][];
  completedChunks: number;
}

async function embedChunksInBatches(
  chunks: ReturnType<typeof chunkFile>
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
  const fileStates: FileEmbeddingState[] = files.map((file) => ({
    file,
    chunks: chunkFile(file),
    embeddings: [],
    completedChunks: 0
  }));

  const totalChunks = fileStates.reduce(
    (total, state) => total + state.chunks.length,
    0
  );

  let completedFiles = 0;
  let completedChunks = 0;
  let nextFileToPersist = 0;

  console.info(`[ContextVault] Found ${files.length} files.`);
  console.info(`[ContextVault] Generated ${totalChunks} chunks.`);
  console.info(
    `[ContextVault] Embedding batch size: up to ${EMBEDDING_BATCH_SIZE} chunks per Ollama request, combined across file boundaries.`
  );

  onProgress?.({
    stage: "embedding",
    totalFiles: files.length,
    completedFiles,
    totalChunks,
    completedChunks,
    currentFile: null
  });

  // Flatten only chunk references, not source content. This allows small files
  // to share a full 16-chunk Ollama request instead of issuing one request per
  // file. Each file is still persisted atomically after all its chunks finish.
  const workItems = fileStates.flatMap((state, fileIndex) =>
    state.chunks.map((chunk) => ({
      fileIndex,
      chunk
    }))
  );

  const persistCompletedFiles = (): void => {
    while (nextFileToPersist < fileStates.length) {
      const state = fileStates[nextFileToPersist];

      if (state.completedChunks !== state.chunks.length) {
        break;
      }

      saveIndexedData(
        [state.file],
        state.chunks,
        state.embeddings
      );

      completedFiles++;
      console.info(
        `[ContextVault] Saved ${completedFiles}/${files.length} files; ` +
        `${completedChunks}/${totalChunks} chunks`
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

    const batchEmbeddings = await generateEmbeddingBatch(
      batch.map((item) => item.chunk.content)
    );

    if (batchEmbeddings.length !== batch.length) {
      throw new Error(
        `Embedding batch returned ${batchEmbeddings.length} vectors for ${batch.length} chunks.`
      );
    }

    for (let index = 0; index < batch.length; index++) {
      const item = batch[index];
      const state = fileStates[item.fileIndex];

      state.embeddings.push(batchEmbeddings[index]);
      state.completedChunks++;
    }

    completedChunks += batch.length;

    const lastItem = batch[batch.length - 1];
    const currentFile = lastItem
      ? fileStates[lastItem.fileIndex].file.path
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
