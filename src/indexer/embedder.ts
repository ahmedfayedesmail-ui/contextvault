import "dotenv/config";

import { appendFile, mkdir } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { performance } from "node:perf_hooks";

const MODEL_NAME = "nomic-embed-text";
const DEFAULT_TIMEOUT_MS = 120_000;
const DEFAULT_KEEP_ALIVE = "30m";

export type EmbeddingTask = "search_document" | "search_query";

interface OllamaEmbedResponse {
  model?: string;
  embeddings?: number[][];
  total_duration?: number;
  load_duration?: number;
}

class OllamaHttpError extends Error {
  constructor(
    readonly status: number,
    readonly responseBody: string
  ) {
    super(
      "Ollama returned HTTP " + status + ". Response: " +
      (responseBody || "No response body")
    );
    this.name = "OllamaHttpError";
  }
}

function getEmbeddingTimeoutMs(): number {
  const configured = Number(process.env.OLLAMA_EMBED_TIMEOUT_MS);
  return Number.isFinite(configured) && configured >= 1_000
    ? Math.floor(configured)
    : DEFAULT_TIMEOUT_MS;
}

function nanosecondsToMilliseconds(value?: number): string | null {
  if (!Number.isFinite(value) || value === undefined) {
    return null;
  }

  return (value / 1_000_000).toFixed(1);
}

function getLogDirectory(): string {
  if (process.env.CONTEXTVAULT_LOG_DIR) {
    return process.env.CONTEXTVAULT_LOG_DIR;
  }

  if (process.env.LOCALAPPDATA) {
    return join(process.env.LOCALAPPDATA, "ContextVault", "logs");
  }

  if (process.platform === "darwin") {
    return join(homedir(), "Library", "Logs", "ContextVault");
  }

  return join(homedir(), ".local", "state", "contextvault", "logs");
}

function logEmbeddingDiagnostic(
  level: "info" | "warn" | "error",
  message: string
): void {
  const line = "[ContextVault] " + message;

  if (level === "error") {
    console.error(line);
  } else if (level === "warn") {
    console.warn(line);
  } else {
    console.info(line);
  }

  // The Windows desktop launcher can hide the server console. Persisting
  // diagnostics makes timing and timeout information available for support.
  if (process.env.NODE_ENV === "test") {
    return;
  }

  const logDirectory = getLogDirectory();
  const logPath = join(logDirectory, "embedding.log");
  const logLine = new Date().toISOString() + " " + line + "\n";

  void mkdir(logDirectory, { recursive: true })
    .then(() => appendFile(logPath, logLine, "utf8"))
    .catch((error: unknown) => {
      const details = error instanceof Error ? error.message : String(error);
      console.warn(
        "[ContextVault] Could not write the embedding diagnostic log:",
        details
      );
    });
}

function validateEmbeddingVector(
  value: unknown,
  index: number
): number[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new Error(
      "Invalid Ollama response: embedding at index " + index +
      " is missing or empty."
    );
  }

  if (
    !value.every(
      (item) => typeof item === "number" && Number.isFinite(item)
    )
  ) {
    throw new Error(
      "Invalid Ollama response: embedding at index " + index +
      " contains a non-finite value."
    );
  }

  return value as number[];
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function isRetryableEofBadRequest(error: unknown): error is OllamaHttpError {
  return error instanceof OllamaHttpError &&
    error.status === 400 &&
    /\bEOF\b/i.test(error.responseBody);
}

/**
 * Makes one Ollama request for the supplied text batch.
 */
async function requestEmbeddingBatch(
  texts: string[],
  endpoint: string,
  timeoutMs: number,
  keepAlive: string
): Promise<number[][]> {
  const startedAt = performance.now();
  let response: Response;

  try {
    response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: MODEL_NAME,
        input: texts,
        keep_alive: keepAlive,
        truncate: true
      }),
      signal: AbortSignal.timeout(timeoutMs)
    });
  } catch (error) {
    const elapsedMs = (performance.now() - startedAt).toFixed(1);
    const details = getErrorMessage(error);

    if (error instanceof Error && error.name === "TimeoutError") {
      logEmbeddingDiagnostic(
        "error",
        "Ollama embedding batch timed out after " + elapsedMs +
        "ms (items=" + texts.length +
        ", configured timeout=" + timeoutMs +
        "ms, model=" + MODEL_NAME + ")."
      );
      throw new Error(
        "Ollama embedding request timed out after " + timeoutMs +
        "ms at " + endpoint + ". " +
        "Check that Ollama is running and increase OLLAMA_EMBED_TIMEOUT_MS if needed.",
        { cause: error }
      );
    }

    logEmbeddingDiagnostic(
      "error",
      "Ollama embedding batch request failed after " + elapsedMs +
      "ms (items=" + texts.length + "): " + details
    );
    throw new Error(
      "Cannot connect to Ollama at " + endpoint + ". " +
      "Make sure Ollama is running and the model " + MODEL_NAME +
      " is available. Details: " + details,
      { cause: error }
    );
  }

  let responseBody: string;

  try {
    responseBody = await response.text();
  } catch (error) {
    const elapsedMs = (performance.now() - startedAt).toFixed(1);
    logEmbeddingDiagnostic(
      "error",
      "Could not read Ollama embedding response after " + elapsedMs +
      "ms (items=" + texts.length + ")."
    );
    throw new Error(
      "Could not read Ollama's embedding response.",
      { cause: error }
    );
  }

  const elapsedMs = performance.now() - startedAt;

  if (!response.ok) {
    logEmbeddingDiagnostic(
      "error",
      "Ollama embedding batch failed with HTTP " + response.status +
      " after " + elapsedMs.toFixed(1) + "ms (items=" + texts.length + ")."
    );
    throw new OllamaHttpError(response.status, responseBody);
  }

  let data: OllamaEmbedResponse;

  try {
    data = JSON.parse(responseBody) as OllamaEmbedResponse;
  } catch (error) {
    logEmbeddingDiagnostic(
      "error",
      "Ollama returned invalid JSON after " + elapsedMs.toFixed(1) +
      "ms (items=" + texts.length + ")."
    );
    throw new Error(
      "Ollama returned an invalid JSON response: " + responseBody,
      { cause: error }
    );
  }

  if (!Array.isArray(data.embeddings)) {
    throw new Error(
      "Invalid Ollama response: expected embeddings to be an array."
    );
  }

  if (data.embeddings.length !== texts.length) {
    throw new Error(
      "Ollama returned " + data.embeddings.length +
      " embeddings for " + texts.length + " input texts."
    );
  }

  const embeddings = data.embeddings.map((value, index) =>
    validateEmbeddingVector(value, index)
  );
  const apiLoadMs = nanosecondsToMilliseconds(data.load_duration);
  const apiTotalMs = nanosecondsToMilliseconds(data.total_duration);
  const metrics = [
    apiLoadMs === null ? null : "model_load=" + apiLoadMs + "ms",
    apiTotalMs === null ? null : "ollama_total=" + apiTotalMs + "ms"
  ].filter(Boolean).join(", ");

  const operationLabel = texts.length === 1
    ? "Embedding completed"
    : "Embedding batch completed (items=" + texts.length + ")";

  logEmbeddingDiagnostic(
    "info",
    operationLabel + " in " + elapsedMs.toFixed(1) +
    "ms (model=" + MODEL_NAME +
    (metrics ? ", " + metrics : "") +
    ", keep_alive=" + keepAlive + ")."
  );

  return embeddings;
}

