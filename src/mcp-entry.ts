import { startMcpServer } from "./mcp";

startMcpServer().catch((error) => {
  console.error("[ContextVault MCP] Startup failed:", error);
  process.exitCode = 1;
});