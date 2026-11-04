import { scanProject, chunkFile } from "./fileWatcher";

import { generateEmbedding } from "./embedder";

import { saveIndexedData } from "../storage/vectors";

import type {
  ProjectFile,
  TextChunk
} from "../types";

export interface IndexProjectResult {
  filesCount: number;
  chunksCount: number;
}

export async function indexProject(
  rootPath: string
): Promise<IndexProjectResult> {

  console.info(
    `[ContextVault] Starting indexing: ${rootPath}`
  );

  // Step 1: Scan the project.

  const files = await scanProject(rootPath);

  console.info(
    `[ContextVault] Found ${files.length} files.`
  );

  // Step 2: Split files into chunks.

  const chunks: TextChunk[] = files.flatMap(
    (file) => chunkFile(file)
  );

  console.info(
    `[ContextVault] Generated ${chunks.length} chunks.`
  );

  // Step 3: Generate embeddings sequentially.

  const embeddings: number[][] = [];

  for (let index = 0; index < chunks.length; index++) {
    const chunk = chunks[index];

    const embedding = await generateEmbedding(
      chunk.content
    );

    embeddings.push(embedding);

    const embeddedCount = index + 1;

    if (embeddedCount % 10 === 0) {
      console.info(
        `[ContextVault] Embedded ${embeddedCount}/${chunks.length} chunks`
      );
    }
  }

  // Step 4: Persist everything transactionally.

  saveIndexedData(
    files,
    chunks,
    embeddings
  );

  console.info(
    "[ContextVault] Indexing completed successfully."
  );

  console.info(
    `[ContextVault] Files: ${files.length}, Chunks: ${chunks.length}`
  );

  return {
    filesCount: files.length,
    chunksCount: chunks.length
  };
}


export async function indexSingleFile(
  file: ProjectFile
): Promise<void> {
  const chunks = chunkFile(file);
  const embeddings: number[][] = [];

  for (const chunk of chunks) {
    const embedding = await generateEmbedding(
      chunk.content
    );

    embeddings.push(embedding);
  }

  saveIndexedData(
    [file],
    chunks,
    embeddings
  );
}
