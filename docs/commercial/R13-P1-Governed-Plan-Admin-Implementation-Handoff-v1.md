# R13-P1 — Governed Plan Administration: Implementation Handoff v1

**Date:** 2026-11-11
**Scope:** R13-P1 draft PR #693 only. **Not deployed or production-approved.**
**Precondition:** R13-P0 draft PR #654 must receive independent security/DBA approval, explicit authorization, and a verified migration release before a production P1 database module can be integrated.
**R2 constraint:** User-requested staging hold remains in force; no use of the production or recovery-rehearsal database as disposable staging.

## Delivered now (review-only / synthetic)

1. Four proposed workspace tiers in `docs/commercial/r13-p1-pricing-proposal-v1.json`: Free ₹0, Basic ₹1,499, Growth ₹3,499, Pro ₹6,999 per month. Versioned proposal artifact; never seed these into SaaS tables without owner approval.
2. Pure plan approval rules in `research/r13-p1/plan-governance-preview.cjs`, with signed-off-for-design state deliberately **not** meaning activated.
3. An isolated, process-local review ledger in `research/r13-p1/plan-review-ledger-preview.cjs`. Callers pass opaque session handles; an injected **trusted synthetic session resolver** supplies identity/role. Review events have a sequential, hash-linked read-only history.
4. Synthetic, session-resolved tenant-read projections; wrong-tenant reads are denied. The resolver and tenant-evidence loader are fixtures, not production authentication, RLS, or a durable subscription repository.
5. Three suites of Node readiness tests run by GitHub CI: price/guard contract, independent review negatives, and audit/tenant-isolation negatives.

**Never describe this as a functioning persistent plan-admin UI, secure real JWT session check, commercial payment processing, released Free plan, or real tenant data service.** Those do not yet exist.

## Canonical boundaries to preserve

| Concept | Existing/planned canonical source | P1 treatment |
| --- | --- | --- |
| Organization access lifecycle | `organizations.status` | No automatic suspension/archival when payment status changes |
| Subscription commercial lifecycle | P0 `saas_organization_subscriptions` (draft, unmerged) | Do not auto-assign subscriptions to legacy organizations |
| Optional runtime capabilities | R11 `organization_capabilities` | Do not enable on approval or entitlement change |
| Commercial entitlements | P0 `saas_plan_entitlements` (draft) | Eligible allowances only, not activation |
| Plan catalog | P0 `saas_plans` (draft) | No price seeds, no public visibility before approvals |
| Real CRM course/customer payments | `public.payments` | Untouched; never used for SalsysOS invoices/subscriptions |
| Dedicated SaaS billing and tax invoices | R13-P3 (not built) | Outside P1 |
| Privacy/tracking/AI/provider integrations | Independent R2/AI/provider gates | Plan eligibility is never provider authorization |

## Proposed durable P1 architecture (NOT IMPLEMENTED)

### A. Price/version history must not be squeezed into P0 `limits`

**Design proposal requiring review:** A separate immutable price book (candidate: `saas_plan_price_versions`) per plan, version, currency, period, price and effective window. Prices should be stored as integer minor currency units or exact decimals with explicit tax treatment, not floating point. Treat `saas_plans.version` as a current version indicator, never as complete history.

- Keep prior versions for active customer-contract reconciliation.
- Do not backfill subscriptions or attach prices until actual tenant agreements permit it.
- An approved price is not a charge or payment-provider product.
- Plan quotas and setup charges require exact separately approved definitions and provider-cost assumptions.

### B. Author / submit / review / activate separation

**Design proposal requiring review:** `saas_plan_change_requests` holds immutable proposed snapshots + hash, expected base version, author, submission status; `saas_plan_review_events` append-only event history links author/reviewer and reason.

- Authenticated platform operator (independent server-side verified session) creates draft.
- Author submits exact snapshot and base version.
- A different authorized reviewer approves/rejects that exact digest; no author self-approval.
- Independent, explicitly authorized *release/activation* action (later P1 checkpoint) checks the review, current version, privacy/security gates, and transaction idempotency; a review is not deployment approval.
- No `SECURITY DEFINER` RPC exposed to public roles. Schema/table privileges and RLS must be checked, including effective inherited grants.
- Stable database txn ordering, conflict handling and audit on commit; never use process-local in-memory ledger as real evidence.
- Avoid granting direct SaaS commercial tables to `anon` or `authenticated`; any future limited customer read API must use strict server-derived session and organization membership, not request-supplied role claims.
- Revoked sessions and expired owners must fail closed.

### C. Tenant-visible account views

**Design proposal requiring review:** `GET /api/billing/plan` or equivalent (not created) resolves active authenticated organization on the server and returns only minimal, appropriate plan information for that organization. Do not include provider identifiers, other organizations' subscriptions, admin review records, prices under negotiation, or unverified entitlement activation. Cross-organization ID switching must fail closed.

No live endpoint exists today. R13-P1 proof-of-concept `readTenant` uses strictly synthetic fixtures to model the intended denial rules; this is **not** a real security assurance.

### D. Quotas and plan changes

1. First audit where all write paths create or delete leads, users, media and tokens. A UI limit is **never** enforcement.
2. Free record/user quotas are **provisional only**: 1/250, 2/2k, 5/10k, 10/50k.
3. If a plan is downgraded, prevent unauthorized *new* use after grace/policy approval; never silently erase existing leads, attachments or logs.
4. Plan upgrades must not activate a WhatsApp/Instagram/Ads/web behavior connection without that provider's independent release and consent checks.
5. SaaS billing provider, failed payments, cancellation, invoices and entitlements at runtime are independent R13-P3/P4 checkpoints.

## Acceptance plan before production P1

- [ ] R13-P0 independent PR review and exact-head CI/migration replay/rollback gates confirmed
- [ ] Owner approves exact prices, quotas, taxation, setup policy, mandatory managed-onboarding obligations and terms
- [ ] Platform-admin authority model validated against actual SalsysOS server-side auth/profile/membership code
- [ ] Dedicated reviewer authority defined with user security/session-revocation semantics
- [ ] DBA signs off price history, append-only review events, versioned mutations and rollback
- [ ] Local disposable PostgreSQL verifies table grants, RLS, concurrent version conflict, author self-review and audit immutability
- [ ] Real second-tenant read/write denial witnessed in appropriate authorized isolated environment
- [ ] No public or customer billing/self-service endpoint in P1 without downstream P2/P3 approval
- [ ] Separate owner-approved merge, deployment, smoke and rollback plan, with no lift of the R2 staging hold by implication

## Verification and evidence rules

- Latest CI and CodeQL must pass on the precise head commit; a green previous head is not transferable.
- Synthetic tests validate the prototype's logic, **not** real auth, tenant safety, subscriptions, billing, or operational readiness.
- Do not claim first paying customer from prospects, pricing drafts, revenue estimates, or synthetic data.
