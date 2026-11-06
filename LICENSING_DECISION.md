# ContextVault Licensing Decision

**Status:** FSL-1.1-MIT selected and published in the repository root as `LICENSE`. The notice names Ahmed Fayed Esmail as copyright holder/licensor.

## The key trade-off

The goals “OSI-approved open source” and “prevent companies from using the code commercially” cannot both be satisfied by one license.

The Open Source Definition requires that an open-source license allow use in any field of endeavor, including commercial use. A restriction that blocks commercial use by large companies makes the software source-available or Fair Source, not OSI-approved open source.

## Options

### Option A — MIT

Choose MIT if the priority is broad adoption and a conventional open-source community.

- OSI-approved open-source license.
- Allows commercial use, modification, redistribution, and sublicensing, subject to the notice and warranty terms.
- Does not prevent a large company or competitor from selling a commercial product based on the code.

This does not meet the stated goal of preventing commercial free-riding.

### Option B — FSL-1.1-MIT (selected)

The Functional Source License is a Fair Source / source-available license, not an OSI-approved open-source license.

- Permits internal use, study, modification, and redistribution for permitted purposes.
- Prohibits “Competing Use”: making the software available to others in a commercial product or service that substitutes for ContextVault or offers the same or substantially similar functionality.
- Provides a future MIT license grant on the second anniversary of the date that each version is first made available under FSL.
- Does not block a large organization from using ContextVault internally. It targets competitors who would commercialize a substitute product or service.

Official text and terms:
- https://fsl.software/
- https://github.com/getsentry/fsl.software/blob/main/FSL-1.1-MIT.template.md

This is the closest fit if the business objective is to let developers and companies adopt ContextVault internally while preventing a third party from repackaging it as a competing commercial product without a separate agreement.

### Option C — PolyForm Small Business 1.0.0 (if the goal is to block large organizations from using it for their own business)

This is also source-available, not open source.

- Company-benefit use is permitted only if the company has fewer than 100 employees and independent contractors **and** revenue below the license's inflation-adjusted USD 1,000,000 threshold.
- Organizations outside those thresholds would need separate permission from the licensor.
- This is more restrictive than FSL for customers: it can prevent a large company from using ContextVault internally, not merely from reselling a competing product.

Official text:
- https://polyformproject.org/licenses/small-business/1.0.0

## Decision and operational implications

**FSL-1.1-MIT is the adopted license.** The operative license text is in the root [LICENSE](LICENSE) file. Use “Fair Source” or “source-available” wording; do not describe ContextVault as OSI-approved open source while the competing-use restriction applies.

The license permits internal use and access by businesses of any size. It prohibits offering ContextVault, or software with the same or substantially similar functionality, to others as a competing commercial product or service without separate permission. Each version made available with these terms receives an additional MIT license grant effective on its second anniversary.

The license does not itself define the commercial Pro subscription or its service entitlements. The $9/month and $79/year Pro plan adds unlimited project indexing compared with the one-project Free limit. The plan and checkout terms should describe that product entitlement separately; do not suggest that paying for Pro is required for ordinary internal use permitted by FSL.

The current Pro activation flow verifies a Lemon Squeezy key and records the Pro state. The project-count limit is enforced in the application entry points (HTTP indexing, live-watcher setup, and MCP indexing) in the accompanying implementation branch. Further plan entitlements, support promises, and any commercial licensing arrangements require their own explicit terms and implementation.

This memo records the product's licensing rationale. The root `LICENSE` file is the controlling license text; obtain qualified legal review for commercial licensing agreements and any questions about ownership or third-party contributions.