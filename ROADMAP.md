# ContextVault Roadmap

This roadmap records candidate improvements for a future release. These are proposals, not committed delivery dates or promises. The v1.2.0 codebase remains in Code Freeze; implementation requires a separately approved scope and release plan.

## v1.3 candidates

### 1. Hybrid Search

Combine SQLite FTS5 full-text retrieval with the current semantic vector search.

Candidate behavior:
- Run keyword/full-text and semantic retrieval in parallel.
- Merge and rank results using a documented strategy such as Reciprocal Rank Fusion (RRF).
- Preserve source paths and line ranges for every result.
- Allow queries that contain exact identifiers, error messages, symbols, or conceptual descriptions to benefit from both retrieval modes.
- Add evaluation fixtures for exact-name, partial-keyword, and semantic queries.

### 2. Token Budget Estimation

Estimate the token cost of retrieved code context before it is passed to an AI client.

Candidate behavior:
- Display an estimated token count for each result and for the combined context.
- Allow a configurable context budget.
- Prioritize and truncate results predictably when the requested context exceeds that budget.
- Make clear which tokenizer/model profile is used. Treat counts as estimates when the connected AI provider or tokenizer is unknown.

### 3. Automatic .gitignore Support

Read applicable .gitignore files during project scanning and live monitoring.

Candidate behavior:
- Respect root and nested .gitignore rules, negation patterns, and directory scopes.
- Combine Git ignore rules with ContextVault's built-in safety exclusions and file-size limits.
- Make it clear which files are excluded and why.
- Add fixtures for nested rules, negated patterns, and files added after the watcher starts.
- Never follow symbolic links outside the selected project root without an explicit future security decision.

### 4. Further Free / Pro Entitlements

The first project-count boundary is being implemented in PR #3:
- Free: one indexed project root at a time; re-indexing that same root is allowed.
- Pro: no plan-based project-count cap.
- The check covers HTTP indexing, live-watcher setup, and the MCP `index_project` tool.
- Positive and negative tests cover Free rejection, same-project re-indexing, and verified Pro access.

Remaining product decisions:
- Whether any capabilities beyond project count should differ between Free and Pro. MCP and live monitoring currently remain available in both plans.
- Whether Pro includes priority support, and what response-time commitment (if any) can actually be met.
- Whether a separate commercial agreement or license is needed for a third party making a competing commercial product.

Implementation principle:
- Enforce every entitlement server-side for all applicable HTTP and MCP entry points, not only by hiding UI controls.
- Keep the plan table, product UI, checkout terms, Agensi listing, and license agreement consistent.
- Add positive and negative tests for every new plan boundary.

### 5. Project-Scoped Search

Add an optional project-root filter to semantic search so a shared local database can contain multiple projects without mixing their results.

Candidate behavior:
- Add a project selector/filter to the dashboard.
- Add an optional validated project identifier or root selector to the search_context MCP tool.
- Preserve an all-project search mode when the user explicitly chooses it.

## Release discipline

- No v1.3 candidate is implemented by this document.
- Each feature requires an owner decision, acceptance criteria, security/privacy review where relevant, and automated test coverage.