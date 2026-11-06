export interface HealthResponse {
  status: "ok";
  version: string;
}

export interface ProjectFile {
  path: string;
  content: string;
  mtime: Date;
  size: number;
  language: string;
}

export interface TextChunk {
  filePath: string;
  content: string;
  /** Enriched text used only to generate the embedding; source content stays unchanged. */
  embeddingText?: string;
  startLine: number;
  endLine: number;
  chunkIndex: number;
}

export interface ScannedFile {
  path: string;
  mtime: Date;
  size: number;
  language: string;
}
