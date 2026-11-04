# ContextVault

ContextVault is a local-first developer context and memory system.

## Requirements

- Windows 11
- Node.js 22 LTS
- npm

## Installation

Clone the repository.

Install dependencies:

```powershell
npm install
```

Create your environment file:

```powershell
Copy-Item .env.example .env
```

## Development

Start the development server:

```powershell
npm run dev
```

The server runs on:

http://localhost:3737

## Health Check

Open:

http://localhost:3737/health

Expected response:

```json
{
  "status": "ok",
  "version": "0.1.0"
}
```

## Available Scripts

Development: `npm run dev`

Build: `npm run build`

Production: `npm start`

Tests: `npm test`

Lint: `npm run lint`

## Storage

SQLite database location:

data/contextvault.db

## Environment

PORT=3737

OLLAMA_URL=http://localhost:11434

## CI

GitHub Actions validates the project on Windows and Ubuntu.

## Project Version

0.1.0
