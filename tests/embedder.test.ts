import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi
} from "vitest";

import { generateEmbedding, generateEmbeddingBatch } from "../src/indexer/embedder";

const originalOllamaUrl = process.env.OLLAMA_URL;

beforeEach(() => {
  process.env.OLLAMA_URL = "http://127.0.0.1:11434";
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

describe("generateEmbeddingBatch", () => {
  it("should send multiple texts in one Ollama request and return matching vectors", async () => {
    const expectedEmbeddings = [
      [0.1, 0.2, 0.3],
      [0.4, 0.5, 0.6]
    ];
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          model: "nomic-embed-text",
          embeddings: expectedEmbeddings
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

    const result = await generateEmbeddingBatch([
      "first code chunk",
      "second code chunk"
    ]);

    expect(result).toEqual(expectedEmbeddings);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(
      "http://127.0.0.1:11434/api/embed",
      expect.objectContaining({
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          model: "nomic-embed-text",
          input: [
            "search_document: first code chunk",
            "search_document: second code chunk"
          ],
          keep_alive: "30m",
          truncate: true
        }),
        signal: expect.any(AbortSignal)
      })
    );
  });

  it("should split HTTP 400 EOF batches and skip only the failing chunk", async () => {
    const fetchMock = vi.fn(async (
      _input: RequestInfo | URL,
      init?: RequestInit
    ) => {
      const body = JSON.parse(String(init?.body)) as {
        input: string[];
      };

      if (body.input.includes("bad chunk")) {
        return new Response("EOF", { status: 400 });
      }

      return new Response(
        JSON.stringify({
          model: "nomic-embed-text",
          embeddings: body.input.map((_, index) => [index + 1, 0.5])
        }),
        {
          status: 200,
          headers: {
            "Content-Type": "application/json"
          }
        }
      );
    });
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);

    vi.stubGlobal("fetch", fetchMock);

    const result = await generateEmbeddingBatch(
      ["good before", "bad chunk", "good after"],
      ["src/before.ts", "src/broken.ts", "src/after.ts"]
    );

    expect(result).toEqual([
      [1, 0.5],
      null,
      [1, 0.5]
    ]);
    expect(fetchMock).toHaveBeenCalledTimes(5);
    expect(consoleError).toHaveBeenCalledWith(
      expect.stringContaining(
        "Failed to embed chunk from src/broken.ts: Ollama returned HTTP 400. Response: EOF"
      )
    );
  });

  it("should reject an empty batch without calling Ollama", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await expect(generateEmbeddingBatch([])).rejects.toThrow(
      "provide at least one input text"
    );

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("should reject a response containing a different number of vectors", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          model: "nomic-embed-text",
          embeddings: [[0.1, 0.2]]
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

    await expect(
      generateEmbeddingBatch(["first", "second"])
    ).rejects.toThrow(
      "Ollama returned 1 embeddings for 2 input texts"
    );
  });
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
      "http://127.0.0.1:11434/api/embed",
      expect.objectContaining({
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          model: "nomic-embed-text",
          input: ["search_query: ContextVault test"],
          keep_alive: "30m",
          truncate: true
        }),
        signal: expect.any(AbortSignal)
      })
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
