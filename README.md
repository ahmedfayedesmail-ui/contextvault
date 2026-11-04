# ContextVault

ContextVault is a local-first developer context and memory system. It indexes a project on your machine, creates searchable embeddings with local Ollama, and lets you find relevant project code through a simple web interface or MCP-compatible desktop tools.

## Quick Start (Windows 10 / 11)

1. **Download the repository.** Clone it with Git or download and extract the repository ZIP from [GitHub](https://github.com/ahmedfayedesmail-ui/contextvault).
2. **Install Ollama for Windows.** Download it from [ollama.com/download/windows](https://ollama.com/download/windows) and complete its normal Windows installation.
3. **Run the installer once.** Open the extracted `contextvault` folder, right-click `install-contextvault.ps1`, and choose **Run with PowerShell**. The installer fetches the latest stable Node.js 22.x release from the official Node.js release index, verifies its SHA-256 checksum, installs project dependencies, and creates a ContextVault shortcut on your Desktop. If Ollama is not detected, it tells you to install Ollama and run the installer again.
4. **Start ContextVault.** Double-click the **ContextVault** Desktop shortcut, or double-click `start-contextvault.bat` in the repository folder. The launcher starts the local Ollama service, downloads `nomic-embed-text` on the first run if needed, starts the ContextVault server in a separate terminal, and opens the browser.
5. **Index your project.** In the onboarding panel, enter the full path to a project folder and select **Index Project**. When indexing finishes, ContextVault starts watching the folder for new and changed files.

The first setup needs an internet connection to download Node.js, npm dependencies, and the embedding model. Ollama must be installed separately from its official Windows download page. The embedding model can take a little while to download. Project indexing and embeddings are handled locally after setup.

### If Windows blocks the installer

Open PowerShell in the extracted repository folder and run:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\install-contextvault.ps1
```

To use the PowerShell launcher instead of the batch launcher:

```powershell
.\start-contextvault.ps1
```

## Requirements

- Windows 10 (build 19041 or newer) or Windows 11
- Node.js 22.13 or newer in the Node.js 22 line (the installer prepares the latest stable 22.x patch release when required)
- Ollama for Windows (install it before running the first-time installer)
- The `nomic-embed-text` model in Ollama (downloaded automatically by the launcher when missing)

## Manual Development Setup

If you prefer to prepare the environment yourself, install Node.js 22 and Ollama, then open PowerShell in the project folder.

Install dependencies:

```powershell
npm install
```

Make sure Ollama is running and install the embedding model if it is not already available:

```powershell
ollama list
ollama pull nomic-embed-text
```

Start the development server:

```powershell
npm run dev
```

Open the application:

**http://localhost:3737**

The health endpoint is available at `http://localhost:3737/health`.

## Index Your First Project

1. In the **Get started with ContextVault** panel, enter the full path to a project folder on your computer. For example:

   `C:\Users\YourName\Projects\MyApp`

2. Select **Index Project**.
3. ContextVault scans the folder, creates embeddings through local Ollama, and stores the indexed content in its SQLite database.
4. After indexing completes, ContextVault starts live monitoring for that project. New and changed files are added to the index automatically.
5. The Files and Chunks counters refresh automatically. Enter a natural-language question in the search box to find relevant code.

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

## Landing Page

The separate marketing page is available at [`landing/index.html`](landing/index.html). It is kept outside `public/` so it can be deployed independently to GitHub Pages or Vercel.

## Project Version

`0.1.0`
