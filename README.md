# ContextVault

ContextVault is a local-first developer context and memory system. It indexes a project on your machine, creates searchable embeddings with local Ollama, and lets you find relevant project code through a simple web interface or MCP-compatible desktop tools.

## Requirements

- Windows 11
- Node.js 22 LTS (22.13 or newer in the 22.x line)
- npm
- Ollama installed and running locally
- The `nomic-embed-text` model available in Ollama

## 1. Install ContextVault

Clone the repository and open PowerShell in the project folder:

```powershell
git clone https://github.com/ahmedfayedesmail-ui/contextvault.git
cd contextvault
npm install
```

## 2. Prepare Ollama

Make sure Ollama is running. Check that the embedding model is available:

```powershell
ollama list
```

Install the model when it is not listed:

```powershell
ollama pull nomic-embed-text
```

ContextVault uses the local Ollama endpoint at `http://localhost:11434` by default. You can override it with `OLLAMA_URL` in your environment.

## 3. Start ContextVault

From the project folder, run:

```powershell
npm run dev
```

Open the application in your browser:

**http://localhost:3737**

The health endpoint is available at `http://localhost:3737/health`.

## 4. Index your first project

1. In the **Get started with ContextVault** panel, enter the full path to a project folder on your computer. For example:

   `C:\Users\YourName\Projects\MyApp`

2. Select **Index Project**.
3. ContextVault scans the folder, creates embeddings through local Ollama, and stores the indexed content in its SQLite database.
4. After indexing completes, ContextVault starts live monitoring for that project. New and changed files are added to the index automatically.
5. The Files and Chunks counters refresh automatically. When indexing is complete, enter a natural-language question in the search box to find relevant code.

The project path must be an existing folder accessible to the Windows account running ContextVault. Files and folders excluded by the scanner's ignore rules are not indexed.

## Available Scripts

| Command | Purpose |
| --- | --- |
| `npm run dev` | Start the local development server |
| `npm run build` | Compile the TypeScript application |
| `npm start` | Start the compiled server |
| `npm test` | Run the automated test suite |
| `npm run lint` | Run ESLint on the source directory |
| `npm run mcp` | Start the stdio MCP server for a compatible desktop client |

See [README_MCP.md](README_MCP.md) for MCP desktop client configuration.

## API Endpoints

| Method | Endpoint | Purpose |
| --- | --- | --- |
| `GET` | `/health` | Application health check |
| `POST` | `/api/scan` | Scan a project and return file metadata |
| `POST` | `/api/index` | Index a project into the local database |
| `POST` | `/api/search` | Search indexed context semantically |
| `GET` | `/api/stats` | Return indexed file and chunk counts |
| `POST` | `/api/watch` | Start live monitoring for a project |

## Local Storage and Configuration

The default SQLite database is created at:

`data/contextvault.db`

Supported environment settings:

```text
PORT=3737
OLLAMA_URL=http://localhost:11434
DATABASE_PATH=data/contextvault.db
```

`DATABASE_PATH` can be set to use a different local SQLite database file. Keep it consistent between the web application and MCP client configuration when both should use the same index.

## Local-first Processing

Project scanning, chunking, embedding generation, vector storage, and semantic search are performed by the local ContextVault process and the local Ollama service. The application does not automatically send project source files to a hosted embedding API.

## Project Version

`0.1.0`
