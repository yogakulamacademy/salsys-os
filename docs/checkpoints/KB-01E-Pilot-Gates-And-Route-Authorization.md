# KB-01E — Pilot controls and route authorization (draft)

Date: 2026-11-06
Repository: yogakulamacademy/salsys-os
Branch: feature/kb01-public-website-scope
PR: #538 (draft)

## Implemented in this checkpoint

1. Fixed the previous Playwright outage-test selector. The application showed the correct error, but the test matched both the application's alert and the Next.js route announcer.
2. Added `lib/knowledge-discovery/pilot-gate.ts`. Scan startup and the scheduled worker are disabled by default.
3. The pilot requires `KNOWLEDGE_DISCOVERY_PILOT_ENABLED=true` and an exact `KNOWLEDGE_DISCOVERY_ALLOWED_HOSTS` allowlist. `KNOWLEDGE_DISCOVERY_PAUSED=true` immediately stops new claims and scan starts, irrespective of enablement.
4. Both admin POST start and worker request revalidate the allowlisted domain. A queued job for a domain removed from the allowlist cannot make new outbound requests; a lease already in progress is *not* remotely killed instantly.
5. The discovery GET route can show that the pilot is paused without selecting uninstalled discovery tables. It explicitly returns `historyAvailable=false`, and the UI labels history unavailable rather than falsely saying no past scans exist.
6. The UI disables Start discovery when the server reports pilot disabled. Cancellation remains available at the route level when the pilot is paused, subject to authentication and schema availability.
7. Added deterministic unit tests for default-off, allowed exact hosts vs lookalikes, and pause override.
8. Added route-handler unit tests for unauthenticated/non-admin requests, cross-site origins, paused pilot, bad hostname, and approved organization-scoped start.

## Configuration — DO NOT enable in production yet

```env
KNOWLEDGE_DISCOVERY_PILOT_ENABLED=false
KNOWLEDGE_DISCOVERY_PAUSED=true
KNOWLEDGE_DISCOVERY_ALLOWED_HOSTS=
KNOWLEDGE_DISCOVERY_RUNNER_SECRET=
```

These are server-only variables, never NEXT_PUBLIC_* and never browser credentials.
No scheduler has been configured; no website has been scanned in any hosted environment.

## Verification evidence

- KB-01C: isolated PostgreSQL RLS, lease and cancellation tests passed in previous CI.
- KB-01D: synthetic site against actual worker core and disposable PostgreSQL passed previously.
- KB-01E: Latest commit CI and CodeQL must pass before checkpoint completion. Test evidence is visible in PR #538's Actions checks.
- The previous CI failed only because the outage test had a broad role=alert locator matching Next.js's route announcer and application alert; the locator was narrowed.

## Staging and release blockers

- Available Supabase projects seen by connector: **SalsysOS Production** and **SalsysOS Recovery Rehearsal**. There is not a separately identified dedicated staging project. Neither was modified for KB-01E.
- Dedicated staging database and HTTP environment, separate from production and recovery rehearsal, are required for full route-to-PostgREST and real HTTPS socket acceptance.
- Proposed SQL is still in docs/sql/KB-01B-discovery-schema-DRAFT.sql. Do not apply it to production. Generate an official migration via Supabase CLI, reconcile the schema/migration ledger, and verify on isolated staging.
- Pilot host allowlisting is not proof of customer domain ownership. Before general launch, implement a challenge-based domain verification and per-organization scan budgets/cooldown.
- Stopping new worker claims does not preempt an in-flight network request; actual cancellation is lease-validated on database commit. Validate pause, cancellation and graceful shutdown under load in staging.
- Main branch has diverged; at the last comparison main had 10 commits not in the feature branch, and both changed .github/workflows/ci.yml. Reconcile without discarding other developers' work.
- No AI extraction or knowledge publishing is implemented in KB-01. Discovery captures only page metadata.

## Non-actions

No production DB write, migration, merge, live crawl, credentials, Vercel deployment, or customer message.
