import {
  afterAll,
  beforeAll,
  describe,
  expect,
  it
} from "vitest";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";

import type { DatabaseSync } from "node:sqlite";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

let database: DatabaseSync;
let server: McpServer;

let createContextVaultMcpServer: () => McpServer;

const originalDatabasePath = process.env.DATABASE_PATH;

beforeAll(async () => {
  process.env.DATABASE_PATH = ":memory:";

  const mcpModule = await import("../src/mcp");
  const dbModule = await import("../src/storage/db");

  createContextVaultMcpServer = mcpModule.createContextVaultMcpServer;
  database = dbModule.database;
  server = createContextVaultMcpServer();
});

afterAll(async () => {
  if (server) {
    await server.close();
  }

  if (database) {
    database.close();
  }

  if (originalDatabasePath === undefined) {
    delete process.env.DATABASE_PATH;
  } else {
    process.env.DATABASE_PATH = originalDatabasePath;
  }
});

describe("ContextVault MCP server", () => {
  it("starts and registers the expected tools with their input schemas", async () => {
    const [clientTransport, serverTransport] =
      InMemoryTransport.createLinkedPair();

    const client = new Client({
      name: "contextvault-test-client",
      version: "1.0.0"
    });

    try {
      await Promise.all([
        server.connect(serverTransport),
        client.connect(clientTransport)
      ]);

      const response = await client.listTools();
      const tools = response.tools;

      expect(tools.map((tool) => tool.name)).toEqual(
        expect.arrayContaining(["search_context", "index_project"])
      );
      expect(tools).toHaveLength(2);

      const searchTool = tools.find(
        (tool) => tool.name === "search_context"
      );

      expect(searchTool).toBeDefined();
      expect(searchTool?.inputSchema.properties?.query).toBeDefined();

      const limit = searchTool?.inputSchema.properties?.limit;
      expect(limit).toBeDefined();

      const indexTool = tools.find(
        (tool) => tool.name === "index_project"
      );

      expect(indexTool).toBeDefined();
      expect(indexTool?.inputSchema.properties?.rootPath).toBeDefined();

      database.prepare(`
        INSERT INTO files (
          path,
          root_path,
          content,
          mtime,
          size,
          language
        )
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(
        "already-indexed.ts",
        "/contextvault-mcp-existing-project",
        "export const existing = true;",
        "2026-11-06T08:00:00.000Z",
        28,
        "typescript"
      );

      const blockedIndex = await client.callTool({
        name: "index_project",
        arguments: {
          rootPath: "/contextvault-mcp-second-project"
        }
      });

      expect(blockedIndex.isError).toBe(true);
      expect(JSON.stringify(blockedIndex.content)).toContain(
        "Free plan is limited to one project. Please upgrade to Pro or clear your current index."
      );
    } finally {
      await client.close();
    }
  });
});