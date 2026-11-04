import "dotenv/config";

const MODEL_NAME = "nomic-embed-text";

interface OllamaEmbedResponse {
  model?: string;
  embeddings?: number[][];
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

  let response: Response;

  try {
    response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: MODEL_NAME,
        input: text
      })
    });
  } catch (error) {
    const details =
      error instanceof Error
        ? error.message
        : String(error);

    throw new Error(
      `Cannot connect to Ollama at ${endpoint}. ` +
      `Make sure Ollama is running and the model ` +
      `${MODEL_NAME} is available. Details: ${details}`,
      { cause: error }
    );
  }

  const responseBody = await response.text();

  if (!response.ok) {
    throw new Error(
      `Ollama returned HTTP ${response.status}. ` +
      `Response: ${responseBody || "No response body"}`
    );
  }

  let data: OllamaEmbedResponse;

  try {
    data = JSON.parse(responseBody) as OllamaEmbedResponse;
  } catch (error) {
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

  return embedding;
}
