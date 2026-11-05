import "dotenv/config";

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

import { generateEmbedding, warmupEmbeddingModel } from "./indexer/embedder";
import { indexProject } from "./indexer/pipeline";
import { searchVectors } from "./storage/vectors";

const SERVER_NAME = "contextvault";
const SERVER_VERSION = "0.1.0";

function getErrorMessage(error: unknown): string {
  return error instanceof Error
    ? error.message
    : String(error);
}

export function createContextVaultMcpServer(): McpServer {
  const server = new McpServer({
    name: SERVER_NAME,
    version: SERVER_VERSION
  });

  server.registerTool(
    "search_context",
    {
      title: "Search project context",
      description:
        "Search locally indexed project code and return the most relevant matching chunks.",
      inputSchema: {
        query: z.string().trim().min(1).describe("Natural-language query about the indexed project."),
        limit: z.number().int().min(1).max(100).optional().describe("Maximum number of matching chunks to return. Defaults to 5.")
      }
    },
    async ({ query, limit }) => {
      try {
        const queryEmbedding = await generateEmbedding(query);
        const results = searchVectors(queryEmbedding, limit ?? 5);

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  success: true,
                  query,
                  resultsCount: results.length,
                  results
                },
                null,
                2
              )
            }
          ]
        };
      } catch (error) {
        return {
          isError: true,
          content: [
            {
              type: "text",
              text: "ContextVault search failed: " + getErrorMessage(error)
            }
          ]
        };
      }
    }
  );

  server.registerTool(
    "index_project",
    {
      title: "Index a project",
      description:
        "Scan a local project, generate embeddings with Ollama, and store its searchable context in the local ContextVault database.",
      inputSchema: {
        rootPath: z.string().trim().min(1).describe("Absolute path to the local project directory.")
      }
    },
    async ({ rootPath }) => {
      try {
        const result = await indexProject(rootPath);

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  success: true,
                  message: "Project indexing completed successfully.",
                  rootPath,
                  filesCount: result.filesCount,
                  chunksCount: result.chunksCount
                },
                null,
                2
              )
            }
          ]
        };
      } catch (error) {
        return {
          isError: true,
          content: [
            {
              type: "text",
              text: "ContextVault indexing failed: " + getErrorMessage(error)
            }
          ]
        };
      }
    }
  );

  return server;
}

export async function startMcpServer(): Promise<void> {
  // MCP uses stdout for JSON-RPC messages. Keep pipeline progress logs on stderr.
  console.info = (...data: Parameters<typeof console.error>) => {
    console.error(...data);
  };

  const server = createContextVaultMcpServer();
  const transport = new StdioServerTransport();

  await server.connect(transport);

  // Warm the shared local Ollama model in the background so the first MCP
  // search does not pay the full cold model-load cost.
  void warmupEmbeddingModel();
}