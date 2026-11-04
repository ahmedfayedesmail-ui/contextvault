# Changelog

All notable ContextVault changes are documented here by development session.

## Session 10 — Progressive Indexing and Index Management

- Changed project indexing to a background job API with progress polling and immediate HTTP 202 responses.
- Persisted each file and its embeddings atomically as soon as its embedding work completes, allowing file/chunk statistics to update during indexing.
- Added a live progress panel showing completed files, saved chunks, current file, and percentage progress.
- Added a Clear Index endpoint and confirmation-protected UI action; live file watching is stopped and its pending queue drained before deletion.
- Added transactional deletion of chunks and files followed by SQLite WAL checkpointing and VACUUM compaction.
- Added regression tests for background job completion, partial progress visibility, clear-index conflicts during indexing, and complete index deletion.

## Windows Ollama Model Verification Hotfix

- Rechecked `nomic-embed-text` through `ollama list` after the installer pull step and fail clearly if the model is still unavailable.
- Updated the Windows launcher to verify the model again after pulling it, and block application/browser startup until verification succeeds.
- Added the alternate per-user Ollama installation path to the batch launcher and corrected the `node_modules` directory check.
- Expanded installer and launcher regression assertions for model verification and launch ordering.

## Windows Ollama Model Readiness Hotfix

- Hardened installer Ollama startup to pass an explicit scalar executable path to `Start-Process`, retaining standard, discovered-location, and PATH fallbacks.
- Made the Windows batch launcher start or reuse Ollama, wait for its API, check `ollama list`, and synchronously pull `nomic-embed-text` when missing.
- The launcher now withholds browser startup until the embedding model is ready and the ContextVault health endpoint responds.
- Added regression coverage for model readiness and download ordering.

## Ollama Start-Process Hotfix

- Replaced the Windows Ollama background launch with an explicit per-user executable path and a scalar `ollama` command fallback.
- Resolved the `ollama` command fallback before checking API readiness, so the same scalar path works whether Ollama was already running or must be started.
- Reused the same `$OllamaExePath` variable for Ollama model listing, `nomic-embed-text` download, and the desktop launcher.
- Added regression assertions covering both launch paths and consistent executable reuse.

## Ollama Executable Path Hotfix

- Normalized Ollama discovery and installer results to the first absolute executable path as a single PowerShell String.
- Passed the scalar executable path explicitly to Start-Process and used it for model commands, preventing Object[] parameter binding failures.
- Added regression assertions for scalar Ollama path resolution.

## Windows Node.js Hotfix

- Replaced PowerShell command discovery with direct absolute-path discovery and execution of `node.exe`, including standard MSI, registry, NVM, FNM, Volta, Scoop, and ContextVault-managed runtime locations.
- Reused existing Node.js 22.13.0+ installations, including Node.js 23 and 24, before considering the portable fallback runtime.
- Executed `npm.cmd` and the npm CLI from the selected Node.js installation by absolute path.
- Added regression tests that reject PATH-based Node.js discovery.

## Cross-Platform Installer Hardening

- Rebuilt the Windows installer PATH refresh so it reconstructs the current PowerShell environment directly from the persisted Machine and User PATH values immediately after Node.js setup.
- Added silent Ollama installation through winget with exact package ID, and a signed official-installer fallback for Windows environments without winget.
- Added background Ollama startup, model verification and download, and hidden npm dependency installation.
- Replaced the Windows Desktop shortcut with a hidden launcher that starts Ollama and the ContextVault server, waits for the local health endpoint, and opens the browser.
- Simplified start-contextvault.bat to start the local server, wait three seconds, and open the web interface.
- Updated macOS and Linux native installers and shared launcher.
- Updated Docker image and Compose setup to run Node.js and Ollama together with persistent model and database volumes.
- Expanded installation tests and the Cross-Platform Installation README section.

## Planned for v0.2

- [ ] Add integration tests for installer scripts on Windows 10/11, macOS, and Linux machines.
- [ ] Add Docker build and first-start smoke tests.
- [ ] Add stopCurrentWatcher() and call it before starting a watcher for a different project, closing the previous watcher so project switching does not leave monitoring attached only to the first project.

## Cross-Platform Distribution

- Reworked the Windows installer to install and verify Node.js 22, install Ollama silently, pull nomic-embed-text, and install dependencies.
- Added a hidden Windows Desktop launcher that starts ContextVault and opens the local dashboard.
- Added macOS and Linux installers and shared shell launcher.
- Added a Docker image and Compose configuration with persistent SQLite and model volumes.
- Expanded README installation guidance for Windows, macOS, Linux, and Docker.

## Session 8 — Windows Distribution and Productization

- Added a double-click Windows batch launcher and PowerShell installer.
- Added a standalone responsive dark-mode landing page under landing/, separate from the application assets in public/.
- Added installer asset tests for Windows scripts and the landing page.

## Session 7 — Product Onboarding

- Added an onboarding panel with a first-project welcome message and a project path field.
- Added the Index Project flow, which indexes the selected project and then starts live watching.
- Added status feedback and graceful handling for failed indexing or watcher requests.
- Added in-memory database tests for the stats endpoint and the project indexing endpoint.
- Improved the README with first-run setup and project onboarding instructions.

## Session 6 — Live Indexing and System Statistics

- Added getSystemStats() to report total indexed files and chunks from SQLite.
- Added indexSingleFile() to chunk, embed, and persist one changed file.
- Added a live filesystem watcher that indexes file additions and changes.
- Serialized live indexing through a promise queue to prevent concurrent SQLite write transactions.
- Added GET /api/stats and POST /api/watch endpoints.
- Added a dashboard statistics bar that refreshes automatically every five seconds.
- Added in-memory database tests for statistics and single-file indexing, including an HTTP test for the stats endpoint.

## Session 5 — Model Context Protocol Integration

- Added an MCP server using the official Model Context Protocol SDK and stdio transport.
- Added the search_context tool for semantic search over locally indexed project context.
- Added the index_project tool for indexing a local project through ContextVault.
- Split the MCP executable entry point into src/mcp-entry.ts so importing the server module does not start a stdio process.
- Added an in-memory MCP client/server integration test for tool discovery and input schemas.
- Added README_MCP.md with desktop client configuration guidance.

## Session 4 — Semantic Search and Web Interface

- Added cosine-similarity scoring and ranked vector search over stored embeddings.
- Added the POST /api/search endpoint, generating query embeddings through the local Ollama service.
- Added a responsive dark-mode web interface for searching indexed project context.
- Added tests for similarity calculations, result ranking, result limits, and invalid query vectors.

## Session 3 — Local Embeddings and Vector Persistence

- Integrated the local Ollama /api/embed endpoint using the nomic-embed-text model.
- Added embedding persistence to SQLite using Float32 BLOB values.
- Added transactional persistence for indexed files, chunks, and embeddings.
- Added the indexing pipeline and the POST /api/index endpoint.
- Added tests for embedding request handling, persistence, and transaction rollback.

## Session 2 — Project Scanner and Chunking

- Added recursive project scanning with exclusions for generated, dependency, and binary files.
- Added file metadata and language detection.
- Added text chunking with overlap and language-aware section boundaries.
- Added the POST /api/scan endpoint.
- Added filesystem watch support for detecting file additions and changes.
- Added scanner and chunking tests.

## Session 1 — Project Foundation

- Created the Node.js and TypeScript project scaffold for ContextVault.
- Added the Express application and health endpoint.
- Added the SQLite storage layer and initial files/chunks schema.
- Added the initial test and lint setup.
- Added GitHub Actions CI for the Node.js 22 project environment.
