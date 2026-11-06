<!-- ContextVault repository landing page -->
<div align="center">
  <img src="assets/contextvault-banner.svg" alt="ContextVault — Your codebase. Searchable context. Kept on your machine." width="100%" />

  <p><strong>Give your AI coding tools the context of your actual codebase — while keeping indexing and embeddings local.</strong></p>

  <p>
    <a href="https://github.com/ahmedfayedesmail-ui/contextvault/actions/workflows/ci.yml"><img src="https://img.shields.io/github/actions/workflow/status/ahmedfayedesmail-ui/contextvault/ci.yml?branch=main&label=CI&logo=github" alt="CI status" /></a>
    <img src="https://img.shields.io/badge/Node.js-22.13%2B-43853d?logo=node.js&logoColor=white" alt="Node.js 22.13+" />
    <img src="https://img.shields.io/badge/Embeddings-Ollama-111827?logo=ollama&logoColor=white" alt="Ollama" />
    <img src="https://img.shields.io/badge/Storage-SQLite-003B57?logo=sqlite&logoColor=white" alt="SQLite" />
    <img src="https://img.shields.io/badge/Integration-MCP-6750A4" alt="MCP integration" />
    <a href="https://github.com/ahmedfayedesmail-ui/contextvault/stargazers"><img src="https://img.shields.io/github/stars/ahmedfayedesmail-ui/contextvault?style=flat&logo=github" alt="GitHub stars" /></a>
    <a href="https://github.com/ahmedfayedesmail-ui/contextvault/network/members"><img src="https://img.shields.io/github/forks/ahmedfayedesmail-ui/contextvault?style=flat&logo=github" alt="GitHub forks" /></a>
    <img src="https://img.shields.io/badge/version-1.2.0-8b7cff" alt="Version 1.2.0" />
  </p>

  <p>
    <a href="https://ahmedfayedesmail-ui.github.io/contextvault/"><strong>Website</strong></a>
    ·
    <a href="#quick-start"><strong>Get started</strong></a>
    ·
    <a href="#connect-your-ai-tools-with-mcp"><strong>MCP setup</strong></a>
    ·
    <a href="#pricing"><strong>Pricing</strong></a>
    ·
    <a href="ROADMAP.md"><strong>Roadmap</strong></a>
    ·
    <a href="TESTING.md"><strong>Testing guide</strong></a>
  </p>
</div>

---

## What is ContextVault?

