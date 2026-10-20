# Customer Journey / Person 360 / Identity — V1 Production-Integrity Closeout

**Date:** 2026-10-20  
**Area:** Customer Journey / Person 360 / Identity  
**Status:** CLOSED at V1 production-integrity level  
**Production tenant:** Yogakulam Academy  
**Implementation PR:** #87 — `Close out Customer 360 and identity integrity V1`  
**Production merge SHA:** `d6de657f468e8ba01c8f460bd0b09fd49aeb4497`

## 1. Closeout objective

Close the second ordered product area only after proving that the production Person graph, identity links, exact-session handoff, journey projections and tenant boundaries are structurally healthy and that future identity writes are protected by explicit database contracts.

This milestone does not claim that live Yogakulam Universal Tracking cutover, revenue attribution, predictive accuracy or later autonomy work is complete.

## 2. Production audit before hardening

The Yogakulam production graph was already structurally healthy before the final hardening change:

- 31 CRM leads;
- 31 Persons;
- 31 Person-to-lead links;
- 57 Person identifiers;
- 39 Person-to-session links;
- 22 current visitor routing records;
- 0 open identity conflicts;
- 0 lead/Person tenant mismatches;
- 0 identifier tenant mismatches;
- 0 identifiers shared across different Persons;
- 0 Person/session tenant mismatches;
- 0 leads without exactly one Person;
- 0 orphan Persons;
- complete Person 360 coverage;
- complete operational Person 360 coverage;
- complete lead journey coverage;
- complete Person journey coverage;
- 0 duplicate canonical journey keys.

Historical reuse of the same anonymous browser visitor ID by more than one lead was observed and intentionally preserved as history. The authoritative rule is exact-session identity, not permanent browser-to-human identity.

## 3. Remaining architectural gaps found

Three production-integrity gaps remained:

1. exact-session identity handoff was performed through several server/database calls instead of one atomic database transaction;
2. `visitor_identity_links` had organization and lead fields but lacked a composite organization+lead foreign-key guarantee;
3. identity-resolution policy defaults were implicit for organizations without an explicit policy row and were too permissive for a single weak unverified signal.

## 4. Changes implemented in PR #87

### Atomic exact-session identity boundary

Added service-role-only RPC:

`attach_exact_session_identity_v1(...)`

The function performs one tenant-bound transaction that:

- validates the organization and lead relationship;
- validates the exact `session_key` + `anonymous_visitor_id` inside the same organization;
- updates current visitor routing state;
- attaches only the exact session and its touchpoints to the resolved lead;
- refreshes attribution through the established attachment path;
- reconciles the canonical Person graph;
- returns the resolved Person/identity result.

Both identity HTTP surfaces now call this same atomic RPC instead of independently performing multi-step identity mutations:

- `/api/events/identify/v1`;
- `/api/tracking/identify`.

Authentication, source-derived tenancy, rate limiting and compatibility behavior remain at the HTTP boundary.

### Tenant-bound visitor routing

`visitor_identity_links` now has composite `(organization_id, lead_id)` referential protection against the tenant-bound lead key.

The table remains current-session routing state, not permanent Person identity.

### Conservative explicit identity policy

Every organization now receives an explicit identity policy. Future organizations receive one automatically.

Default V1 policy:

- `auto_link_threshold = 0.9800`;
- `ambiguity_margin = 0.0800`;
- `policy_enabled = true`;
- a lone unverified email/telephone signal cannot independently auto-merge two people.

Active organizations are protected from accidental policy deletion.

### Integrity telemetry

Added:

`v_customer360_identity_integrity_health_v1`

The view covers:

- exactly-one-Person-per-lead integrity;
- orphan Persons;
- Person/lead tenant lineage;
- identifier tenant lineage;
- duplicate identifier ownership;
- Person/session tenant lineage;
- lead-session to Person-session reconciliation;
- visitor routing tenant integrity;
- current exact-session routing integrity;
- open identity conflicts;
- missing identity policy;
- Person 360 and operational Person 360 coverage;
- complete journey coverage;
- lead journey coverage;
- journey tenant lineage;
- duplicate canonical journey keys.

It deliberately does not flag historical shared-browser visitor reuse as corruption when the current exact-session routing state is correct.

## 5. CI and deployment verification

PR #87 initially exposed a stale CI contract that expected the old multi-step route implementation. The verifier was corrected to assert the new atomic RPC boundary rather than requiring implementation details that had intentionally been removed.

Final PR verification:

- Universal Tracking Intelligence SDK verifier: PASS;
- Intelligence accuracy verifier: PASS;
- prediction freshness verifier: PASS;
- prediction calibration verifier: PASS;
- WhatsApp Operations verifier: PASS;
- WhatsApp Broadcast Runner verifier: PASS;
- WhatsApp Growth verifier: PASS;
- Instagram Operations verifier: PASS;
- CRM Core closeout verifier: PASS;
- Customer 360 Identity closeout verifier: PASS;
- TypeScript typecheck: PASS;
- Next.js build: PASS;
- preview Vercel deployment: READY.

After merge, main CI run **#243** completed successfully for SHA `d6de657f468e8ba01c8f460bd0b09fd49aeb4497`.

Production Vercel deployment:

- deployment ID: `dpl_GfDmtZ5Wi5aBHoZn5f3u1CjjaZib`;
- target: production;
- state: `READY`;
- commit: `d6de657f468e8ba01c8f460bd0b09fd49aeb4497`.

## 6. Production database verification

Migration `20261020114000_customer360_identity_closeout_v1.sql` was applied successfully to the production Supabase project.

Yogakulam policy after migration:

- threshold `0.9800`;
- ambiguity margin `0.0800`;
- enabled `true`;
- metadata explicitly records conservative auto-link posture.

The new identity RPC and policy guard functions are executable by `service_role` only; `anon` and `authenticated` do not have execute permission.

Production integrity health for Yogakulam after migration:

- lead count: 31;
- Person count: 31;
- identifier count: 57;
- Person-session count: 39;
- current visitor routing count: 22;
- every audited integrity error counter: 0;
- `integrity_issue_count = 0`;
- `health_status = healthy`.

## 7. V1 closeout decision

**Customer Journey / Person 360 / Identity is CLOSED at V1 production-integrity level.**

The closeout means the audited structural and transactional invariants are healthy in production and future exact-session identity handoffs use the hardened atomic boundary.

It does not mean the system will never receive further Person 360 features. Future enhancements can be added without reopening this V1 integrity milestone unless they break one of the audited invariants.

## 8. Next ordered area

The next area is:

**Universal Tracking SDK + Consent — live production closeout.**

Required proof now shifts from architecture/code readiness to controlled live Yogakulam production evidence: direct SDK installation, consent/GPC behavior, canonical browser events, exact-session form/lead identity linkage and no duplicate tracking authority.
