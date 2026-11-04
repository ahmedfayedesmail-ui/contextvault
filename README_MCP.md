# ContextVault MCP Server

ContextVault exposes its local project indexing and semantic search features through the Model Context Protocol (MCP). This allows compatible desktop AI clients to call ContextVault tools while project files, embeddings, and the SQLite database remain on your machine.

## Requirements

- Windows 11
- Node.js 22 LTS
- Claude Desktop with MCP support
- Ollama running locally
- The \`nomic-embed-text\` embedding model

Install dependencies from the ContextVault project folder:

~~~powershell
npm install
ollama list
~~~

If the embedding model is not listed, install it:

~~~powershell
ollama pull nomic-embed-text
~~~

Make sure Ollama is running before using the MCP tools.

## Configure Claude Desktop

1. Open the Claude Desktop configuration folder by entering \`%APPDATA%\\Claude\` in File Explorer.
2. Create or edit \`claude_desktop_config.json\`.
3. Add the following server configuration.
4. Replace \`YOUR_USER\` and the project path with the actual Windows account name and ContextVault folder.
5. Save the file and restart Claude Desktop.

~~~json
{
  "mcpServers": {
    "contextvault": {
      "command": "cmd",
      "args": [
        "/c",
        "cd /d \\"C:\\\\Users\\\\YOUR_USER\\\\contextvault\\" && npm run --silent mcp"
      ],
      "env": {
        "NODE_OPTIONS": "--experimental-sqlite",
        "OLLAMA_URL": "http://localhost:11434",
        "DATABASE_PATH": "C:\\\\Users\\\\YOUR_USER\\\\contextvault\\\\data\\\\contextvault.db"
      }
    }
  }
}
~~~

The \`DATABASE_PATH\` value must point to the same ContextVault database used by the local application. Keep the configured project path consistent with where the repository is installed.

## Available tools

### \`search_context\`

Searches indexed project context using a natural-language query.

Inputs:
- \`query\` — required search text.
- \`limit\` — optional maximum result count (1–100, default 5).

### \`index_project\`

Scans and indexes a local project directory using the local Ollama embedding model.

Input:
- \`rootPath\` — required absolute path to the project directory.

## Local processing and data control

ContextVault runs the MCP server on the local machine. Project scanning, embedding generation, vector search, and SQLite persistence use the local ContextVault process and local Ollama endpoint. The MCP server does not automatically forward project data to Claude, OpenAI, or another hosted model provider. The connected desktop client receives only the tool results needed for the current interaction.

The MCP process uses standard input/output for MCP messages. Diagnostic and indexing progress messages are written to stderr so they do not interfere with the protocol stream.