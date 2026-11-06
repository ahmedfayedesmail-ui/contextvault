import {
  afterAll,
  beforeAll,
  describe,
  expect,
  it
} from "vitest";

import { createServer, type Server } from "node:http";
import { once } from "node:events";
import request from "supertest";
import type { Express } from "express";
import type { DatabaseSync } from "node:sqlite";

let app: Express;
let database: DatabaseSync;
let ollamaServer: Server;
let originalDatabasePath: string | undefined;
let originalOllamaUrl: string | undefined;
let activeRequests = 0;
let maximumConcurrentRequests = 0;

const requestDelayMs = 500;

async function readBody(stream: AsyncIterable<Buffer | string>): Promise<string> {
  const chunks: string[] = [];
  for await (const chunk of stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk.toString("utf8") : chunk);
  }
  return chunks.join("");
}

beforeAll(async () => {
  originalDatabasePath = process.env.DATABASE_PATH;
  originalOllamaUrl = process.env.OLLAMA_URL;
  process.env.DATABASE_PATH = ":memory:";

  ollamaServer = createServer(async (req, res) => {
    if (req.method !== "POST" || req.url !== "/api/embed") {
      res.writeHead(404).end();
      return;
    }

    activeRequests++;
    maximumConcurrentRequests = Math.max(
      maximumConcurrentRequests,
      activeRequests
    );

    try {
      const body = JSON.parse(await readBody(req)) as { input?: string[] };
      await new Promise<void>((resolve) => setTimeout(resolve, requestDelayMs));
      const inputs = Array.isArray(body.input) ? body.input : [];
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({
        model: "nomic-embed-text",
        embeddings: inputs.map(() => [0.1, 0.2, 0.3])
      }));
    } finally {
      activeRequests--;
    }
  });

  ollamaServer.listen(0, "127.0.0.1");
  await once(ollamaServer, "listening");
  const address = ollamaServer.address();
  if (!address || typeof address === "string") {
    throw new Error("Unable to determine the local embedding server port.");
  }

  process.env.OLLAMA_URL = "http://127.0.0.1:" + address.port;

  const dbModule = await import("../src/storage/db");
  const serverModule = await import("../src/server");
  database = dbModule.database;
  app = serverModule.app;
});

afterAll(async () => {
  if (database) {
    database.close();
  }

  if (ollamaServer?.listening) {
    ollamaServer.close();
    await once(ollamaServer, "close");
  }

  if (originalDatabasePath === undefined) {
    delete process.env.DATABASE_PATH;
  } else {
    process.env.DATABASE_PATH = originalDatabasePath;
  }

  if (originalOllamaUrl === undefined) {
    delete process.env.OLLAMA_URL;
  } else {
    process.env.OLLAMA_URL = originalOllamaUrl;
  }
});

describe("embedding queue HTTP admission", () => {
  it("returns 429 when more than ten requests are waiting and keeps Ollama serial", async () => {
    const responses = await Promise.all(
      Array.from({ length: 12 }, (_, index) =>
        request(app)
          .post("/api/search")
          .send({ query: "queue test query " + index, limit: 1 })
      )
    );

    const rateLimited = responses.filter((response) => response.status === 429);
    const successful = responses.filter((response) => response.status === 200);

    expect(rateLimited).toHaveLength(1);
    expect(successful).toHaveLength(11);
    expect(rateLimited[0]?.headers["retry-after"]).toBe("1");
    expect(maximumConcurrentRequests).toBe(1);
  }, 15000);
});