ContextVault is a **local-first developer context and memory system**. It indexes a project on your machine, creates searchable embeddings with local [Ollama](https://ollama.com/), and stores the index in SQLite.

Instead of relying only on filenames or exact keyword matches, you can ask questions in natural language and find relevant code. ContextVault also exposes project search and indexing through the **Model Context Protocol (MCP)** so compatible AI coding tools can request the context they need.

## At a glance

| Capability | What it does |
| --- | --- |
| **Project indexing** | Scans a local codebase and builds a searchable index. |
| **Semantic code search** | Finds relevant code using natural-language queries. |
| **Local embeddings** | Uses Ollama and the `nomic-embed-text` model for embedding generation. |
| **Persistent index** | Stores indexed project context in a local SQLite database. |
| **Live monitoring (Pro)** | Watches an indexed project and adds new or changed files. |
| **MCP integration (Pro)** | Exposes `search_context` and `index_project` to compatible AI clients. |
| **Cross-platform setup** | Includes native installers for Windows, macOS, and Linux, plus Docker. |

## How it works

```text
Your project folder
       │
       ▼
ContextVault scanner ──► Chunking and indexing
                               │
                               ▼
                        Local Ollama
                      (embeddings)
                               │
                               ▼
                       SQLite database
                         │         │
                         ▼         ▼
                    Web dashboard  MCP server
                                      │
                                      ▼
                              Compatible AI tools
```

Your project is indexed by the local ContextVault process. Embedding generation and semantic search use your local Ollama service; project source files are not automatically sent to a hosted embedding API.

## Quick start

Choose the installation method for your operating system. The native installers prepare Node.js, Ollama, the embedding model, project dependencies, and a launcher for the local dashboard.

### Windows 10 / 11

1. Download the repository using **Code → Download ZIP**, then extract it.
2. Right-click `install-contextvault.ps1` and choose **Run with PowerShell**.
3. The installer prepares a supported Node.js 22 runtime (using a verified official archive when needed), installs Ollama (using winget with a signed official-installer fallback), starts Ollama, downloads `nomic-embed-text`, and installs dependencies. It displays each stage, retries downloads, shows npm output, and saves a diagnostic log under `%LOCALAPPDATA%\\ContextVault\\logs`.
4. Open ContextVault and visit [http://localhost:3737](http://localhost:3737). The app warms the Ollama embedding model in the background at startup, so the dashboard can open immediately while the model is prepared for the first search.

### macOS

1. Download and extract the repository.
2. Double-click `install-mac.command`.
3. The installer uses Homebrew to prepare Node.js 22 and Ollama, downloads `nomic-embed-text`, installs dependencies, and creates a launcher.
4. Launch ContextVault and open the local dashboard.

### Linux

1. Download and extract the repository.
2. Run:

   ```bash
   chmod +x install-linux.sh && ./install-linux.sh
   ```

3. The installer supports APT- and DNF-based distributions, prepares Node.js 22 and Ollama, downloads `nomic-embed-text`, and creates an application shortcut.

### Docker

With Docker Engine or Docker Desktop and the Docker Compose plugin installed:

```bash
docker compose up --build
```

Then open [http://localhost:3737](http://localhost:3737). Docker Compose stores the SQLite database and Ollama model files in persistent volumes.

### Index your first project

1. Open the ContextVault dashboard.
2. Enter the full path to a local project folder in **Get started with ContextVault**.
3. Select **Index Project** and let the indexing job finish.
4. Ask a natural-language question in the search box.
5. On Pro, Live Monitoring adds new and changed files to the index automatically.

Files and folders excluded by the scanner's ignore rules are not indexed.

## Requirements

- **Windows:** Windows 10 22H2 or newer, or Windows 11.
- **macOS:** macOS 14 Sonoma or newer for the current Ollama distribution.
- **Linux:** A supported 64-bit APT- or DNF-based distribution, plus sudo access.
- **Docker:** Docker Engine or Docker Desktop with Docker Compose v2.
- **Node.js:** 22.13 or newer in the Node.js 22 release line (prepared by native installers).
- **Internet:** Required for first-time setup and downloading the embedding model.

See the [official Ollama Windows requirements](https://docs.ollama.com/windows) for platform details.

### Embedding performance

ContextVault warms the local Ollama embedding model when the dashboard or local MCP server starts and keeps it loaded for 30 minutes by default. Successful embedding requests log elapsed time and, when available, Ollama's model-load timing. Project indexing sends up to 16 chunk texts per Ollama embedding request instead of one request per chunk. The HTTP search route and MCP `search_context` also log embedding and local vector-search timings separately. Logs are saved to `%LOCALAPPDATA%\\ContextVault\\logs\\embedding.log` on Windows, `~/Library/Logs/ContextVault/embedding.log` on macOS, or `~/.local/state/contextvault/logs/embedding.log` on Linux.

- `OLLAMA_KEEP_ALIVE` — defaults to `30m`.
- `OLLAMA_EMBED_TIMEOUT_MS` — defaults to `120000` (120 seconds).
- `OLLAMA_URL` — defaults to `http://127.0.0.1:11434`.
- `CONTEXTVAULT_LOG_DIR` — optional override for the diagnostic log directory.

See [README_MCP.md](README_MCP.md#embedding-performance-and-diagnostics) for details.

## Connect your AI tools with MCP

ContextVault includes a local MCP server for compatible desktop clients. The dashboard generates a machine-specific configuration, including the active Node.js executable, MCP entry point, SQLite database path, local Ollama URL, and SQLite runtime option.

1. Start ContextVault and open [http://localhost:3737](http://localhost:3737).
2. Open **Settings**.
3. Under **AI Integrations**, select **Copy MCP Configuration**.
4. Paste the copied JSON into your AI client's MCP configuration.
5. Save the file and restart the desktop application.

### Claude Desktop

Common configuration file locations:

- **Windows:** `%APPDATA%\Claude\claude_desktop_config.json`
- **macOS:** `~/Library/Application Support/Claude/claude_desktop_config.json`
- **Linux:** `~/.config/Claude/claude_desktop_config.json`

Merge the generated `contextvault` entry into the existing `mcpServers` object. Keep your other server entries.

### Cursor — graphical setup

ContextVault can be added from Cursor's MCP settings without manually assembling the command.

1. Start ContextVault and open its dashboard at [http://localhost:3737](http://localhost:3737).
2. In ContextVault, open **Settings → AI Integrations → Copy MCP Configuration**. Keep this generated configuration open; it contains the correct paths and environment values for this computer.
3. Open Cursor. Depending on your Cursor version, open **Settings → Features → MCP** (or **Settings → Tools & MCP**). In current Cursor builds, MCP servers are managed from **Customize → MCPs** in the sidebar.
4. Select **Add New MCP Server**.
5. Set the server name to `ContextVault`.
6. Choose the local **command / stdio** option, not a URL or HTTP connection.
7. Copy the generated ContextVault entry into the fields:
   - **Command:** copy the `command` value exactly.
   - **Arguments:** copy every item from `args`, in the same order.
   - **Environment:** copy the `env` values exactly, including `DATABASE_PATH`, `OLLAMA_URL`, and `NODE_OPTIONS`.
8. Save the server. Fully restart Cursor if it does not connect immediately.
9. Open Cursor's MCP list and confirm that ContextVault is enabled and that both `index_project` and `search_context` are available.

Do not type a Node.js path, database path, or MCP entry point from memory. Use the values generated by the running ContextVault installation. If Cursor opens its `mcp.json` editor instead of showing separate fields, merge the generated `contextvault` entry into the existing `mcpServers` object and preserve all other server entries.

Cursor's labels move between releases. Its current documentation describes **Customize → MCPs** for managing servers and a local command-based (stdio) configuration for custom local servers. See the [official Cursor MCP guide](https://cursor.com/docs/mcp).

### Cursor configuration file (alternative)

Use either:

- `.cursor/mcp.json` for project-specific configuration, or
- `~/.cursor/mcp.json` for global configuration.

Merge the generated `contextvault` entry into the existing `mcpServers` object. Save the file and restart Cursor.

### Available MCP tools

| Tool | Purpose |
| --- | --- |
| `search_context` | Searches locally indexed project context. |
| `index_project` | Indexes a local project directory. |

## Manual development setup

Install Node.js 22 and Ollama, then run the following commands from the project directory:

```bash
npm install
ollama serve
ollama pull nomic-embed-text
npm run dev
```

Open [http://localhost:3737](http://localhost:3737). The health endpoint is available at [http://localhost:3737/health](http://localhost:3737/health).

## Available scripts

| Command | Purpose |
| --- | --- |
| `npm run dev` | Start the local development server. |
| `npm run build` | Compile the TypeScript application. |
| `npm start` | Start the compiled server. |
| `npm test` | Run the automated test suite. |
| `npm run lint` | Run ESLint on the source directory. |
| `npm run mcp` | Start the stdio MCP server for a compatible desktop client. |

## API endpoints

| Method | Endpoint | Purpose |
| --- | --- | --- |
| GET | `/health` | Application health check. |
| POST | `/api/scan` | Scan a project and return file metadata. |
| POST | `/api/index` | Index a project into the local database. |
| POST | `/api/search` | Search indexed context semantically. |
| GET | `/api/stats` | Return indexed file and chunk counts. |
| GET | `/api/config/mcp` | Generate a machine-specific MCP client configuration. |
| GET | `/api/settings/license` | Read the local license status. |
| PUT | `/api/settings/license` | Reset the local license selection to Free. |
| POST | `/api/license/activate` | Validate a Lemon Squeezy license key and activate Pro. |
| POST | `/api/watch` | Start live monitoring for a project. |

## Local storage

The default SQLite database is created at `data/contextvault.db`.

| Setting | Default |
| --- | --- |
| `PORT` | `3737` |
| `OLLAMA_URL` | `http://127.0.0.1:11434` |
| `DATABASE_PATH` | `data/contextvault.db` |

Set `DATABASE_PATH` to use a different local SQLite database file. Keep it consistent between the web application and MCP client when both should use the same index.

## Free and Pro plans

ContextVault Free is designed to evaluate semantic search on one project. Pro is for developers who want ContextVault inside their everyday AI coding workflow and need the index to grow with their codebase.

| Capability | Free | Pro |
| --- | --- | --- |
| Indexed project roots | 1 project at a time | Unlimited projects |
| Eligible files per project | Up to 1,000 | Unlimited |
| Dashboard semantic search | Included | Included |
| Local Ollama embeddings and SQLite storage | Included | Included |
| MCP for Cursor and Claude Desktop | Not included | Full access to `index_project` and `search_context` |
| Live file monitoring | Not included | Included |
| License activation | Not required | Verified Lemon Squeezy license key |

The 1,000-file boundary counts eligible files discovered by the ContextVault scanner after its normal ignore and file-size rules. Re-indexing the same Free project is allowed; a second project root is not.

### Why Pro?

Pro connects your indexed codebase to Cursor and Claude Desktop through MCP, so your AI coding agent can retrieve relevant implementation context directly instead of depending on manual copy-and-paste. Live Monitoring keeps the local index current as files are added or changed, while unlimited projects and files remove the Free plan size boundary.

### Pro pricing

| Billing period | Price |
| --- | ---: |
| Monthly | **$9 / month** |
| Yearly | **$79 / year** |

To activate Pro, open **Settings → Upgrade to Pro**, complete checkout, then enter the license key in **Settings → Activate Pro**.

[**Choose a Pro plan**](https://witness-engine.lemonsqueezy.com/checkout/buy/2e74fe7c-547a-4483-b09d-5699d6a1b422)

## Project links

- **Website:** [ahmedfayedesmail-ui.github.io/contextvault](https://ahmedfayedesmail-ui.github.io/contextvault/)
- **Source code:** [GitHub repository](https://github.com/ahmedfayedesmail-ui/contextvault)
- **MCP configuration guide:** [README_MCP.md](README_MCP.md)

## License

ContextVault is licensed under the [Functional Source License, Version 1.1, MIT Future License (FSL-1.1-MIT)](LICENSE). This is a Fair Source license, not an OSI-approved open-source license while its competing-use restriction applies. It allows internal use and restricts offering ContextVault or substantially similar functionality as a competing commercial product or service. Each version receives a future MIT license grant effective on its second anniversary.

See [LICENSING_DECISION.md](LICENSING_DECISION.md) for the product's licensing rationale and commercial-use boundaries.
---

<div align="center">
  <strong>ContextVault</strong><br />
  <sub>Useful project context, close to the code and under your control.</sub>
</div>