/**
 * Generates embeddings for a batch. HTTP 400 responses containing EOF are
 * retried by recursively splitting the batch. A single irrecoverable chunk is
 * returned as null so indexing can continue with the remaining chunks.
 *
 * filePaths is positional metadata used to identify a skipped source chunk.
 */
export async function generateEmbeddingBatch(
  texts: string[],
  filePaths?: string[],
  task: EmbeddingTask = "search_document"
): Promise<Array<number[] | null>> {
  if (!Array.isArray(texts) || texts.length === 0) {
    throw new Error(
      "Cannot generate embeddings: provide at least one input text."
    );
  }

  if (texts.some((text) => typeof text !== "string" || !text.trim())) {
    throw new Error(
      "Cannot generate embeddings: every input text must be a non-empty string."
    );
  }

  if (filePaths !== undefined && filePaths.length !== texts.length) {
    throw new Error(
      "Cannot generate embeddings: filePaths must match the number of input texts."
    );
  }

  const baseUrl = (
    process.env.OLLAMA_URL ??
    "http://127.0.0.1:11434"
  ).replace(/\/+$/, "");

  const endpoint = baseUrl + "/api/embed";
  const timeoutMs = getEmbeddingTimeoutMs();
  const keepAlive = process.env.OLLAMA_KEEP_ALIVE?.trim() || DEFAULT_KEEP_ALIVE;
  const embeddings: Array<number[] | null> = new Array(texts.length).fill(null);

  const embedRange = async (
    start: number,
    end: number
  ): Promise<void> => {
    const batch = texts
      .slice(start, end)
      .map((text) => task + ": " + text);

    try {
      const batchEmbeddings = await requestEmbeddingBatch(
        batch,
        endpoint,
        timeoutMs,
        keepAlive
      );

      for (let index = 0; index < batchEmbeddings.length; index++) {
        embeddings[start + index] = batchEmbeddings[index];
      }
    } catch (error) {
      if (!isRetryableEofBadRequest(error)) {
        throw error;
      }

      if (batch.length === 1) {
        const filePath = filePaths?.[start] ?? "<non-file input>";
        logEmbeddingDiagnostic(
          "error",
          "Failed to embed chunk from " + filePath + ": " +
          getErrorMessage(error)
        );
        return;
      }

      const midpoint = start + Math.floor(batch.length / 2);
      logEmbeddingDiagnostic(
        "warn",
        "Ollama returned HTTP 400 with EOF for a batch of " +
        batch.length + " chunks; retrying as batches of " +
        (midpoint - start) + " and " + (end - midpoint) + "."
      );

      await embedRange(start, midpoint);
      await embedRange(midpoint, end);
    }
  };

  await embedRange(0, texts.length);
  return embeddings;
}

export async function generateEmbedding(
  text: string
): Promise<number[]> {
  const embeddings = await generateEmbeddingBatch(
    [text],
    undefined,
    "search_query"
  );
  const embedding = embeddings[0];

  if (!embedding) {
    throw new Error("Ollama did not return an embedding for the input text.");
  }

  return embedding;
}

/**
 * Loads the local embedding model during application startup so the first
 * user search does not pay the full model-load cost.
 *
 * This is deliberately non-fatal: the app can still start when Ollama is
 * unavailable, and the first embedding request will report the actionable
 * error to the user.
 */
export async function warmupEmbeddingModel(): Promise<void> {
  const startedAt = performance.now();

  try {
    await generateEmbedding("ContextVault startup warm-up");
    logEmbeddingDiagnostic(
      "info",
      "Ollama embedding model warm-up completed in " +
      (performance.now() - startedAt).toFixed(1) + "ms."
    );
  } catch (error) {
    logEmbeddingDiagnostic(
      "warn",
      "Ollama model warm-up was skipped; the model will load on the first embedding request. " +
      getErrorMessage(error)
    );
  }
}
