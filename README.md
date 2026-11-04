# ContextVault

ContextVault is a local-first developer context and memory system. It indexes a project on your machine, creates searchable embeddings with local Ollama, and lets you find relevant project code through a web interface or MCP-compatible desktop tools.

## Cross-Platform Installation

Choose the installer for your operating system. Native installers prepare Node.js, Ollama, the nomic-embed-text model, project dependencies, and a launcher for the local dashboard.

### Windows 10 / 11

1. Download and extract the ContextVault repository ZIP.
2. Open the extracted folder and run install-contextvault.ps1 with PowerShell.
3. The installer verifies and installs the supported Node.js 22 runtime, downloads and verifies the signed official Ollama installer, installs Ollama silently, downloads nomic-embed-text, installs npm dependencies, and creates a ContextVault Desktop shortcut.
4. Double-click the ContextVault shortcut. It starts the server hidden and opens http://localhost:3737.

Windows support follows the current Ollama Windows requirements: Windows 10 22H2 or newer, or Windows 11.

### macOS

1. Download and extract the ContextVault repository.
2. Double-click install-mac.command.
3. The installer prepares Homebrew when missing, installs Node.js 22 and the official Ollama app, starts Ollama, downloads nomic-embed-text, installs npm dependencies, and creates ContextVault.command on your Desktop.
4. Double-click ContextVault.command whenever you want to launch the dashboard.

Ollama for macOS currently requires macOS 14 Sonoma or newer. Homebrew may request your macOS account password when preparing developer tools or installing dependencies.

### Linux

1. Download and extract the ContextVault repository.
2. Run install-linux.sh from the extracted folder. If your file manager does not offer a Run option, open a terminal in the folder and run: chmod +x install-linux.sh && ./install-linux.sh.
3. The installer supports APT, DNF, and YUM. It installs Node.js 22, installs Ollama using the official Linux installation script, starts Ollama, downloads nomic-embed-text, and installs npm dependencies.
4. It creates a ContextVault application shortcut in your Applications menu and, when available, on your Desktop.

The Linux installer may request administrator approval for operating-system packages and Ollama.

### Docker — same setup on Windows, macOS, and Linux

Docker is the portable route when you do not want Node.js or Ollama installed directly on the host computer. Docker Engine or Docker Desktop with the Compose plugin must already be installed and running.

From the repository folder, run:

~~~bash
docker compose up -d --build
~~~

Then open:

http://localhost:3737

The container runs Node.js and Ollama together, downloads nomic-embed-text on first startup, and stores the database and model files in persistent Docker volumes. The default Docker configuration uses CPU execution; GPU acceleration depends on the host, drivers, and Docker runtime configuration.

To stop ContextVault:

~~~bash
docker compose down
~~~

Your indexed database and downloaded model remain in named Docker volumes. To remove them as well, run docker compose down -v.

## Requirements

- Windows: Windows 10 22H2 or newer, or Windows 11.
- macOS: macOS 14 Sonoma or newer for the current Ollama macOS distribution.
- Linux: A supported 64-bit Linux distribution with APT, DNF, or YUM, plus sudo access.
- Docker: Docker Engine or Docker Desktop with Docker Compose v2.
- Internet connection for initial installation and model download.

Node.js 22.13 or newer in the Node.js 22 line is required for native installations. The native installers prepare it automatically.

## Manual Development Setup

Install Node.js 22 and Ollama, then open a terminal in the project folder.

Install dependencies:

~~~bash
npm install
~~~

Start Ollama and download the embedding model:

~~~bash
ollama serve
ollama pull nomic-embed-text
~~~

Start the development server:

~~~bash
npm run dev
~~~

Open http://localhost:3737.

The health endpoint is available at http://localhost:3737/health.

## Index Your First Project

1. In the Get started with ContextVault panel, enter the full path to a project folder on your computer.
2. Select Index Project.
3. ContextVault scans the folder, creates embeddings through local Ollama, and stores the indexed content in its SQLite database.
4. After indexing completes, ContextVault starts live monitoring for that project. New and changed files are added to the index automatically.
5. Ask a natural-language question in the search box to find relevant code.

Files and folders excluded by the scanner's ignore rules are not indexed.

## Available Scripts

| Command | Purpose |
| --- | --- |
| npm run dev | Start the local development server |
| npm run build | Compile the TypeScript application |
| npm start | Start the compiled server |
| npm test | Run the automated test suite |
| npm run lint | Run ESLint on the source directory |
| npm run mcp | Start the stdio MCP server for a compatible desktop client |

See README_MCP.md for MCP desktop client configuration.

## API Endpoints

| Method | Endpoint | Purpose |
| --- | --- | --- |
| GET | /health | Application health check |
| POST | /api/scan | Scan a project and return file metadata |
| POST | /api/index | Index a project into the local database |
| POST | /api/search | Search indexed context semantically |
| GET | /api/stats | Return indexed file and chunk counts |
| POST | /api/watch | Start live monitoring for a project |

## Local Storage and Configuration

The default SQLite database is created at:

data/contextvault.db

Supported environment settings:

~~~text
PORT=3737
OLLAMA_URL=http://localhost:11434
DATABASE_PATH=data/contextvault.db
~~~

DATABASE_PATH can be set to use a different local SQLite database file. Keep it consistent between the web application and MCP client configuration when both should use the same index.

## Local-first Processing

Project scanning, chunking, embedding generation, vector storage, and semantic search are performed by the local ContextVault process and local Ollama service. The application does not automatically send project source files to a hosted embedding API.

## Landing Page

The separate marketing page is available at landing/index.html. It is kept outside public/ so it can be deployed independently to GitHub Pages or Vercel.

## Project Version

0.1.0
