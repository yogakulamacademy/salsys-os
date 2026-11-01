# SalsysOS Current Checkpoint

**Checkpoint date:** 2026-11-01  
**Canonical repository:** `yogakulamacademy/salsys-os`  
**Production branch:** `main`  
**Verified production head before this docs-only closeout:** `3362aa01bb777c9ea482199d80268f1a2df02177`  
**Companion context:** `docs/SalsysOS_North_Star_Product_Context.md`  
**Fast resume file:** `docs/SalsysOS_Active_Handoff.md`

> This is the canonical operational checkpoint. Historical files under `docs/checkpoints/` are immutable evidence records and must not be rewritten to match later implementation state.

---

## 1. Current product position

SalsysOS is a **Sales + Analysis Operating System** connecting marketing acquisition, first-party behaviour, identity/customer journey, CRM execution, conversations, follow-up, commerce/revenue, attribution and intelligence.

Current production proving ground:

- Yogakulam Academy

Canonical production app:

- `https://crm.salsysos.com`

Current execution mode:

- prior broad engineering closeout: complete;
- PA-1 engineering + post-deploy closeout: complete;
- current program: **Production Acceptance & Operational Closeout**;
- current exact gate: **explicit human approval before a live identity merge**.

---

## 2. November final-closeout baseline

The previous 14-surface final-closeout sweep is complete and should not be restarted without evidence of regression.

Closed production surfaces include:

1. Home / Command Center
2. CRM + Customer 360
3. Admissions
4. Conversations
5. WhatsApp
6. Performance / Team
7. Automation
8. Operations
9. Settings
10. AI / Knowledge
11. Tracking & Data
12. System Health
13. Platform administration
14. Platform onboarding / customer provisioning

Platform onboarding final closeout:

- PR #399 merged;
- `main` at that closeout: `f043ad84d58a144a17d85997b32b6ab32d79b68e`;
- CI and CodeQL passed;
- production deployment was verified on exact merge SHA;
- 4 active organizations;
- 0 active organizations without Owner/Admin;
- 1 enforced onboarding row;
- 0 incomplete enforced onboarding rows;
- 0 active password-recovery grants.

---

## 3. Production Acceptance baseline — 2026-11-01

Live read-only acceptance checks show:

```text
CRM Core Integrity          healthy
Admissions Automation      healthy
Universal Tracking         healthy / collecting
Website Lead Capture       healthy
GA4                        healthy
Google Search Console      healthy
Privacy Compliance         healthy
WhatsApp                   healthy
```

Current non-green states and classification:

```text
Google Ads       critical   external Google production-access approval blocker
Meta Ads         warning    stale/provider permission + App Review dependency
Customer 360     warning    2 open human-review identity conflicts
Search Indexing  inactive   intentionally disabled
```

Google Ads currently returns:

`CLOUD_PROJECT_NOT_APPROVED_FOR_PRODUCTION`

That is an external provider-access blocker, not a newly discovered SalsysOS sync regression.

Search Indexing remains intentionally disabled and must not be activated as incidental cleanup.

---

## 4. PA-1 — Human-Approved Identity Merge & Conflict Resolution

### Problem discovered

Production acceptance found two open identity conflicts for the same live Lead/current Person and the same candidate Person.

Evidence characteristics:

- one conflict is phone ownership;
- one conflict is email ownership;
- both point to the same Person pair;
- relevant identifiers are unverified.

Therefore:

- automatic merge is prohibited;
- blindly dismissing them as distinct is also not justified;
- a controlled human-approved merge path was required.

### Implementation

PR #400:

`PA-1: add human-approved identity merge and conflict resolution`

Merged `main` SHA:

`f2abceb35b37f039b3382958b9a375bc32546f93`

Production migration:

`human_approved_identity_merge_v1`

Migration ledger version:

`20261101125123`

Created:

- `public.person_merge_audit_v1`
- `public.merge_identity_resolution_conflict_v1(uuid)`
- Data Quality two-step review UI

### Merge contract

The V1 merge boundary is deliberately narrow:

