# ContextVault MCP Server

ContextVault exposes its local project indexing and semantic search features through the Model Context Protocol (MCP). This allows compatible desktop AI clients to call ContextVault tools while project files, embeddings, and the SQLite database remain on your machine.

## Requirements

- Windows 10 22H2 or newer, macOS, or a supported Linux distribution
- Node.js 22.13.0 or newer
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

## Configure Claude Desktop and Cursor

ContextVault generates the correct MCP configuration for your machine.

1. Start ContextVault.
2. Open http://localhost:3737.
3. Click **Settings**.
4. Click **Copy MCP Configuration**.
5. Open the configuration file for your AI client.
6. Paste the copied JSON.
7. If other MCP servers already exist, merge the `contextvault` entry into
   the existing `mcpServers` object.
8. Save the file and restart your AI client.

Claude Desktop configuration locations:

- Windows: `%APPDATA%\\Claude\\claude_desktop_config.json`
- macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`
- Linux: `~/.config/Claude/claude_desktop_config.json`

For Cursor, use the copied JSON in `.cursor/mcp.json` for a project
configuration or `~/.cursor/mcp.json` for a global configuration.

The generated configuration contains the actual Node.js executable,
MCP entry point, database path, and Ollama URL for the running installation.
You do not need to manually edit account-specific or database paths.

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