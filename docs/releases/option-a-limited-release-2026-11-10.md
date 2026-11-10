# SalsysOS Option A — Limited, no-new-processing release boundary

**Prepared:** 2026-11-10
**Baseline:** production-matching `main` commit `33320481438af68eb4ec2584369e9aadce36fd37`
**Release status:** REVIEW CANDIDATE ONLY — not merged, not deployed, not an authorization.

## Objective

Preserve the working production CRM and manually initiated, human-reviewed Co-Pilot/Knowledge workflows while preparing a small, auditable release track that **does not introduce** the draft website Knowledge discovery, new processing/retention obligations, governed AI execution, read-only agent tools, MCP, autonomous replies or database schema changes.

This first PR intentionally adds only this release record and a source-boundary regression test. **It does not deliver a new customer-facing feature**, install a runtime kill switch or itself constitute a production AI release. Subsequent customer-facing Option A fixes must be separate, independently reviewed, individually tested PRs based on current main.

## Exact scope

| Area | Option A candidate | Explicit limitation |
| --- | --- | --- |
| Existing CRM UI, lead capture, R2 tracking, Auth and policies | **Unchanged** | This PR does not validate or alter existing live behavior |
| Existing Co-Pilot action | **Unchanged**; manual staff-requested draft generator | May still make its **existing** Anthropic calls when configured and invoked; do not claim all model calls disabled |
| Existing manual source-backed Knowledge management/retrieval | **Unchanged** | Still subject to existing session/RLS and approval checks; no new automatic crawling |
| Draft Knowledge Builder discovery routes, worker, consent or retention SQL | **Excluded** | #601, #613, #614 remain open; no new lawful basis, consent grants or retention clock |
| Draft AI governance/system-prompt execution, tool/MCP bridge, AI-11B candidate guard | **Excluded** | #612/#677 remain open; a source-only reviewed proposal is not live wiring |
| Hosted Supabase changes, project provisioning, secrets, external web crawling | **None** | Staging remains on owner hold; no chargeable action |
| GitHub/Vercel configuration, `main` branch rule changes | **None** | Requires separate approved administration |
| This PR | Documentation and `node --test` negative boundary checks | CI is synthetic source evidence, not independent release acceptance |

## Engineering check

`tests/readiness/option-a-limited-release-boundary.test.cjs` runs automatically in the existing `npm run test:readiness` (CI `validate` job). It checks **known paths** from the deferred integration are not imported/present and verifies the existing manual Co-Pilot and Knowledge actions remain in their known source shape. It is intentionally fail-closed if one of those deferred paths lands on main without consciously retiring the gate.

This static check is **not** a complete runtime, environment, dependency or downstream-data-flow audit. In particular, absence of a matched path/keyword does not prove every route cannot perform an external call. Do not use a green result to claim existing functions, credentials, auto-send settings or tenancy are independently safe.

## Release rules — do not shortcut

1. Verify **only** this scope's source files changed against the pinned main baseline. No unreviewed integration cherry-pick, SQL migration or secrets.
2. Require fresh CI `validate` including readiness and build; CodeQL must pass. Treat checks as engineering evidence only.
3. A distinct, qualified, conflict-free code/security reviewer must inspect and approve this exact PR head. Previously dismissed reviews by a project-owner-controlled account do not count; any reviewer identity/control dispute must be resolved outside public GitHub.
4. The release owner verifies there are no new customer-facing features and explicitly approves the narrow merge. Inspect Vercel team/project, then verify production deploy's exact Git SHA/health. Roll back to previously verified working release if deployment regresses.
5. Do not mark #601, #612, #613, #614 or #677 closed by merging this candidate. The full AI/Knowledge Builder production release is **not** included, and its 16-case isolated staging acceptance remains **0/16**.
6. Any later Option A feature increment requires a new isolated PR, security review and appropriate tests. Do not remove this source boundary except through an explicitly scoped, reviewed transition to Option B.

## Next useful Option A increments (separate work)

- Non-sensitive, read-only staff experience improvements using the **already deployed** schema and services.
- Existing workflow guard fixes only after their runtime behavior and side effects are fully reviewed.
- Operator-visible readiness messaging that truthfully distinguishes existing manual Knowledge from **unreleased** automated discovery; no false indication of new functionality.

**No deployment action is authorized by the existence of this document, test, branch or PR.**
