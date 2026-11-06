# Agensi Upload Guide — ContextVault v1.2.0

This guide is for the Founder to update the existing ContextVault skill listing manually. It does not change pricing, permissions, or the local-install requirement.

Listing: https://www.agensi.io/skills/contextvault

## 1. Approved screenshot

Upload this screenshot as the primary product screenshot:

**File:** `contextvault-v1.2.0-approved-ui.png`

[Download the approved ContextVault v1.2.0 UI screenshot](sandbox:/mnt/data/contextvault-v1.2.0-approved-ui.png)

Save the image locally before opening Agensi. Use the screenshot as-is; do not add captions or promotional text over the product UI.

## 2. Release notes — ready to copy

Paste this text into the listing's Release Notes / What's New field. If Agensi only provides a description editor, add it under a clearly labelled **What's new in v1.2.0** section.

```markdown
## ContextVault v1.2.0 — November 6, 2026

### What's new
- **New Premium UI:** A clean, high-contrast workspace inspired by Linear and Vercel, with a focused semantic-search area, a dedicated Add Project panel, compact index statistics, and a responsive layout.
- **Project-scoped indexing:** Indexed files are associated with their project root, so projects can safely contain files with the same relative path.
- **Stale File Cleanup:** After a project is scanned, embedded, and saved successfully, files that were deleted or renamed are reconciled out of that project's index.
- **Batch Embeddings:** Ollama embedding requests can process up to 16 chunks per batch, reducing per-request overhead.
- **Improved local setup:** Updated Windows installation and launch flows, including Ollama detection, winget-first installation with a manual fallback, IPv4 local health checks, and bounded startup recovery.
- **MCP Verified:** Both `index_project` and `search_context` were successfully exercised through MCP Inspector in Windows Sandbox.

### MCP smoke-test evidence
- `index_project` completed successfully and indexed 1 file and 1 chunk in the disposable SmokeTest project.
- `search_context` returned the expected `src/billing.ts` source containing `calculateMonthlyRevenue`.
- One MCP Inspector search call was observed at **229 ms end-to-end** in that specific Windows Sandbox session.

**Performance note:** 229 ms is one environment-specific observation, not a controlled benchmark, a universal latency guarantee, or evidence of a 100x speedup. Detailed embedding/model-load/vector-search profiling remains deferred.
```

## 3. Update the existing Agensi listing

1. Sign in to Agensi using the account that owns the ContextVault listing.
2. Open the existing ContextVault skill listing: https://www.agensi.io/skills/contextvault
3. Choose the listing's **Edit** or **Manage** action. Keep editing the existing listing; do not create a duplicate skill.
4. Update the listing version to **1.2.0**.
5. Upload `contextvault-v1.2.0-approved-ui.png` in the screenshots / media section. Set it as the primary screenshot when Agensi supports that option.
6. Paste the release notes from Section 2 into the Release Notes / What's New field.
7. Review the public description and confirm it still states that users must install ContextVault locally before connecting the local MCP server. The Agensi skill package provides instructions; it does not install the local application or start a local stdio server.
8. Preserve the existing price and permissions. Do not change the listing's Free pricing, access scopes, or any commercial terms as part of this version update.
9. Preview the listing. Confirm the image is readable, the version says **1.2.0**, and the release notes do not claim "100x faster".
10. Save / Publish the update using Agensi's available action. If Agensi requires a security rescan or review, submit it and wait for its result before announcing the listing update.

Agensi's exact button labels may vary. Do not publish a new listing or change pricing/permissions to complete this update.

## 4. Pre-publish checks

- [ ] Correct existing ContextVault listing selected.
- [ ] Version set to 1.2.0.
- [ ] Approved UI screenshot uploaded.
- [ ] Release notes pasted and previewed.
- [ ] Local installation prerequisite remains explicit.
- [ ] Existing Free pricing and permission scopes preserved.
- [ ] No "100x faster" or universal latency claim.
- [ ] Agensi security review / rescan completed if requested.

## 5. Validation status to keep accurate

The Founder-approved v1.2.0 code is merged to `main`. MCP connection, tool discovery, indexing, and semantic search were manually verified in Windows Sandbox.

The 229 ms value is one observed MCP Inspector call. Detailed Phase E performance profiling was deferred. Stale-file cleanup is implemented and an integration test is being added in the follow-up validation PR; do not call that integration test passed until CI confirms it.
