# Changelog

All notable ContextVault changes are documented here by development session.

## Session 8 — Windows Distribution and Productization

- Added a double-click Windows batch launcher that checks Node.js and Ollama, starts the local Ollama service when needed, pulls `nomic-embed-text` when missing, installs npm dependencies on first launch, and opens the web application.
- Added a PowerShell launcher with prerequisite checks, colored status output, and error handling.
- Added a first-run installer that resolves the latest stable Node.js 22.x release from the official release index, verifies its SHA-256 checksum, installs npm dependencies, and creates a Desktop launcher and shortcut. Ollama is installed manually from its official Windows download page.
- Added a standalone responsive dark-mode landing page under `landing/`, separate from the application assets in `public/`.
- Added installer asset tests for the Windows scripts and landing page.

## Planned for v0.2

- [ ] Add integration tests for the installer scripts on a real Windows 11 virtual machine.
- [ ] Add `stopCurrentWatcher()` and call it before starting a watcher for a different project, closing the previous watcher so project switching does not leave monitoring attached only to the first project.

## Session 7 — Product Onboarding

- Added an onboarding panel with a first-project welcome message and a project path field.
- Added the Index Project flow, which indexes the selected project and then starts live watching.
- Added status feedback and graceful handling for failed indexing or watcher requests.
- Added in-memory database tests for the stats endpoint and the project indexing endpoint.
- Improved the README with first-run setup and project onboarding instructions.

## Session 6 — Live Indexing and System Statistics

- Added `getSystemStats()` to report total indexed files and chunks from SQLite.
- Added `indexSingleFile()` to chunk, embed, and persist one changed file.
- Added a live filesystem watcher that indexes file additions and changes.
- Serialized live indexing through a promise queue to prevent concurrent SQLite write transactions.
- Added `GET /api/stats` and `POST /api/watch` endpoints.
- Added a dashboard statistics bar that refreshes automatically every five seconds.
- Added in-memory database tests for statistics and single-file indexing, including an HTTP test for the stats endpoint.

## Session 5 — Model Context Protocol Integration

- Added an MCP server using the official Model Context Protocol SDK and stdio transport.
- Added the `search_context` tool for semantic search over locally indexed project context.
- Added the `index_project` tool for indexing a local project through ContextVault.
- Split the MCP executable entry point into `src/mcp-entry.ts` so importing the server module does not start a stdio process.
- Added an in-memory MCP client/server integration test for tool discovery and input schemas.
- Added `README_MCP.md` with desktop client configuration guidance.

## Session 4 — Semantic Search and Web Interface

- Added cosine-similarity scoring and ranked vector search over stored embeddings.
- Added the `POST /api/search` endpoint, generating query embeddings through the local Ollama service.
- Added a responsive dark-mode web interface for searching indexed project context.
- Added tests for similarity calculations, result ranking, result limits, and invalid query vectors.

## Session 3 — Local Embeddings and Vector Persistence

- Integrated the local Ollama `/api/embed` endpoint using the `nomic-embed-text` model.
- Added embedding persistence to SQLite using Float32 BLOB values.
- Added transactional persistence for indexed files, chunks, and embeddings.
- Added the indexing pipeline and the `POST /api/index` endpoint.
- Added tests for embedding request handling, persistence, and transaction rollback.

## Session 2 — Project Scanner and Chunking

- Added recursive project scanning with exclusions for generated, dependency, and binary files.
- Added file metadata and language detection.
- Added text chunking with overlap and language-aware section boundaries.
- Added the `POST /api/scan` endpoint.
- Added filesystem watch support for detecting file additions and changes.
- Added scanner and chunking tests.

## Session 1 — Project Foundation

- Created the Node.js and TypeScript project scaffold for ContextVault.
- Added the Express application and health endpoint.
- Added the SQLite storage layer and initial files/chunks schema.
- Added the initial test and lint setup.
- Added GitHub Actions CI for the Node.js 22 project environment.
