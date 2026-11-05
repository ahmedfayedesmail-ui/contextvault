import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi
} from "vitest";

import { generateEmbedding } from "../src/indexer/embedder";

const originalOllamaUrl = process.env.OLLAMA_URL;

beforeEach(() => {
  process.env.OLLAMA_URL = "http://localhost:11434";
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();

  if (originalOllamaUrl === undefined) {
    delete process.env.OLLAMA_URL;
  } else {
    process.env.OLLAMA_URL = originalOllamaUrl;
  }
});

describe("generateEmbedding", () => {
  it("should return an embedding array from a valid Ollama response", async () => {
    const expectedEmbedding = [
      0.12,
      0.34,
      0.56,
      0.78
    ];

    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          model: "nomic-embed-text",
          embeddings: [expectedEmbedding]
        }),
        {
          status: 200,
          headers: {
            "Content-Type": "application/json"
          }
        }
      )
    );

    vi.stubGlobal("fetch", fetchMock);

    const result = await generateEmbedding(
      "ContextVault test"
    );

    expect(result).toEqual(expectedEmbedding);

    expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:11434/api/embed",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          model: "nomic-embed-text",
          input: "ContextVault test",
          keep_alive: "30m"
        }),
        signal: expect.any(AbortSignal)
      }
    );
  });

  it("should throw a descriptive error when network connection fails", async () => {
    const fetchMock = vi.fn().mockRejectedValue(
      new TypeError("fetch failed")
    );

    vi.stubGlobal("fetch", fetchMock);

    await expect(
      generateEmbedding("test")
    ).rejects.toThrow(
      "Cannot connect to Ollama"
    );
  });

  it("should throw an error when Ollama returns HTTP 500", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        "Internal Server Error",
        {
          status: 500
        }
      )
    );

    vi.stubGlobal("fetch", fetchMock);

    await expect(
      generateEmbedding("test")
    ).rejects.toThrow(
      /Ollama returned HTTP 500/
    );
  });
});
