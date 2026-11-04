# ContextVault — Marketing & Launch Copy

**Positioning:** A local-first memory layer for your codebase, built for developers and AI coding tools.

## Product description

ContextVault indexes a project on your machine, creates embeddings with local Ollama, stores searchable project context in SQLite, and exposes semantic search through a web dashboard and an MCP server. Live file monitoring keeps the local index current as files are added or changed.

**Core message:** Keep project context close to your code. Search it yourself or let an MCP-compatible assistant retrieve relevant pieces when you ask.

**Plans:** Free · Pro at **$9/month** or **$79/year**. The Pro checkout link is intended to let customers choose their billing period.

---

## Reddit

### r/LocalLLaMA

**Suggested title:** I built a local-first codebase memory tool with Ollama, SQLite, and MCP — looking for feedback

**Post:**

When working on larger projects with local models, I keep running into the same problem: the model may be capable, but useful context is scattered across files and folders. I end up re-explaining architecture or hunting for implementation details I have already found before.

I built **ContextVault** to make that project context searchable without relying on a hosted embedding API.

It scans a project folder on the developer's machine, chunks supported source files, generates embeddings through local Ollama (`nomic-embed-text`), and stores the index in SQLite. You can search from the local dashboard or expose search and indexing tools through MCP.

A few implementation details:
- Local Ollama embeddings and a local SQLite index.
- Semantic search over indexed project chunks.
- Live file monitoring for additions and changes.
- MCP tools for `search_context` and `index_project`.

The goal is not to replace a coding model. It is to give it a focused way to retrieve relevant project context when requested. When an MCP client calls a tool, it receives the result returned by that tool; the indexing and embedding pipeline itself runs locally.

I'd appreciate feedback from people using local models: what would make a local project-memory workflow genuinely useful in your setup?

**Links:** [Live landing page — add after deployment] · [Public download/repository — add after publication]

*Disclosure: I'm the developer of ContextVault. Sharing it for technical feedback.*

### r/cursor

**Suggested title:** I built a local project memory service that gives Cursor searchable code context through MCP

**Post:**

When I move between tasks in a codebase, I lose time finding where a behavior lives and rebuilding context from scratch. I wanted a way to search the project semantically and make the results available to an AI coding client without setting up a hosted indexing service.

That's why I built **ContextVault**. It indexes a local project with Ollama embeddings, stores the index in SQLite, and exposes project search through an MCP server. The dashboard generates the machine-specific MCP configuration, including the active Node.js executable and database path.

The workflow is simple:
1. Index a local project.
2. Let the local watcher keep the index updated as files change.
3. Connect Cursor through MCP and ask it to retrieve relevant project context.

The project indexing and embeddings stay in the local ContextVault/Ollama workflow. Cursor receives the MCP tool results needed for the request.

I'm looking for practical feedback from Cursor users: where would this fit into your current workflow, and what would you need before relying on it daily?

**Links:** [Live landing page — add after deployment] · [Public setup guide — add after publication]

*Disclosure: I'm the developer of ContextVault.*

### r/ClaudeAI

**Suggested title:** Built a local-first project memory tool for Claude Desktop using Ollama + MCP

**Post:**

I wanted Claude Desktop to retrieve useful context from a project without me repeatedly pasting file contents or manually explaining where things live.

I built **ContextVault**, a local-first project index with a web dashboard and an MCP server. It scans a project on your machine, creates embeddings with local Ollama, stores the index in SQLite, and provides semantic search plus project-indexing tools to MCP-compatible clients.

The Settings screen generates the MCP configuration for the current machine, including the active Node.js executable and absolute database path. That makes connecting the local MCP server less error-prone than copying a hard-coded example path.

A privacy detail worth being precise about: ContextVault's scanning, embedding generation, database, and search run locally. When Claude calls an MCP tool, Claude receives the result returned by that tool.

I'd love feedback from people using Claude Desktop with local tools: what context-retrieval features would be most useful to you?

**Links:** [Live landing page — add after deployment] · [Public setup guide — add after publication]

*Disclosure: I'm the developer of ContextVault.*

---

## Hacker News — Show HN

**Title:** Show HN: ContextVault – Local-first semantic memory for your codebase, with Ollama and MCP

**Post:**

Hi HN — I built ContextVault because I was tired of repeatedly reconstructing project context when moving between tasks or asking an AI coding assistant about an existing codebase.

