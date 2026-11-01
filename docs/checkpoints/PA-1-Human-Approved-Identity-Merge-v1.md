# PA-1 — Human-Approved Identity Merge & Conflict Resolution V1

**Date:** 2026-11-01  
**Base production head:** `f043ad84d58a144a17d85997b32b6ab32d79b68e`  
**Branch:** `feature/pa1-human-approved-identity-merge-v1`

## Purpose

Close the operational gap between SalsysOS detecting an ambiguous canonical identity conflict and a manager/admin being able to resolve a confirmed same-person case without direct SQL edits or automatic identity merging.

## Safety boundary

PA-1 V1 is intentionally narrow:

- no automatic merge;
- no probabilistic merge decision;
- one candidate Person only;
- explicit manager/admin human confirmation;
- same-organization source and target Persons;
- pair-scoped transaction lock;
- privacy/legal/ad-activation preflight fails closed;
- no hard deletion of Person, identifier, Lead-link, Session-link, or consent evidence;
- source Person remains as `status='merged'` audit shell;
- multi-candidate conflicts remain review-only.

## Implementation

Migration:

`supabase/migrations/20261101130000_human_approved_identity_merge_v1.sql`

Creates:

- `person_merge_audit_v1`
- `merge_identity_resolution_conflict_v1(uuid)`

The merge transaction transfers canonical ownership of:

- `person_identifiers`
- `person_leads`
- `person_sessions`
- `privacy_consent_receipts.person_id` while preserving captured `subject_key`, decision and source evidence

It then:

- marks the source Person `merged` with merge provenance;
- retains the surviving/current Person as active;
- resolves only one-candidate open conflicts for the exact same Person pair;
- records moved-row counts and preflight evidence in `person_merge_audit_v1`.

UI:

- Data Quality keeps `Dismiss as distinct`;
- eligible one-candidate conflicts add `Same person`;
- a separate confirmation state requires `Confirm same person & merge`;
- multi-candidate conflicts show `Multi-candidate review only`;
- database safety blockers are surfaced as action errors rather than bypassed.

## Production rollback-only validation

The migration/function was installed inside an explicit production transaction, a service execution context was simulated against the real two-conflict Person pair, assertions were read, then the transaction was rolled back.

Inside the rollback-only transaction:

- open pair conflicts: `0`
- resolved pair conflicts: `2`
- source Person status: `merged`
- source identifiers: `0`
- target identifiers: `3`
- source sessions: `0`
- target sessions: `4`
- source consent receipts: `0`
- target consent receipts: `8`
- merge audit rows: `1`

Post-rollback verification:

- `person_merge_audit_v1`: absent
- `merge_identity_resolution_conflict_v1(uuid)`: absent
- open production conflicts: `2`
- source Person status: `active`
- source identifiers: `2`
- source sessions: `2`
- source consent receipts: `4`

Therefore the lifecycle passed without persisting any production schema or customer identity change.

## Live action boundary

The two production conflicts are **not** resolved by this checkpoint automatically. After code/schema deployment, an authorized human must compare the current and candidate Contact records and explicitly confirm the same-person merge through the Data Quality workflow.
