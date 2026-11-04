# ContextVault

![CI](https://github.com/ahmedfayedesmail-ui/contextvault/actions/workflows/ci.yml/badge.svg?branch=main)
![License: not declared](https://img.shields.io/badge/license-not%20declared-lightgrey.svg)
![Version](https://img.shields.io/badge/version-0.1.0-8b7cff.svg)

🌐 **Website:** [ContextVault](https://ahmedfayedesmail-ui.github.io/contextvault/)

ContextVault is a local-first developer context and memory system. It indexes a project on your machine, creates searchable embeddings with local Ollama, and lets you find relevant project code through a web interface or MCP-compatible desktop tools.

## Quick Start

Choose the simplest installation path for your machine:

### Windows 10 / 11

1. Download and extract the ContextVault repository ZIP.
2. Right-click `install-contextvault.ps1` and choose **Run with PowerShell**.
3. The installer prepares Node.js 22, installs Ollama using winget (with a signed official-installer fallback when winget is unavailable), starts Ollama, downloads `nomic-embed-text`, installs dependencies, and creates a ContextVault Desktop shortcut.
4. Open the shortcut and visit [http://localhost:3737](http://localhost:3737).

### macOS

1. Download and extract the repository.
2. Double-click `install-mac.command`.
3. The installer uses Homebrew to prepare Node.js 22 and Ollama, downloads `nomic-embed-text`, installs dependencies, and creates a desktop launcher.
4. Launch ContextVault and open the local dashboard.

### linux

1. Download and extract the repository.
2. Run `chmod +x install-linux.sh && ./install-linux.sh`.
3. The installer supports APT- and DNF-based distributions, prepares Node.js 22 and Ollama, downloads `nomic-embed-text`, and creates an application shortcut.
4. Launch ContextVault from the Applications menu.

### Docker alternative

With Docker Engine or Docker Desktop and the Docker Compose plugin installed, run:

~~~bash
docker compose up --build
~~~

Then open [http://localhost:3737](http://localhost:3737). Docker Compose stores the SQLite database and Ollama model files in persistent volumes.

### Index your first project

1. Enter the full path to a local project folder in **Get started with ContextVault**.
2. Select **Index Project** and let the background indexing job finish.
3. Search your code with a natural-language question. Live monitoring adds new and changed files to the index.

## Cross-Platform Installation

Choose one installer for your environment. Native installers prepare Node.js, Ollama, the `nomic-embed-text` model, project dependencies, and a launcher for the local dashboard.

### Windows 10 / 11

The installer does not impose a Windows 11 build check. Ollama's current Windows support requirement is Windows 10 22H2 or newer, or Windows 11. See the [official Ollama Windows requirements](https://docs.ollama.com/windows).

### macOS

Ollama's current macOS requirement is macOS 14 Sonoma or newer. Homebrew may request your macOS account password during its first setup.

### Linux

The Linux installer may request administrator approval for operating-system packages and Ollama.

## Requirements

- Windows: Windows 10 22H2 or newer, or Windows 11.
- macOS: macOS 14 Sonoma or newer for the current Ollama distribution.
- Linux: a supported 64-bit APT- or DNF-based distribution, plus sudo access.
- Docker: Docker Engine or Docker Desktop with Docker Compose v2.
- Internet access for first-time installation and downloading the embedding model.

Native installers prepare Node.js 22.13 or newer in the Node.js 22 release line automatically.

## Manual Development Setup

Install Node.js 22 and Ollama, then open a terminal in the project folder.

~~~bash
npm install
ollama serve
ollama pull nomic-embed-text
npm run dev
~~~

Open [http://localhost:3737](http://localhost:3737). The health endpoint is available at [http://localhost:3737/health](http://localhost:3737/health).

## Index Your First Project

1. In the **Get started with ContextVault** panel, enter the full path to a project folder on your computer.
2. Select **Index Project**.
3. ContextVault scans the folder, creates embeddings through local Ollama, and stores the indexed content in its SQLite database.
4. After indexing completes, ContextVault starts live monitoring for that project. New and changed files are added to the index automatically.
5. Ask a natural-language question in the search box to find relevant code.

Files and folders excluded by the scanner's ignore rules are not indexed.

## Available Scripts

| Command | Purpose |
| --- | --- |
| `npm run dev` | Start the local development server |
| `npm run build` | Compile the TypeScript application |
| `npm start` | Start the compiled server |
| `npm test` | Run the automated test suite |
| `npm run lint` | Run ESLint on the source directory |
| `npm run mcp` | Start the stdio MCP server for a compatible desktop client |

See `README_MCP.md` for MCP desktop client configuration.

## Pricing & Upgrade

ContextVault offers the following Pro plans:

- **Pro Monthly:** $9 per month.
- **Pro Yearly:** $79 per year.

To upgrade, open **Settings → Upgrade to Pro** and choose your billing period in the Lemon Squeezy checkout. After purchase, use the license key sent by Lemon Squeezy in **Settings → Activate Pro**. ContextVault validates the key and activates Pro when the key is valid.

[Choose Pro Monthly or Yearly](https://witness-engine.lemonsqueezy.com/checkout/buy/2e74fe7c-547a-4483-b09d-5699d6a1b422)

The license activation endpoint is available at `POST /api/license/activate`.

## Connect with Claude Desktop and Cursor

ContextVault can connect to MCP-compatible AI clients using its local Model Context Protocol server. The dashboard generates a machine-specific configuration, so Node.js and database paths do not need to be edited manually.

1. Start ContextVault and open [http://localhost:3737](http://localhost:3737).
2. Click **Settings** in the dashboard header.
3. Under **AI Integrations**, click **Copy MCP Configuration**.
4. Paste the copied JSON into your AI client's MCP configuration file.
5. Save the file and restart the desktop application.

The generated configuration includes the active Node.js executable, MCP entry point, absolute SQLite database path, local Ollama URL, and SQLite runtime option.

### Claude Desktop

- Windows: `%APPDATA%\\Claude\\claude_desktop_config.json`
- macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`
- Linux: `~/.config/Claude/claude_desktop_config.json`

Merge the `contextvault` entry into the existing `mcpServers` object. Do not remove other server configurations. Save the file and restart Claude Desktop.

### Cursor

Use `.cursor/mcp.json` for project-specific configuration or `~/.cursor/mcp.json` for global configuration. Paste the copied JSON, save the file, and restart Cursor.

### Available ContextVault tools

- `search_context` — searches locally indexed project context.
- `index_project` — indexes a local project directory.

A Pro license is activated with a valid Lemon Squeezy license key. The plan cannot be enabled by changing a local display preference.

## API Endpoints

| Method | Endpoint | Purpose |
| --- | --- | --- |
| GET | `/health` | Application health check |
| POST | `/api/scan` | Scan a project and return file metadata |
| POST | `/api/index` | Index a project into the local database |
| POST | `/api/search` | Search indexed context semantically |
| GET | `/api/stats` | Return indexed file and chunk counts |
| GET | ` api/config/mcp` | Generate a machine-specific MCP client configuration |
| GET | `/api/settings/license` | Read the local license status |
| PUT | `/api/settings/license` | Reset the local license selection to Free |
| POST | `/api/license/activate` | Validate a Lemon Squeezy license key and activate Pro |
| POST | `/api/watch` | Start live monitoring for a project |

## Local Storage and Configuration

The default SQLite database is created at `data/contextvault.db`.

~~~text
PORT=3737
OLLAMA_URL=http://localhost:11434
DATABASE_PATH=data/contextvault.db
~~~

`DATABASE_PATH` can be set to use a different local SQLite database file. Keep it consistent between the web application and MCP client configuration when both should use the same index.

## Local-first Processing

Project scanning, chunking, embedding generation, vector storage, and semantic search are performed by the local ContextVault process and local Ollama service. The application does not automatically send project source files to a hosted embedding API. MCP clients receive the tool results requested by the user.

## Landing Page

The marketing page is available at `landing/index.html`. After GitHub Pages is enabled for the repository, run the **Deploy Landing Page** workflow manually from the Actions tab to publish this directory.

## License

License terms have not yet been published. This README deliberately does not label the project MIT, Apache-2.0, or another license until an explicit license file is added.

## Project Version

0.1.0
