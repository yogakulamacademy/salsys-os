# R13-P0 — Independent Review and Release-Gate Checklist (draft)

**Prepared:** 2026-11-11  
**Scope:** Existing draft PR #654, `feat/r13-p0-commercial-state-draft-v1`.  
**Mode:** Review and tests only. No production migration, tenant writes, billing provider connection, new paid staging, or customer activation authorized.

## What is already implemented in the draft

- Four separate SaaS-commercial tables: `saas_plans`, `saas_plan_entitlements`, `saas_organization_subscriptions`, `saas_subscription_events`.
- An operator-only `saas_commercial_readiness_v1` view, intentionally `security_invoker`.
- Constrained subscription lifecycle and one canonical record per organization.
- Append-only event history and automatic creation/update audit, with composite tenant FK.
- No plan/pricing seeds or backfills. Existing CRM `public.payments` is unrelated to SaaS billing.
- No public signup, customer plan administration, automatic bill collection, or suspension/enforcement.

## Independent review questions — do not infer approval from CI

| Gate | Reviewer must verify | Present status |
| --- | --- | --- |
| Dependency compatibility | Migration runs after existing `organizations`, `capability_catalog`, `organization_capabilities` and `set_updated_at()` dependencies, with no collision in existing schema | Local replay passed on earlier head; new exact head requires CI |
| RLS and privilege boundary | All four public tables have RLS; `anon` and `authenticated` have no effective SELECT/INSERT/UPDATE/DELETE/TRUNCATE/REFERENCES/TRIGGER privileges; view also has no client read | Added full matrix local assertion; unreviewed |
| Function exposure | `saas_subscription_audit_v1()` and `saas_subscription_event_immutable_v1()` cannot be called directly by `anon` or `authenticated`; trigger execution still works | Added negative privilege assertions; unreviewed |
| Tenant boundary | An event cannot reference an existing subscription with another `organization_id`; at most one canonical subscription row exists per organization | Existing rollback-only tests; independent review pending |
| Evidence integrity | The event history is immutable under UPDATE, DELETE and TRUNCATE; transitions are emitted in the same transaction | Existing rollback-only tests; independent review pending |
| No accidental commercial activation | No pricing, SaaS payment, provider customer, trials, or real subscriptions are seeded; `past_due` does not suspend a tenant | Existing tests; independent review pending |
| Capability separation | Entitlement drift is reported only; `organization_capabilities` is never written from P0 | Existing tests; independent review pending |
| Rollback + recovery | Reviewer approves concrete backup, recovery, revert and compatibility strategy before any hosted installation | Open |
| Production invariant | Existing tenant memberships, statuses, onboarding, workspaces, access and CRM customer payment state remain untouched | Must be witnessed before/after separately approved release |
| Authorization | Owner provides specific written production-migration release authorization after reviews | Open |

## Verification sequence

1. Pin the exact PR #654 head and inspect all six changed files; do not review a stale SHA.
2. Review the migration source, SQL fixture, and source-test changes together. No broad `SECURITY DEFINER` function should be exposed as an RPC.
3. Require full CI, CodeQL and clean *historical* Supabase migration replay on that exact head. A passed source-pattern test alone is insufficient.
4. Confirm the disposable replay actually executed `tests/database/r13-commercial-state-full-local.sql`, including privilege matrix, append-only history, tenant-FK negatives and final `ROLLBACK`.
5. Obtain independent security/DBA/rollback approval. Reconfirm target database, migration ledger and existing organizations with read-only metadata.
6. If an actual install is ever authorized, use a separately approved environment and explicit release plan. **R2 staging remains on hold; do not repurpose it or silently install this migration.**
7. Record truthful post-install read-back evidence, including no synthetic rows, unchanged tenant/workspace/capability state, and existing CRM smoke health.

## Intentionally not included

P1 plan administration, P2 self-service trials, P3 billing adapter/webhooks/invoices, P4 commercial enforcement/offboarding, prospective customer activation and any migration applied to Production.

**Decision at this checkpoint:** R13-P0 implementation exists in a draft PR and its test coverage is being strengthened. It is **not released or formally completed**. Independent review and an explicit separate release authorization remain outstanding.
