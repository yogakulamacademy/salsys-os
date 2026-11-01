# SalsysOS Active Handoff

**Purpose:** Fast recovery after an interrupted engineering session.  
**Updated:** 2026-11-01  
**Repository:** `yogakulamacademy/salsys-os`  
**Production branch:** `main`  
**Verified production head before this documentation follow-up:** `f2abceb35b37f039b3382958b9a375bc32546f93`

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

The active program is no longer broad implementation closeout. It is **production acceptance under real tenant activity**.

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

The provider blockers must not be misclassified as SalsysOS implementation defects.

---

## 4. PA-1 — Human-Approved Identity Merge & Conflict Resolution

PA-1 was created after the production acceptance pass found two identity conflicts for the same live Lead/Person pair.

Important evidence:

- both conflicts point to the same candidate Person;
- one conflict is phone ownership and one is email ownership;
- the identifiers are unverified;
- automatic merging is therefore intentionally prohibited.

### PA-1 production capability

PR #400 merged:

`PA-1: add human-approved identity merge and conflict resolution`

Merged production code head:

`f2abceb35b37f039b3382958b9a375bc32546f93`

Production migration applied:

`human_approved_identity_merge_v1`

Production migration ledger version:

`20261101125123`

New controlled capability:

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
- durable merge audit is required.

### Rollback-only production proof

Before persistent deployment, the real two-conflict pair was exercised inside a production transaction and rolled back.

Assertions inside the transaction:

- both pair conflicts resolved;
- source Person became `merged`;
- 2 identifiers moved;
- 2 sessions moved;
- 4 consent receipts re-associated;
- 1 merge audit row created.

Post-rollback proof confirmed production customer identity remained unchanged.

After persistent schema deployment:

- the PA-1 table/RPC exist;
- RLS is enabled on the audit table;
- anon cannot execute the merge RPC;
- direct anon/authenticated audit-table access is denied;
- authenticated execution still requires the function's explicit manager/admin authorization check;
- the two live conflicts remain open;
- source Person remains active;
- merge audit rows remain 0.

**No live customer identity merge has been performed.**

---

## 5. PA-1 post-deploy advisor follow-up

Supabase advisors were run after deployment.

Security advisor:

- PA-1 audit-table `RLS enabled / no policy` notice is intentional because direct table privileges are revoked;
- PA-1 authenticated SECURITY DEFINER notice is expected and protected by `auth.uid()` + `can_administer_organization_crm(...)` inside the function and anon execute revocation;
- other security-advisor findings are pre-existing and are not introduced by PA-1.

Performance advisor found three PA-1-specific unindexed foreign keys on `person_merge_audit_v1`:

- `initiating_conflict_id`
- `source_person_id`
- `target_person_id`

A focused follow-up migration is being completed to index those three columns. Do not treat that advisor cleanup as a change to merge semantics.

---

## 6. Production deployment evidence

For PR #400 merge head `f2abceb35b37f039b3382958b9a375bc32546f93`:

- Production Smoke #148: success;
- CI #1322: success;
- CodeQL #607: success;
- Vercel production deployment: `dpl_6bjy6sCXnq6Yu7DPeZqAqjDmDTMx`;
- Vercel state: READY;
- exact Git SHA metadata: verified;
- production alias `crm.salsysos.com`: present.

---

## 7. Current exact continuation point

Complete the **PA-1 post-deploy closeout** first:

1. merge/deploy the three audit FK indexes;
2. rerun performance advisor and confirm those three PA-1 notices are gone;
3. confirm production remains on the exact new main SHA and all gates are green;
4. update the canonical Current Checkpoint with final evidence.

Then stop before the consequential customer action and obtain explicit human confirmation for the live same-person decision.

After explicit confirmation, execute **one** PA-1 merge through the controlled Data Quality workflow (or the same authenticated RPC boundary), then verify:

- open identity conflicts for the pair = 0;
- source Person status = `merged`;
- identifiers/sessions/consent associations moved as expected;
- exactly one merge audit record exists;
- surviving Person remains linked to the live Lead;
- CRM Core Integrity remains healthy;
- Customer 360 Integrity returns healthy;
- Privacy Compliance remains healthy.

Do not merge the two live Persons merely because the evidence looks likely. Their identifiers are unverified, so the human approval boundary is intentional.

---

## 8. Next production-acceptance sequence after PA-1

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
