# SalsysOS Active Handoff

**Purpose:** Fast recovery after an interrupted engineering session.  
**Updated:** 2026-11-01  
**Repository:** `yogakulamacademy/salsys-os`  
**Production branch:** `main`  
**Verified production head before this docs-only closeout:** `3362aa01bb777c9ea482199d80268f1a2df02177`

Read this file first when resuming active engineering. Then read:

1. `docs/SalsysOS_Current_Checkpoint.md`
2. `docs/SalsysOS_North_Star_Product_Context.md`
3. the latest relevant file under `docs/checkpoints/`

Historical checkpoint files are evidence records and must not be rewritten to make earlier work look different.

---

## 1. Product identity and execution rule

SalsysOS = **Sales + Analysis Operating System**.

It is a tenant-safe Sales + Customer Journey + Revenue Intelligence operating system, not a generic CRM.

Canonical loop:

`marketing -> traffic -> source/campaign/content -> anonymous journey -> identity -> lead/opportunity -> conversation -> intent/affinity -> salesperson/follow-up -> booking/payment/enrollment -> revenue -> attribution -> recommendation -> action -> observed outcome -> learning`

Execution rule:

> **Verify first, close one controlled checkpoint at a time, and never replace missing evidence with assumptions.**

---

## 2. Nov. 1 engineering closeout status

The prior 14-surface final-closeout sweep is **COMPLETE**.

The completed surfaces include the production boundaries around:

- Home / Command Center
- CRM + Customer 360
- Admissions
- Conversations
- WhatsApp
- Performance / Team
- Automation
- Operations
- Settings
- AI / Knowledge
- Tracking & Data
- System Health
- Platform administration
- Customer onboarding / provisioning

Platform onboarding final closeout was merged in PR #399. Its production invariants were revalidated before PA-1 work began:

- 4 active organizations;
- 0 active organizations without an Owner/Admin;
- 1 enforced onboarding row;
- 0 incomplete enforced onboarding rows;
- 0 active password-recovery grants.

Do not reopen the old 14-surface checklist unless production evidence shows a regression.

---

## 3. Current phase — Production Acceptance & Operational Closeout

The active program is **production acceptance under real tenant activity**.

Current acceptance evidence for Yogakulam Academy:

- CRM Core Integrity: healthy;
- Admissions Automation: healthy;
- Universal Tracking: healthy / collecting;
- Website Lead Capture: healthy;
- GA4: healthy;
- Search Console: healthy;
- Privacy Compliance: healthy;
- WhatsApp system health: healthy.

Expected/non-regression states still visible:

- Google Ads: external production-access blocker (`CLOUD_PROJECT_NOT_APPROVED_FOR_PRODUCTION`);
- Meta Ads: stale/provider permission + App Review dependency;
- Search Indexing: intentionally inactive;
- Customer 360: two open human-review identity conflicts.

Provider blockers must not be misclassified as SalsysOS implementation defects.

---

## 4. PA-1 — Human-Approved Identity Merge & Conflict Resolution

PA-1 was created after the production acceptance pass found two identity conflicts for the same live Lead/current Person and the same candidate Person.

Important evidence:

- both conflicts point to the same candidate Person;
- one conflict is phone ownership and one is email ownership;
- the identifiers are unverified;
- automatic merging is therefore intentionally prohibited.

### PA-1 implementation

PR #400 merged:

`PA-1: add human-approved identity merge and conflict resolution`

Main SHA after PR #400:

`f2abceb35b37f039b3382958b9a375bc32546f93`

Production migration:

`human_approved_identity_merge_v1`

Migration ledger version:

`20261101125123`

Controlled capability:

- `person_merge_audit_v1`
- `merge_identity_resolution_conflict_v1(uuid)`
- Data Quality two-step flow: `Same person` -> `Confirm same person & merge`

### PA-1 safety boundary

- one-candidate conflicts only;
- manager/admin human approval required;
- same-tenant source/target Persons;
- pair-scoped transaction lock;
- no automatic/probabilistic merge;
- no hard Person/identifier/Lead-link/Session-link deletion;
- source Person remains a `merged` audit shell;
- canonical identifiers, Lead links and Session links move transactionally;
- captured consent subject/decision/source evidence remains preserved;
- active privacy/legal/ad-delivery state blocks the merge;
- multi-candidate conflicts remain review-only;
- durable merge audit required.

### Rollback-only production proof