- only a conflict with exactly one candidate Person is eligible;
- manager/admin human approval is required;
- source and survivor must belong to the same organization;
- pair-scoped advisory locking prevents conflicting concurrent merge directions;
- source and target must both be active at first merge;
- active privacy/legal/ad-delivery dependencies fail closed;
- canonical `person_identifiers`, `person_leads`, `person_sessions` and consent-receipt Person associations move transactionally;
- captured consent subject/decision/source evidence is preserved;
- source Person is retained as `status='merged'` with provenance;
- only one-candidate conflicts for the exact Person pair are resolved together;
- multi-candidate conflicts remain review-only;
- hard deletes are prohibited;
- every successful merge records a durable audit row.

### UI contract

Data Quality exposes:

```text
Dismiss as distinct
Same person
  -> Confirm same person & merge
  -> Cancel merge
```

Multi-candidate cases show review-only state and cannot be merged through PA-1 V1.

---

## 5. PA-1 rollback-only production proof

Before persistent deployment, the migration/function was installed inside an explicit production transaction and exercised against the real two-conflict Person pair under controlled service execution.

Assertions inside the transaction:

```text
open pair conflicts         0
resolved pair conflicts     2
source Person status        merged
source identifiers          0
target identifiers          3
source sessions             0
target sessions             4
source consent receipts     0
target consent receipts     8
merge audit rows            1
```

The transaction was then rolled back.

Post-rollback verification:

```text
PA-1 audit table             absent
PA-1 merge RPC               absent
open pair conflicts          2
source Person status         active
source identifiers           2
source sessions              2
source consent receipts      4
```

This proved the lifecycle without persisting a customer identity change.

---

## 6. PA-1 production deployment state

After PR #400 was merged:

- production migration applied successfully;
- audit table exists;
- RLS enabled on audit table;
- merge RPC exists and is SECURITY DEFINER;
- anon execute denied;
- authenticated execute granted but function itself requires `auth.uid()` + `can_administer_organization_crm(...)`;
- service-role execute granted;
- direct anon/authenticated audit-table access denied;
- two live conflicts remain open;
- source Person remains active;
- audit rows remain 0.

No actual live Person merge has occurred.

PR #400 production evidence for `f2abceb35b37f039b3382958b9a375bc32546f93`:

```text
Production Smoke #148   success
CI #1322                success
CodeQL #607             success
Vercel deployment       dpl_6bjy6sCXnq6Yu7DPeZqAqjDmDTMx
Vercel state            READY
Git commit provenance   exact SHA verified
crm.salsysos.com        production alias present
```

---

## 7. PA-1 post-deploy advisor closeout — COMPLETE

Supabase security and performance advisors were run after PA-1 deployment.

Security advisor:

- PA-1 audit-table `RLS enabled / no policy` notice is intentional because direct table grants are revoked;
- PA-1 authenticated SECURITY DEFINER notice is expected and guarded inside the function;
- unrelated security-advisor findings pre-date PA-1 and remain separate work.

Initial performance advisor identified three PA-1-specific unindexed foreign keys on `person_merge_audit_v1`:

- `initiating_conflict_id`
- `source_person_id`
- `target_person_id`

PR #401 closed those advisor gaps and refreshed the operational handoff/checkpoint.

PR #401 merge SHA:

`3362aa01bb777c9ea482199d80268f1a2df02177`

Production follow-up migration:

`person_merge_audit_fk_indexes_v1`

Migration ledger version:

`20261101130010`

Verified indexes:

- `idx_person_merge_audit_v1_initiating_conflict_id`
- `idx_person_merge_audit_v1_source_person_id`
- `idx_person_merge_audit_v1_target_person_id`

Performance-advisor rerun:

- the three PA-1 unindexed-FK findings are gone;
- the new indexes may appear as `unused_index` until real merge/audit traffic exists; do not remove them merely for being unused immediately after deployment.

Post-closeout customer-data boundary:

```text
open pair conflicts          2
source Person status         active
merge audit rows             0
```