ContextVault indexes a local project, chunks supported files, generates embeddings with local Ollama, and stores the searchable index in SQLite. You can search from a local web dashboard or connect an MCP-compatible client and expose two tools: `search_context` and `index_project`.

It also watches the indexed project for new and changed files. The dashboard generates the MCP configuration using the actual Node.js executable and active database path, avoiding machine-specific paths in hand-written config examples.

**Why local-first:** project scanning, embeddings, persistence, and semantic search run on the developer's machine. An AI client receives the MCP tool results requested by the user; the project index does not need a hosted embedding API.

**Stack:** Node.js, TypeScript, SQLite, Ollama (`nomic-embed-text`), Express, and the Model Context Protocol.

I'm especially interested in feedback on retrieval quality, indexing behavior on larger repositories, and how this fits into existing AI-assisted development workflows.

**Landing page:** [Add the live URL after GitHub Pages deployment]

**Public download/source:** [Add the public release URL before posting]

*I'm the developer. Happy to answer technical questions and discuss trade-offs.*

---

## Product Hunt

**Product name:** ContextVault

**Tagline:** Local-first memory for your codebase.

**Short description:** Search your project semantically with local Ollama embeddings, then connect the index to Claude Desktop, Cursor, and other MCP-compatible tools.

**Maker comment:**

Hey Product Hunt! I built ContextVault to solve a familiar developer problem: important project context gets buried across files, and we repeatedly spend time finding the same implementation details.

ContextVault creates a searchable index on your machine using local Ollama embeddings and SQLite. You can ask natural-language questions in its dashboard, keep the index updated with live file monitoring, or connect compatible AI tools through MCP.

The focus is straightforward: useful code context, locally indexed, and available to the tools you already work with. I'd love to hear how you manage project memory today and what you'd improve in this workflow.

**Pricing:** Free plan available; Pro is $9/month or $79/year.

**Topics:** Developer Tools · Artificial Intelligence · Open Source Alternatives (do not use the Open Source topic unless a public repository and license are available)

---

## Twitter / X — 5-post thread

**1/5**

Your codebase has context. But it's spread across files, folders, and implementation details you have to rediscover every time you switch tasks.

I built **ContextVault** to make that context searchable — locally.

**2/5**

ContextVault indexes a project on your machine, creates embeddings with local Ollama, and stores the searchable index in SQLite.

Ask a natural-language question and retrieve the code chunks most relevant to it.

**3/5**

No hosted embedding API is required for the indexing and search pipeline.

Your source files, embeddings, and index stay in your local ContextVault/Ollama setup. Connected AI clients receive the MCP results you ask them to retrieve.

**4/5**

ContextVault also exposes its capabilities through MCP:

• `search_context`
• `index_project`

Connect compatible tools such as Cursor or Claude Desktop. The dashboard generates the machine-specific MCP configuration for you.

**5/5**

The idea is simple: spend less time finding where something lives and more time building.

ContextVault has a Free plan, plus Pro at $9/month or $79/year.

[Live landing page — add after deployment]

---

## Pre-publication checklist

- [ ] Publish the landing page and replace its placeholder with the live URL.
- [ ] Make the repository public or publish a public release/download page; the current repository is private.
- [ ] Confirm the provided Lemon Squeezy checkout belongs to **ContextVault** and displays the $9/month and $79/year options before publishing it. The URL hostname currently says `witness-engine.lemonsqueezy.com`.
- [ ] Ensure GitHub Pages is enabled and the repository visibility/plan supports it.
- [ ] Choose and publish a repository license before making an open-source claim.
- [ ] Review each community's self-promotion rules and adapt the post to the discussion; do not cross-post identical copy without context.
- [ ] Verify every public link from a signed-out browser.

## Claims and wording guardrails

- Say **local-first** for project scanning, embedding generation, SQLite storage, and semantic search. Do not imply an AI client never receives code context: MCP tool results are returned to the connected client when requested.
- Describe search as semantic retrieval over indexed chunks. Do not claim benchmarked speed or accuracy figures without measurements.
- Do not call the repository open source until a public repository and an explicit license are published.
- Public pricing copy should show subscriptions only: **Free**, **Pro $9/month**, and **Pro $79/year**. Do not mention lifetime access or lifetime pricing.