Before persistent deployment, the real two-conflict pair was exercised inside a production transaction and rolled back.

Inside the transaction:

- both pair conflicts resolved;
- source Person became `merged`;
- 2 identifiers moved;
- 2 sessions moved;
- 4 consent receipts re-associated;
- 1 merge audit row created.

Post-rollback proof confirmed production customer identity remained unchanged.

---

## 5. PA-1 post-deploy closeout — COMPLETE

After PR #400 deployment, Supabase performance advisor identified three missing FK indexes on `person_merge_audit_v1`.

PR #401 merged the focused advisor closeout and refreshed the canonical operational documents.

Current verified production head before this docs-only update:

`3362aa01bb777c9ea482199d80268f1a2df02177`

Follow-up migration:

`person_merge_audit_fk_indexes_v1`

Migration ledger version:

`20261101130010`

Verified indexes:

- `idx_person_merge_audit_v1_initiating_conflict_id`
- `idx_person_merge_audit_v1_source_person_id`
- `idx_person_merge_audit_v1_target_person_id`

Performance advisor rerun confirms the three PA-1 unindexed-FK findings are gone.

The indexes may initially appear under `unused_index`; that is expected before real merge/audit traffic exists and is not a reason to remove them.

---

## 6. Final production evidence for PA-1 engineering

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

Current live customer-data boundary:

```text
open pair conflicts      2
source Person status     active
merge audit rows         0
```

**No live identity merge has been performed.**

PA-1 engineering and post-deploy closeout are complete.

---

## 7. Exact continuation point — HUMAN APPROVAL

Stop engineering changes here.

The next step is a human decision on the live identity pair:

```text
Lead                LD-012063 / RANJAN SRI
Current Person      745f0691-1edd-49c5-bbe0-89b36e709980
Candidate Person    195e7642-c0bf-4425-8bb5-aaa8d81f781c
Open conflicts      2
Evidence             phone + email ownership overlap
Identifier status    unverified
Merge audit rows     0
```

Available outcomes:

1. **Same person** — explicitly approve the PA-1 controlled merge.
2. **Different people / evidence not reusable** — dismiss the conflicts as distinct through the existing human-review path.

Do not infer either outcome from similarity alone because the identifiers are unverified.

If same-person approval is given, re-read the live pair immediately before execution, then perform one controlled merge and verify:

- open conflicts for pair = 0;
- source Person status = `merged`;
- source canonical identifiers = 0;
- source canonical sessions = 0;
- one merge audit row exists;
- surviving Person remains linked to the live Lead;
- CRM Core Integrity remains healthy;
- Customer 360 Integrity returns healthy;
- Privacy Compliance remains healthy.

Expected historical row movement from rollback proof, subject to no intervening live changes:

- identifiers moved: 2;
- sessions moved: 2;
- consent receipts moved: 4;
- conflicts resolved: 2.

---

## 8. Next production-acceptance sequence after PA-1 decision

1. park Google Ads as an external approval blocker;
2. park/track Meta Ads permission + App Review dependencies separately;
3. run broader real-activity acceptance across:
   `Lead -> Admissions -> Conversation -> Follow-up -> Payment/Enrollment -> Revenue`;
4. investigate only evidence-backed defects;
5. keep Search Indexing disabled until its dedicated activation checkpoint;
6. then choose the next genuine North-Star/productization checkpoint rather than reopening already-closed surfaces.

---

## 9. Architecture / safety rules that must not regress

- tenant authority is server-derived;
- PostgreSQL/Supabase remains canonical transactional truth;
- OpenSearch remains derived/rebuildable when enabled;
- browser telemetry does not establish payment/enrollment/revenue truth;
- observed, matched, attributed, inferred and modelled evidence remain distinct;
- identity ambiguity stays ambiguous until deterministic evidence or explicit human review resolves it;
- no fingerprinting or consent circumvention;
- no fabricated traffic, conversions, revenue, outcomes or predictive evidence;
- customer-visible/high-impact autonomous actions remain fail-closed unless explicitly enabled;
- privacy/legal holds must block destructive identity operations;
- never create or mutate production customer data just to make a health metric green.

---

## 10. Resume instruction

When resuming after interruption:

1. verify current `main` before modifying anything;
2. read this file + Current Checkpoint + North-Star context;
3. continue from Section 7;
4. do not rebuild PA-1 unless verification finds a regression;
5. do not perform the live identity merge without explicit human approval.
