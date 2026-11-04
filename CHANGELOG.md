# Changelog

All notable ContextVault changes are documented here by development session.

## Planned for v0.2

- [ ] Add `stopCurrentWatcher()` and call it before starting a watcher for a different project, closing the previous watcher so project switching does not leave monitoring attached only to the first project.

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
