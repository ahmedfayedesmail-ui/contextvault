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
    } finally {
      await client.close();
    }
  });
});