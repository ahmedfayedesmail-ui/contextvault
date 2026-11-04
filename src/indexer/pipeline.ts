import { scanProject, chunkFile } from "./fileWatcher";
import { generateEmbedding } from "./embedder";
import { saveIndexedData } from "../storage/vectors";
import type { ProjectFile } from "../types";

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
    const embeddings: number[][] = [];

    onProgress?.({
      stage: "embedding",
      totalFiles: files.length,
      completedFiles,
      totalChunks,
      completedChunks,
      currentFile: file.path
    });

    for (const chunk of chunks) {
      embeddings.push(await generateEmbedding(chunk.content));
    }

    // Commit a complete file atomically instead of retaining the whole
    // project's embeddings in memory until the final file is processed.
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
  const embeddings: number[][] = [];

  for (const chunk of chunks) {
    embeddings.push(await generateEmbedding(chunk.content));
  }

  saveIndexedData([file], chunks, embeddings);
}
