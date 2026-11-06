# Agensi Listing — ContextVault v1.3.0

**Status:** Draft for review. Do not publish until the entitlement PR is merged, release validation is complete, and the actual v1.3.0 application release is available.

**Skill name:** ContextVault  
**Proposed listing version:** 1.3.0  
**Primary category:** LLM Ops  
**Additional categories:** Agents & Orchestration; Data & Databases

## Summary

Search a local codebase by meaning from the ContextVault dashboard. Developers can evaluate semantic search on one project for free, then upgrade to Pro to connect ContextVault to Cursor or Claude Desktop through MCP, keep their local index updated with Live Monitoring, and remove project and file-count limits.

> **Local installation required.** The Agensi skill provides instructions only. Users must install ContextVault, Node.js, and Ollama locally. The MCP integration requires a compatible local client that can launch a stdio MCP server.

## Free vs Pro

| Capability | Free | Pro |
| --- | --- | --- |
| Indexed project roots | 1 project at a time | Unlimited projects |
| Eligible files per project | Up to 1,000 | Unlimited |
| Dashboard semantic search | Included | Included |
| Local Ollama embeddings and SQLite index | Included | Included |
| MCP integration with Cursor / Claude Desktop | Not included | Full access |
| MCP tools | Not included | index_project, search_context |
| Live Monitoring | Not included | Included |
| License key | Not required | Verified license key |

The 1,000-file limit applies to files eligible for indexing after ContextVault built-in exclusions and file-size rules. It is not a count of every filesystem entry.

## What Pro adds

**Bring your codebase directly into the AI coding workflow.** Pro lets Cursor and Claude Desktop retrieve relevant project context through the local MCP server, rather than relying on manually copied snippets. Live Monitoring updates the local index as project files are added or changed. Unlimited projects and files remove the Free plan project and corpus boundaries.

Pro is intended for developers who use AI coding tools regularly and want a reusable, current codebase context—not simply a larger one-time index.

## Privacy and data handling

Project scanning, embedding generation, and SQLite index storage run locally through ContextVault and Ollama. ContextVault does not use a hosted embedding API for indexing. When MCP returns code snippets to an AI client, that provider may process the snippets under its own settings and data-handling terms. Do not describe the entire workflow as fully offline unless the connected model also runs locally.

## Requirements

- ContextVault v1.3.0 installed on the same computer as the supported AI client.
- Node.js 22.13 or newer.
- Ollama with nomic-embed-text.
- The documented local MCP setup for Claude Desktop or Cursor.
- A verified Pro license key for MCP and Live Monitoring.

## Proposed release notes — v1.3.0

- **Clear Free / Pro entitlements:** Free supports one indexed project and up to 1,000 eligible files. Pro removes project and file-count limits.
- **MCP is now Pro:** index_project and search_context require a verified Pro license when called through the local MCP server.
- **Live Monitoring is now Pro:** Live file watching requires a verified Pro license.
- **Enforced API and pipeline limits:** The Free file cap is checked before an indexing job is accepted and again at the indexing pipeline boundary.
- **Plan comparison in Settings:** The dashboard shows the active plan, its limits, and the Pro benefits.
- **Immediate entitlement refresh:** After a valid license key is activated, the dashboard updates the plan badge and Pro controls without restarting the application.

## Official links

- Source code: https://github.com/ahmedfayedesmail-ui/contextvault
- Installation and MCP setup guide: https://github.com/ahmedfayedesmail-ui/contextvault/blob/main/README_MCP.md
- Agensi listing: https://www.agensi.io/skills/contextvault

---

## Internal publication gate — not listing copy

- [ ] PR and CI approved on Windows and Ubuntu.
- [ ] PR #7 and PR #8 integration order resolved before merging this entitlement PR.
- [ ] Free file limit tested with 1,000 and 1,001 eligible files.
- [ ] MCP and Live Monitoring denied on Free and allowed with verified Pro.
- [ ] Lemon Squeezy checkout URL and ContextVault product ownership verified.
- [ ] Release version and build artifacts actually published before changing the Agensi listing to v1.3.0.
- [ ] Agensi copy and screenshots previewed before publication.
