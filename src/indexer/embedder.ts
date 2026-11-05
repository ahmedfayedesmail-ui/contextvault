import "dotenv/config";

import { performance } from "node:perf_hooks";

const MODEL_NAME = "nomic-embed-text";
const DEFAULT_TIMEOUT_MS = 120_000;
const DEFAULT_KEEP_ALIVE = "30m";

interface OllamaEmbedResponse {
  model?: string;
  embeddings?: number[][];
  total_duration?: number;
  load_duration?: number;
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

export async function generateEmbedding(
  text: string
): Promise<number[]> {
  if (!text || !text.trim()) {
    throw new Error(
      "Cannot generate embedding: input text is empty."
    );
  }

  const baseUrl = (
    process.env.OLLAMA_URL ??
    "http://localhost:11434"
  ).replace(/\/+$/, "");

  const endpoint = `${baseUrl}/api/embed`;
  const timeoutMs = getEmbeddingTimeoutMs();
  const keepAlive = process.env.OLLAMA_KEEP_ALIVE?.trim() || DEFAULT_KEEP_ALIVE;
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
        input: text,
        keep_alive: keepAlive
      }),
      signal: AbortSignal.timeout(timeoutMs)
    });
  } catch (error) {
    const elapsedMs = (performance.now() - startedAt).toFixed(1);
    const details =
      error instanceof Error
        ? error.message
        : String(error);

    if (error instanceof Error && error.name === "TimeoutError") {
      console.error(
        `[ContextVault] Ollama embedding timed out after ${elapsedMs}ms ` +
        `(configured timeout: ${timeoutMs}ms, model: ${MODEL_NAME}).`
      );
      throw new Error(
        `Ollama embedding request timed out after ${timeoutMs}ms at ${endpoint}. ` +
        "Check that Ollama is running and increase OLLAMA_EMBED_TIMEOUT_MS if needed.",
        { cause: error }
      );
    }

    console.error(
      `[ContextVault] Ollama embedding request failed after ${elapsedMs}ms: ${details}`
    );
    throw new Error(
      `Cannot connect to Ollama at ${endpoint}. ` +
      `Make sure Ollama is running and the model ${MODEL_NAME} is available. ` +
      `Details: ${details}`,
      { cause: error }
    );
  }

  let responseBody: string;

  try {
    responseBody = await response.text();
  } catch (error) {
    const elapsedMs = (performance.now() - startedAt).toFixed(1);
    console.error(
      `[ContextVault] Could not read Ollama response after ${elapsedMs}ms.`
    );
    throw new Error("Could not read Ollama's embedding response.", { cause: error });
  }

  const elapsedMs = performance.now() - startedAt;

  if (!response.ok) {
    console.error(
      `[ContextVault] Ollama embedding failed with HTTP ${response.status} ` +
      `after ${elapsedMs.toFixed(1)}ms.`
    );
    throw new Error(
      `Ollama returned HTTP ${response.status}. ` +
      `Response: ${responseBody || "No response body"}`
    );
  }

  let data: OllamaEmbedResponse;

  try {
    data = JSON.parse(responseBody) as OllamaEmbedResponse;
  } catch (error) {
    console.error(
      `[ContextVault] Ollama returned invalid JSON after ${elapsedMs.toFixed(1)}ms.`
    );
    throw new Error(
      `Ollama returned an invalid JSON response: ${responseBody}`,
      { cause: error }
    );
  }

  if (
    !Array.isArray(data.embeddings) ||
    !Array.isArray(data.embeddings[0])
  ) {
    throw new Error(
      "Invalid Ollama response: expected embeddings as a nested array."
    );
  }

  const embedding = data.embeddings[0];

  if (
    embedding.length === 0 ||
    !embedding.every(
      (value) =>
        typeof value === "number" &&
        Number.isFinite(value)
    )
  ) {
    throw new Error(
      "Ollama returned an invalid or empty embedding vector."
    );
  }

  const apiLoadMs = nanosecondsToMilliseconds(data.load_duration);
  const apiTotalMs = nanosecondsToMilliseconds(data.total_duration);
  const metrics = [
    apiLoadMs === null ? null : `model_load=${apiLoadMs}ms`,
    apiTotalMs === null ? null : `ollama_total=${apiTotalMs}ms`
  ].filter(Boolean).join(", ");

  console.info(
    `[ContextVault] Embedding completed in ${elapsedMs.toFixed(1)}ms ` +
    `(model=${MODEL_NAME}${metrics ? `, ${metrics}` : ""}, keep_alive=${keepAlive}).`
  );

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
    console.info(
      `[ContextVault] Ollama embedding model warm-up completed in ` +
      `${(performance.now() - startedAt).toFixed(1)}ms.`
    );
  } catch (error) {
    console.warn(
      "[ContextVault] Ollama model warm-up was skipped; the model will load on the first embedding request.",
      error
    );
  }
}