Therefore PA-1 engineering is deployed and complete while the consequential customer identity remains untouched.

---

## 8. Final PA-1 production proof

For `main` SHA:

`3362aa01bb777c9ea482199d80268f1a2df02177`

Verified:

```text
Production Smoke #149   success
CI #1324                success
CodeQL #609             success
Vercel deployment       dpl_2Mc3a8fnuHhSKQLRND4QaFP8bFJT
Vercel state            READY
Git commit provenance   exact SHA verified
crm.salsysos.com        production alias present
```

PA-1 post-deploy engineering closeout is therefore **COMPLETE**.

---

## 9. Exact current checkpoint — HUMAN APPROVAL REQUIRED

**Stop engineering changes here.**

The next action is not another migration, bug fix, provider task or code change.

The next action is an explicit human decision on whether the two flagged records represent the **same person**.

Current live pair:

```text
Lead                LD-012063 / RANJAN SRI
Current Person      745f0691-1edd-49c5-bbe0-89b36e709980
Candidate Person    195e7642-c0bf-4425-8bb5-aaa8d81f781c
Open conflicts      2
Conflict evidence   phone + email ownership overlap
Identifier status   unverified
Merge audit rows    0
```

Because the identifiers are unverified, do not infer approval from similarity alone.

Required human outcomes:

1. **Same person**  
   Use the PA-1 controlled two-step merge.

2. **Different people / evidence not reusable**  
   Use the existing human `Dismiss as distinct` path.

Until one of those decisions is explicitly approved, leave both conflicts open.

---

## 10. After explicit PA-1 same-person approval

Execute one controlled merge through the Data Quality workflow or the equivalent authenticated RPC boundary.

Expected post-merge acceptance:

```text
open conflicts for pair             0
source Person status                merged
source canonical identifiers        0
source canonical sessions           0
merge audit rows                    1
surviving Person/live Lead link     preserved
CRM Core Integrity                  healthy
Customer 360 Integrity              healthy
Privacy Compliance                  healthy
```

Expected row movement from the already-proven rollback lifecycle, subject to no intervening production changes:

```text
identifiers moved          2
sessions moved             2
consent receipts moved     4
target identifiers         3
target sessions            4
target consent receipts    8
resolved conflicts         2
```

Re-read the live pair immediately before execution and do not rely only on these historical counts.

If any invariant fails, treat it as a production defect and stop before continuing.

---

## 11. Next production-acceptance work after PA-1 decision

After identity review is closed:

1. keep Google Ads parked as external approval dependency;
2. keep Meta Ads provider/App Review work separated from internal product defects;
3. run real-activity acceptance across:

`Lead -> Admissions -> Conversations -> Follow-ups -> Payment/Enrollment -> Revenue`

4. investigate only evidence-backed failures;
5. keep Search Indexing inactive until its own activation checkpoint;
6. then select the next genuine North-Star/productization checkpoint.

---

## 12. Locked engineering rules

- one controlled checkpoint at a time;
- verify before modifying;
- production facts beat stale documentation;
- tenant authority is server-derived;
- never authorize from client-provided organization IDs;
- PostgreSQL/Supabase remains canonical fact storage;
- OpenSearch remains derived/rebuildable when enabled;
- observed facts remain separate from inferred/modelled facts;
- no fingerprinting or consent circumvention;
- no fabricated events, rankings, conversions, revenue, outcomes or training evidence;
- no automatic identity merge from ambiguous evidence;
- privacy/legal restrictions fail closed;
- high-impact autonomous actions remain human-governed unless explicitly activated;
- never create production data just to make a metric green;
- migrations, build gates, deployment provenance and post-deploy verification are part of completion.

---

## 13. Resume instruction

When resuming in a new chat/session:

1. read `docs/SalsysOS_Active_Handoff.md`;
2. read this file;
3. read `docs/SalsysOS_North_Star_Product_Context.md`;
4. verify current `main`, Supabase migration state and production Vercel SHA before changing anything;
5. continue from Section 9;
6. do not perform the live identity merge without explicit human approval.
