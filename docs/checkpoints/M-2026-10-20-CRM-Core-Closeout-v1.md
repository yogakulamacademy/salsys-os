# Milestone — CRM Core Closeout V1

**Date:** 2026-10-20  
**Repository:** `yogakulamacademy/salsys-os`  
**Production merge:** `f16d59f22f46fe5d7211b95570a0a11f79873521`  
**Implementation PR:** #85 — `Close out CRM core integrity V1`

## Scope

This checkpoint closes the ordered roadmap area **Core CRM + lead/customer management** at V1 production-integrity level. It does not claim that tracking, predictive intelligence, cross-channel live proof, or later R11–R14 work is complete.

The acceptance boundary for this closeout is the integrity of tenant-scoped lead/customer records and the canonical CRM workflow paths: lead identity/contact records, stage history, Person linkage, attribution presence, follow-up cache, ownership/assignment, conversation/message lineage, and tenant alignment.

## Production audit before closeout

The Yogakulam Academy production tenant had **31 leads** at the audit point.

Healthy before closeout:

- leads without contacts: `0`
- leads without stage history: `0`
- leads without Person 360 linkage: `0`
- leads without attribution: `0`
- follow-up cache mismatches: `0`
- invalid lead owners: `0`
- contact tenant mismatches: `0`
- task tenant mismatches: `0`
- attribution tenant mismatches: `0`
- Person/lead tenant mismatches: `0`
- conversation tenant mismatches: `0`
- message lineage mismatches: `0`
- duplicate primary contact types: `0`
- stage/status mismatches: `0`

Two integrity gaps were found:

1. **one lead stage-history mismatch** — the authoritative lead row was at `engaged` while its latest historical stage row still showed `new`;
2. **three open conversations assigned to an inactive organization member**.

No customer-facing message, payment, enrollment or revenue state needed to be changed to close these gaps.

## Implementation

Migration `20261020111000_crm_core_closeout_v1.sql` adds:

- deterministic stage-history reconciliation with explicit `system` provenance;
- clearing of invalid active/open lead, task and conversation assignments;
- `enforce_active_crm_assignee_v1()` guards for tasks and conversations;
- `reconcile_crm_assignments_on_member_status_v1()` so member deactivation/deletion clears active CRM ownership/work pointers;
- deferred `leads_stage_history_consistency_v1` constraint enforcement, allowing the canonical `set_lead_stage()` transaction while preventing committed stage/history drift;
- `v_crm_core_integrity_health_v1`, an RLS-safe tenant health view covering the audited invariants.

Migration `20261020111100_crm_core_member_cleanup_trigger_fix_v1.sql` hardens the membership cleanup AFTER-trigger implementation so it is side-effect-only and returns `NULL`.

The app's lead-detail and pipeline stage mutation paths already use the canonical `set_lead_stage()` RPC. Existing Sales workflow hardening already prevents authenticated clients from bypassing canonical mutation paths for stage history, tasks, conversations and messages.

## CI and deployment proof

PR #85 head `e5d8405c0a9401b0ee8b52d4092518bb83c2cb13` passed:

- Universal Tracking SDK contracts
- Intelligence accuracy contracts
- Prediction freshness contracts
- Prediction calibration contracts
- WhatsApp Operations contracts
- WhatsApp Broadcast Runner contracts
- WhatsApp Growth contracts
- Instagram Operations contracts
- **CRM Core Closeout contracts**
- TypeScript typecheck
- production build

The PR preview deployment was `READY`.

After merge, main CI run **#238** for `f16d59f22f46fe5d7211b95570a0a11f79873521` completed successfully. The Vercel production deployment for the same SHA, `dpl_FRkiNLjv78tKe3TjPcwr8fXFS9fq`, is `READY`.

## Production database proof

Both production migrations were applied successfully:

- `crm_core_closeout_v1`
- `crm_core_member_cleanup_trigger_fix_v1`

Post-migration `v_crm_core_integrity_health_v1` for Yogakulam Academy reports:

- lead count: `31`
- every individual integrity violation metric: `0`
- `integrity_issue_count`: `0`
- `health_status`: **`healthy`**

The previously mismatched lead now has authoritative stage `engaged` and latest stage-history value `engaged`, with reconciliation provenance:

- `changed_by_type = system`
- `changed_by_id = crm_core_closeout_v1`

Open conversations assigned to inactive members after reconciliation: `0`.

The three new trigger functions are not directly executable by `anon` or `authenticated`; service-role/database execution remains available for internal operation. The stage/history constraint trigger is both deferrable and initially deferred, as required by the canonical stage-change transaction.

## Closeout decision

**Core CRM + lead/customer management: V1 closed / production-integrity healthy.**

This means the audited CRM invariants and canonical mutation boundaries are production-proven at this checkpoint. It does not mean every future CRM enhancement is permanently complete; new product requirements may add later work.

The next ordered roadmap area is:

**Customer Journey / Person 360 / Identity.**
