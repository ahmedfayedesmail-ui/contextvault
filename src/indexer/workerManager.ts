import { Worker } from "node:worker_threads";
import path from "node:path";

import { resolvedDatabasePath } from "../storage/db";
import {
  generateEmbeddingBatch,
  type EmbeddingTask
} from "./embedder";
import type {
  IndexProjectProgress,
  IndexProjectResult
} from "./pipeline";

export type IndexProgressHandler = (
  progress: IndexProjectProgress
) => void;

interface WorkerMessage {
  type: "progress" | "completed" | "failed" | "embedding-request";
  progress?: IndexProjectProgress;
  result?: IndexProjectResult;
  error?: string;
  requestId?: string;
  texts?: string[];
  filePaths?: string[];
  task?: EmbeddingTask;
}

interface WorkerEmbeddingResponse {
  type: "embedding-response";
  requestId: string;
  embeddings?: Array<number[] | null>;
  error?: string;
  statusCode?: number;
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function getErrorStatusCode(error: unknown): number | undefined {
  if (
    error &&
    typeof error === "object" &&
    "statusCode" in error &&
    typeof error.statusCode === "number"
  ) {
    return error.statusCode;
  }

  return undefined;
}

function getWorkerEntryPath(): string {
  const extension = __filename.endsWith(".ts") ? ".ts" : ".js";
  return path.join(__dirname, "index.worker" + extension);
}

/**
 * Runs full project indexing outside the HTTP event loop.
 *
 * The in-memory database is retained for isolated unit tests and ephemeral
 * deployments because a worker cannot share a SQLite :memory: connection.
 * Normal installations use a file-backed SQLite database and always index
 * in a dedicated worker thread.
 */
export async function runIndexInWorker(
  rootPath: string,
  onProgress?: IndexProgressHandler
): Promise<IndexProjectResult> {
  if (resolvedDatabasePath === ":memory:") {
    const { indexProject } = await import("./pipeline");
    return indexProject(rootPath, onProgress);
  }

  const isTypeScriptSource = __filename.endsWith(".ts");
  const worker = new Worker(getWorkerEntryPath(), {
    workerData: { rootPath },
    ...(isTypeScriptSource
      ? { execArgv: ["--import", "tsx"] }
      : {})
  });

  return new Promise<IndexProjectResult>((resolve, reject) => {
    let settled = false;

    const fail = (error: Error): void => {
      if (settled) {
        return;
      }

      settled = true;
      reject(error);
    };

    worker.on("message", (message: WorkerMessage) => {
      if (
        message.type === "embedding-request" &&
        message.requestId &&
        Array.isArray(message.texts)
      ) {
        void generateEmbeddingBatch(
          message.texts,
          message.filePaths,
          message.task ?? "search_document"
        )
          .then((embeddings) => {
            const response: WorkerEmbeddingResponse = {
              type: "embedding-response",
              requestId: message.requestId!,
              embeddings
            };
            worker.postMessage(response);
          })
          .catch((error: unknown) => {
            const response: WorkerEmbeddingResponse = {
              type: "embedding-response",
              requestId: message.requestId!,
              error: getErrorMessage(error),
              statusCode: getErrorStatusCode(error)
            };
            worker.postMessage(response);
          });
        return;
      }

      if (message.type === "progress" && message.progress) {
        onProgress?.(message.progress);
        return;
      }

      if (message.type === "completed" && message.result) {
        if (!settled) {
          settled = true;
          resolve(message.result);
        }
        return;
      }

      if (message.type === "failed") {
        fail(new Error(message.error || "Index worker failed."));
      }
    });

    worker.on("error", (error: Error) => {
      fail(error);
    });

    worker.on("exit", (code: number) => {
      if (!settled) {
        fail(new Error(
          code === 0
            ? "Index worker exited before returning a result."
            : "Index worker stopped unexpectedly with exit code " + code + "."
        ));
      }
    });
  });
}
