# Agensi Upload Guide — ContextVault v1.3.0

**Status:** Preparation only. This guide is not permission to publish. Update the existing ContextVault listing only after v1.3.0 has shipped and the Founder approves publication.

Listing: https://www.agensi.io/skills/contextvault

## 1. Listing and version

- Keep editing the existing ContextVault skill listing; do not create a duplicate.
- Set the listing version to 1.3.0 only after the matching application release is available.
- Keep the local-install requirement explicit. The Agensi skill does not install ContextVault or start the local MCP server.

## 2. Free vs Pro comparison

Paste the table from AGENSI_LISTING_v1.3.0.md into the listing description or the marketplace plan-comparison field.

| Capability | Free | Pro |
| --- | --- | --- |
| Projects | 1 project at a time | Unlimited |
| Eligible files per project | Up to 1,000 | Unlimited |
| Dashboard semantic search | Included | Included |
| MCP for Cursor / Claude Desktop | Not included | Full access |
| Live Monitoring | Not included | Included |

## 3. Release Notes / What’s New

Paste the Proposed release notes — v1.3.0 section from AGENSI_LISTING_v1.3.0.md only after the release is merged, tested, and published.

The two entitlement changes must be stated clearly:
- MCP tools index_project and search_context require a verified Pro license.
- Live Monitoring requires a verified Pro license.

## 4. Commercial details

The application currently contains an existing Lemon Squeezy checkout URL and a $9 monthly / $79 annual price. Do not change pricing or checkout terms in Agensi as part of this technical update.

**Verification required before publication:** the existing checkout URL uses the witness-engine.lemonsqueezy.com store subdomain. Confirm that it is the correct active ContextVault product checkout before directing Agensi users to it.

## 5. Publication checklist

- [ ] Entitlement PR merged after all prerequisite changes.
- [ ] CI green on Ubuntu and Windows for the final release commit.
- [ ] Verified Pro activation removes Free limits immediately.
- [ ] 1,001-file Free project returns HTTP 403 with the documented message.
- [ ] Existing indexed data is preserved when an oversized Free project is rejected.
- [ ] Free MCP tool calls return the Pro-only message.
- [ ] Free Live Monitoring attempts return the Pro-only message.
- [ ] Lemon Squeezy checkout URL and product ownership verified.
- [ ] Version 1.3.0 release is actually available.
- [ ] Existing Agensi listing previewed and manually approved before publishing.
