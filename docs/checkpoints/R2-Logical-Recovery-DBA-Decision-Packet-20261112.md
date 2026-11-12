# R2 — logical recovery alternative: DBA decision packet (NOT AUTHORIZED)

**Prepared:** 2026-11-12 · **Source:** staging `ndxpjqkthuzxlmbenxti` · **Supabase Support:** `SU-549418` · **Status:** REVIEW ONLY / R2 NO-GO.

## 0. Owner-authorized proposal — separate approval still required

**Decision-request update: November 12, 2026.** The R2 owner has **authorized formally proposing**, for the **R2 isolated staging recovery gate only**, a revised acceptance criterion based on an **offline, verified-no-egress logical reconstruction** **instead of** the blocked Supabase managed physical-backup rehearsal. The owner **acknowledges physical-backup restore integrity and physical RPO/RTO remain unverified**. This is only authorization to *seek a revised standard*; **not adoption, risk waiver or execution consent**. Exact change request: [PR #698 proposal](https://github.com/yogakulamacademy/salsys-os/pull/698#issuecomment-6816895009).

**Proposed bounded acceptance (not an approved PASS standard):**

| Testable acceptance dimension | Proposed positive evidence | Mandatory failure / stop |
| --- | --- | --- |
| Pre-execution isolation | Independent security/DBA witness that the operator-controlled, non-public destination denies **all outbound network traffic before import and for the entire rehearsal**, with deny evidence and time stamps | Any uncontrolled egress, unresolved firewall/network path, credential presence or a copied job/provider hook that could fire |
| Content minimization | Reviewed inclusion/exclusion manifest; **schema + synthetic data first**; documented Auth/Storage/Vault/extension/platform omissions | Unexpected personal data, secret, provider credential or unapproved schema/data copy |
| Reconstructability | Independently reproduced intended logical schema, functions, role grants, policies, triggers and representative **synthetic** test states on a compatible isolated PostgreSQL build | Unreviewed SQL/extension execution, unexplained missing objects, privileged drift or incomplete tenant policy setup |
| Authorization boundaries | Approved synthetic tenant A/B negative reads, roles and RPC/SECURITY DEFINER guard checks; no anonymous path broadening | Cross-tenant leakage, privilege escalation, unexpected public callable functions, RLS bypass |
| History/provenance | Documented 433 current installed migration-version rows, absent `20261110041634`, known WhatsApp version aliases and reconciled scope without hosted history writes | Reporting a synthetic 434 count as a hosted repair or rerunning manually applied PR #685 SQL |
| Failure, rollback and disposal | Witnessed stop/cleanup path; redacted evidence of artifact expiration, secure deletion and no external actions; measure only **logical reconstruction elapsed time** | Side effects, unreconciled artifacts, unapproved retained dumps or claims of managed physical RTO/RPO |

**Required approval order:** (1) qualified **independent DBA/recovery** written decision; (2) independent **privacy/security** written decision by a *designated, qualified reviewer* (**owner has nominated `thedetourclubind-cloud` as a candidate in #700; qualifications and independence remain unverified**); (3) **new explicit owner adoption and residual physical-risk acceptance**; (4) **separate named-operator execution authorization** for any actual rehearsal. None is currently received for the *revised* criterion. Existing current-head GitHub APPROVED reviews have empty bodies and do not constitute operational DBA acceptance; the reviewer has documented **CHANGES REQUIRED** separately.

**Disallowed under this authorization:** no export/dump, backup clone, import/restore, SQL modification, migration/ledger repair, merge, deployment, paid infrastructure, real customer fixtures, production change, collector enablement or stage-hold release. **R2: NO-GO; witnessed staging: 0/16 ON HOLD.**

## 1. Why a decision is required

The user supplied Supabase's written ticket reply from **Sam, Supabase's AI support agent** on November 12, 2026. The stated provider capabilities are:

- Supabase's built-in **Restore to a New Project** has **no supported pre-start startup hold, outbound isolation or safe mode**. Copied cron, network extensions and webhooks may start on the newly writable database before manual controls can act. Network Restrictions are inbound-only.
- Supabase Support says **no managed/offline physical-backup restore is available** and **physical backup files cannot be exported** to inspect them before a restore.
- Exact backup availability for **2026-11-10 20:08:55 UTC** needs separate dashboard confirmation; being within the Pro seven-day retention window does not prove that exact snapshot is selectable.
- A new project would be independently billed; no cost approved.
- Source project would remain unchanged by a new-project clone, **but external endpoints could still receive actions**.

**Decision on the documented physical-recovery procedure: NO-GO.** The previously required pre-start side-effect containment cannot be demonstrated by the Supabase-supported physical path. Historical cron `SELECT 1` evidence is *risk-reducing, not a substitute for containment proof*. A generic "RECOVERY TEST GO" comment predating this provider finding does not authorize a physical clone.

## 2. Alternative and its strict evidentiary boundary

Supabase suggested a **logical** export from the current staging source using `supabase db dump`, with the output reviewed and sanitized **before** restoring it into an offline/no-egress PostgreSQL instance; a separately approved fresh Supabase destination could be considered only with verified controls and explicit cost consent.

**Do not confuse outcomes:**

| Question | Physical backup (Nov 10 candidate) | Logical export (current stage) |
| --- | --- | --- |
| Were the Nov 10 physical backup bytes restored? | **No — blocked** | **No — not tested by this method** |
| Are physical restore RPO/RTO measured? | **No** | **No** |
| Can current schema/data be reconstructed? | Not tested | **Proposed test only** |
| Can function ACLs / RLS / migrations be compared? | Not tested | **Potentially**, after scope-specific restore |
| Does `supabase db dump` prove complete Auth, Storage, Vault, extensions, and platform configuration recovery? | Not applicable | **No** — these need separate coverage and explicit exclusions |
| Can a clean offline import protect endpoints? | No supported pre-start guarantee for physical clone | **Potentially**, if verified before any imported code runs |

Supabase CLI documentation says its managed-schema dump filtering **excludes internal `auth`, `storage`, and extension-created schemas by default**. The default schema dump omits data and custom roles; `--data-only` and `--role-only` are separate. Official guides give role/schema/data examples but **must not be interpreted as a complete Supabase platform restore**. Require a DBA-tested inclusion/exclusion manifest; explicitly address Auth-user counts and Storage metadata without exporting secrets or unneeded personal data. The pgsodium/Vault encryption root key is not included in a logical dump; **do not migrate encryption material or try to decrypt Vault secrets without a separate, tightly scoped security approval**.

References: [Supabase CLI dump](https://supabase.com/docs/reference/cli/supabase-db-dump), [Backup/restore via CLI](https://supabase.com/docs/guides/platform/migrating-within-supabase/backup-restore), [Restore to new project](https://supabase.com/docs/guides/platform/clone-project), [Vault](https://supabase.com/docs/guides/database/vault).

## 3. Phase 0 — permitted document-only preparation

No commands below authorize an export or restore. An approved operator must **first** produce a final written procedure covering:

1. **Scope manifest:** exact stage project ID, source database timestamp, eligible schemas/tables/functions/roles and explicit exclusions (Auth, Storage, Vault, extensions, platform settings); record known source `433` migration ledger versions and missing `20261110041634` without attempting history repair.
2. **Data minimization:** establish whether a **schema-only + synthetic data** rehearsal meets the narrow security objective. If not, classify all exported data as potentially sensitive, define approval, encryption, retention, access logs and secure deletion. Never paste database URIs, dumps, tokens or personal records into GitHub/chat/CI artifacts.
3. **Outbound-action threat model:** inspect proposed dump and dependencies for `cron.job`, `pg_cron`, `pg_net`, `http`, `dblink`, wrappers, `supabase_functions.http_request`, HTTP triggers/functions, foreign data wrappers/servers/user mappings, Auth hooks, network connections, side-effecting functions, triggers/queues and secret tables. A keyword scan is **not** a complete security guarantee.
4. **Destination containment:** independent local Postgres on an operator-controlled environment with **provably denied outbound traffic before execution**; no Vercel/WhatsApp/Instagram/email/payment/ads/webhook credentials and no customer-facing interfaces. Do not restore into an already connected environment. DBA to document required PostgreSQL/Supabase extension compatibility; validate that import scripts cannot execute unwanted operations.
5. **Restore method:** use current official CLI/help and DBA-reviewed, pinned toolchain. Define separated roles/schema/data exports, explicit schema filters, an inspected/redacted import ordering and expected failures. The CLI commands are **not included here** to avoid accidental execution before approval.
6. **Positive and negative evidence:** compare object counts and definitions, permissions, RLS/catalog behavior, sample redacted aggregates, ledger version set, read-only test queries, and deliberately blocked outbound actions. Log exact timestamps and reproducible redacted evidence.
7. **Exit and rollback:** independent witness, cleanup operator, physical artifacts' lifecycle and explicit stop conditions if secrets or side effects are observed. Never auto-reconnect external services.

## 4. Separate decision gates

**Gate A — scope/acceptance:** The owner has **authorized requesting option (ii)**: a formally revised R2 *staging* criterion using no-egress, synthetic-first offline logical recovery instead of a Supabase managed physical clone. The **qualified independent DBA and independent privacy/security reviewer must approve the proposal in writing**, and the owner must then **separately adopt** it with an explicit physical-backup residual-risk decision. Until those decisions, the existing physical-backup gate remains OPEN and logical work is only a proposal; no automatic waiver or acceptance.

**Gate B — privacy/security:** Independent privacy/security reviewer approves schema/data coverage, data minimization, storage, outbound containment, audit handling, Auth/Vault restrictions, and final deletion.

**Gate C — operator execution:** Exact named operator, isolated environment, no-egress evidence and *separately explicit* consent for any actual source export. A new Supabase project requires its own cost quote and owner consent. Do not treat this document, a user request to "continue", or review comments as authorization.

**Gate D — measurement:** Observe/log independently witnessed logical RTO and reconstructability only if a test is later authorized. Label results **LOGICAL-CURRENT-SNAPSHOT**. Do not report physical RTO/RPO or Nov 10 restore PASS.

**Gate E — migration provenance:** Missing stage ledger `20261110041634` is a **different** reconciliation decision. The security ACLs have been independently read back, but neither a logical restore nor an offline 433→434 simulation authorizes re-running SQL or modifying the hosted migration ledger.

## 5. Independent recovery and privacy decision request

**DBA / recovery reviewer:** Provide **ACCEPT PROPOSED REVISED STAGING STANDARD / CHANGES REQUIRED / REJECT** with precise test scope, required no-egress proof, PostgreSQL/extension compatibility, pass/fail criteria, rollback, logical-measurement limits, continuing physical RPO/RTO recovery debt, and the evidence needed before owner adoption. The prior GitHub documentation review is not a decision on this amended acceptance proposal.

**Independent privacy/security reviewer:** The owner has nominated `thedetourclubind-cloud` as a **candidate**, but their privacy/security qualifications, authority and independence must be independently established in #700 before their decision can count. Provide **ACCEPT / CHANGES REQUIRED / REJECT** explicitly on synthetic-only default, whether a real data export is forbidden or would need an additional authorization, PII and secrets minimization, Auth/Storage/Vault limitations, provider integration isolation, safe artifact location/access/retention/deletion, incidental sensitive content, and third-party egress assurance. No presumed approval from the DBA's role.

**Owner (after both independent approvals):** Explicitly **ADOPT / DO NOT ADOPT** the changed R2 staging recovery standard and separately record acknowledgement of unverified physical backup integrity and physical RPO/RTO. This owner adoption is **not granted** by permission to propose.

**Operator (only after adoption):** Seek a separate scope-specific execution GO. This packet supplies **no** dump/restore commands and authorizes no operation.

| Required decision | Approval reference/signature | Current status |
| --- | --- | --- |
| Independent DBA revised criterion | [PR #698 changes-required review](https://github.com/yogakulamacademy/salsys-os/pull/698#issuecomment-6818757836) | **CHANGES REQUIRED — NOT ACCEPTED** |
| Qualified independent privacy reviewer identified | [Owner candidate nomination #700](https://github.com/yogakulamacademy/salsys-os/issues/700#issuecomment-6817615540) | **NOMINATED; QUALIFICATIONS / INDEPENDENCE UNVERIFIED** |
| Independent privacy/security acceptance | Pending | **AWAITING** |
| Owner adoption and explicit physical residual-risk acceptance | Pending | **NOT AUTHORIZED** |
| Operator actual export/import/rehearsal | Pending | **NOT AUTHORIZED** |

### Independent DBA technical questions (must answer in written decision)


In addition to the above sign-off, explicitly answer:

1. Is an **offline, no-egress, synthetic/schema-first** logical recovery rehearsal acceptable as **supplementary** R2 evidence? What exact schemas and checks are mandatory?
2. If the previous requirement was a Nov 10 **physical-backup** rehearsal, which required recovery guarantees remain unproven, and may any requirement be changed with an explicit residual-risk sign-off?
3. How will Auth/Storage/Vault/roles/extension exclusions and `supabase db dump` defaults be represented without misrepresenting restore completeness?
4. Can a demonstrably isolated local environment be built and deleted under an approved operator procedure **without live provider data or network effects**?
5. Which acceptance and rollback evidence, and which distinct later approval, would be required before a *real* data export?

## 6. Condition-closure design package — DBA CHANGES REQUIRED (proposal, not PASS)

**Trigger:** The independent DBA account edited [PR #698 comment #6818757836](https://github.com/yogakulamacademy/salsys-os/pull/698#issuecomment-6818757836) to **CHANGES REQUIRED** and requested a bounded scope manifest, verifiable isolation design, synthetic fixtures, repeatable runbook, named execution roles and evidence collection. This section answers the **design** questions for further technical/privacy review; it does **not** assert that any rehearsal ran, that a complete live catalog was exported, or that the DBA accepted the design. Two blank-body GitHub APPROVED reviews do not override the changes-required finding.

### 6.1 Decision scope — what is proposed and what is not

**Proposed choice for reviewer consideration: a replacement of only the bounded R2 isolated-staging *logical-reconstructability evidence gate*.** This is **not a replacement for the operational disaster-recovery plan**, for recovery of real hosted data, or for a physical backup test. Specifically, the owner is seeking permission to substitute an offline, no-egress logical/schema reconstruction test for an unsafe Supabase physical clone **only in the narrowly rewritten staging acceptance contract**. The independent DBA must explicitly decide **REPLACEMENT FOR NARROW R2 STAGING / SUPPLEMENTARY ONLY / REJECT**; the default before its decision is **SUPPLEMENTARY ONLY, NOT PASS**.

**Two technically different candidate sources must not be conflated:**

| Candidate | Source material | Evidence obtainable | Authorization now |
| --- | --- | --- | --- |
| A — repository-sourced synthetic reconstruction (preferred first design) | Version-pinned reviewed Git migration/DDL sources and synthetic tenant fixtures; existing independent PR #697 GitHub-only rehearsal may be cited as limited historical evidence | Reproducibility of selected committed DDL, grants, RLS and synthetic constraints; NOT a restore of the actual hosted stage | **DESIGN ONLY**. Existing PR #697 CI evidence may be reviewed; no new SQL execution is approved by this document |
| B — actual staging *schema-only logical dump* | Future **separately authorized** read-only export from hosted staging, inspected and sanitized before any isolated import | Potential current-hosted schema/catalog reconstructability with explicitly enumerated omissions; still not an old physical backup or source data restore | **NOT AUTHORIZED**. Any source export, even schema-only, requires a new explicit owner/DBA/privacy decision; credentials and real data remain prohibited |
| Physical Nov 10 backup clone | Supabase-managed historical physical image | Would potentially test physical recovery, but cannot establish the required pre-start egress isolation | **NO-GO** under support ticket SU-549418; do not run |

**Acceptance boundary for both A and B:** no historical Nov 10 physical-backup restoration, backup checksum, physical RPO or RTO, live user/lead recovery, provider-managed Auth/Storage/Vault/platform recovery, or external-service state verification. Any result must be labelled **LOGICAL SCHEMA / SYNTHETIC RECONSTRUCTION ONLY** and measured as elapsed logical reconstruction time, never physical RTO. The DBA must say whether A alone is sufficient, B is necessary, or neither satisfies the proposed narrow staging requirement.

### 6.2 Versioned source and target manifest — confirmed baseline vs review-open inventory

| Manifest field | Recorded review input | Required disposition before acceptance |
| --- | --- | --- |
| Reference staging source | Supabase **ndxpjqkthuzxlmbenxti**, **reference only**; no export or mutation | Confirm source ownership, time/version boundary and lawful access; forbid production **doaozrkrtgeslddwhclj** as source or target |
| Git design/proposal | PR #698 design head **e2d576ed9329939ee8531d101db97469350b89d7** before this package update | Re-pin the **new PR head** after this documentation commit; record immutable SHA and reviewed file blob |
| Existing limited synthetic rehearsal | PR #697, [GitHub-only recovery rehearsal record](https://github.com/yogakulamacademy/salsys-os/blob/test/r2-pr685-github-recovery-rehearsal-20261111/docs/checkpoints/R2-PR685-GitHub-Only-Recovery-Rehearsal-v1.md) | Cite only for its SQL/ACL and rollback fixture; it is NOT an entire-stage schema recovery |
| Prior hosted catalog snapshot | Nov 12 SELECT-only metadata: **214 public tables (213 RLS enabled), 167 views/materialized views, 389 public functions (315 SECURITY DEFINER), 177 non-internal public triggers** | These are *dated aggregate baselines*, not a complete allowlist or proof of current-state equality; obtain reviewed inventory by name/identity/owner/ACL/signature and scope before any actual import |
| Network-capable mechanisms | Current installed-extension screen found **pg_cron**; 5 configured jobs, 4 active, active jobs no non-SELECT-1 commands in observed inventory | Inspect **every** proposed DDL and source dependency for cron/job creation, HTTP/network functions, FDW/server/user mappings, triggers, queues, events and extension objects. Historical/current observation is NOT containment proof |
| Schema scope | Candidate **public** application DDL and explicitly required dependency definitions, rights, RLS policies and role stubs from pinned reviewed source; no automatic arbitrary **ALL SCHEMAS** import | DBA to approve **named object-by-object manifest** for tables, views, sequences, functions with exact signatures, triggers, owners, grants, RLS/force-RLS and required safe extensions; a count-only inventory cannot close this |
| Explicitly excluded | Hosted tenant/customer row data, live Auth users, Storage objects, Vault and pgsodium secret keys, provider credentials, webhooks, cron jobs that can run, connected FDWs, external settings, logs, billing, prod integrations and Supabase platform state | Maintain signed exclusion manifest. If any exclusion breaks the narrow test, **STOP** and return to DBA/privacy; do not silently include sensitive data |
| Roles and extensions | Synthetic local role mappings only (anon, authenticated, service_role) where needed for faithful ACL tests; **no** live tokens, service keys or real Auth sessions | Approve compatible PostgreSQL version, permitted extension binaries, exact role handling and non-superuser runtime privileges; mark behavior requiring Supabase-managed services as **NOT TESTED** |
| Migration ledger | Real staging historically **433** versions, missing **20261110041634**; two hosted-vs-main WhatsApp version aliases; PR #697 simulated **433→434** offline | Ledger/version manifest is **provenance-only fixture**. No hosted ledger write, no replay of already manually applied PR #685 SQL, no invented 434-hosted-state claim |
| Pinned tools and artifact hashes | PR #685 SQL source reviewed Git blob **4dce41ad8f75d486c33e1364646ca24d44bf5c31**; PR #697 recorded a 433-version manifest digest **9b83197df43d64401e6444f0af5458ddae5b8e4be7573736f7a4ff979d1f4d90** | Capture current actual source SHA, Git blob, PostgreSQL major/minor, CLI/dump/import versions and artifact SHA-256 **after independent review and before authorized execution**; do not use the fixture digest as a live database backup checksum |

**Object-level manifest is still an OPEN DBA design item**, not fabricated from totals. For each in-scope object, require canonical schema-qualified name/signature, source commit/blob, dependency graph, expected owner, ACL, RLS/force-RLS/policy details, trigger/event state and whether the DDL can execute functions during install. Unresolved function/extension behavior = **STOP / CHANGES REQUIRED**, not silently omitted. Verify that the non-RLS public table **ad_activation_runner_state** is service-only before judging its intentional exemption; earlier read-only evidence found 0 rows and no anon/auth read/write grants, not proof of general safety.

### 6.2a Source-indexed object/dependency subset (repository verified; NOT the full stage manifest)

The following **source-level cross-reference** was extracted from the exact reviewed GitHub SQL blobs in PRs #685 and #686. It is for **scope classification**, not proof of a complete current-hosted catalog, actual execution or recovery. **This subset does NOT enumerate all 214 public tables / 389 functions in staging.** Per-object readback, proper signatures and independent DBA review remain necessary.

| Reviewed stage-only source and verified Git blob | Explicit SQL surfaces | Fidelity and approval boundary |
| --- | --- | --- |
| [#685 privileged grants SQL](https://github.com/yogakulamacademy/salsys-os/blob/1243ea8e5940210542b8a05385cac4d4b27692e7/supabase/staging-only/migrations/20261110041634_r2_staging_privileged_function_grants_v1.sql); blob **4dce41ad8f75d486c33e1364646ca24d44bf5c31** | **26** REVOKE EXECUTE ON FUNCTION statements: **22** existing privileged functions; **1** prepare_failed_whatsapp_provider_retry_v1; **3** read wrappers (get_pipeline_snapshot, get_reengaged_workspace_v2, get_tracking_workspace). **4** ALTER FUNCTION search_path statements: log_new_lead_stage, normalize_event_intelligence_url_v1, privacy_purpose_for_event_v1, set_updated_at | Stage postconditions were separately read back after manual execution, but migration ledger version **20261110041634 is ABSENT**. **Never rerun this SQL on hosted staging.** Function ACL parity requires exact argument signatures and role matrices, not names alone |
| [#686 automation guard SQL](https://github.com/yogakulamacademy/salsys-os/blob/5fef76def72babf33a4d01091959ea9b95447336/supabase/staging-only/migrations/20261110043007_r2_staging_automation_tenant_guard_v1.sql); blob **e621500b5264aab86cbbcd1b91b718631254a9ed** | Existing public.enforce_automation_tenant_alignment_v1() CREATE OR REPLACE; preflight for **seven** tables: automation_events, automation_runs, automation_enrollments, automation_suppressions, automation_scheduled_jobs, automation_variables, automation_wait_states; dependencies include leads, conversations and messages | **NOT INSTALLED**. Source body fingerprint, tenant RLS/trigger preflights and table references are proposals, not witnessed runtime claims. Keep this as a future stage delta, not reconstructed current state |
| [#686 privacy schema SQL](https://github.com/yogakulamacademy/salsys-os/blob/5fef76def72babf33a4d01091959ea9b95447336/supabase/staging-only/migrations/20261110043010_r2_staging_privacy_identity_dependencies_v1.sql); blob **2a7af019efb727a2e5036ab1611b1d084edbd142** | Proposed tables privacy_erasure_jobs and privacy_export_runs; index idx_privacy_erasure_jobs_pending; policies privacy_erasure_jobs_member_read and privacy_export_runs_member_read; parent alteration targets persons and privacy_data_subject_requests; dependencies on organizations and organization_members | **NOT INSTALLED**. Parent composite keys and child FKs require DBA/privacy sign-off on locks, RLS, grants, deletion/retention and rollback. No real erasure or export job is authorized |
| [#686 reliability SQL](https://github.com/yogakulamacademy/salsys-os/blob/5fef76def72babf33a4d01091959ea9b95447336/supabase/staging-only/migrations/20261110045151_r2_stage_only_lead_reliability_rehearsal_v1.sql); blob **7a5ded898443f626e4452e5c4cae32157350f4a5** | Proposed public.ingest_website_lead(...) replacement; dependencies include lead_ingest_events, leads, organization_sites, web_sessions, lead_contacts, courses, visitor_identity_links, touchpoints, conversations, messages and activities | **NOT INSTALLED**. Its reviewed source-fingerprint guard must match; unlike the other two #686 stage-only SQLs, this source does not set explicit lock/statement timeout. Requires separate DBA controls and stage authorization |

**Required object-manifest completion:** (1) classify each selected object as **OBSERVED-HOSTED / GIT-ONLY-CANDIDATE / INTENTIONALLY EXCLUDED**; (2) for every function record canonical name and full argument signature, owner, SECURITY DEFINER, search_path, EXECUTE by role and caller dependencies; (3) for tables, indexes, constraints, triggers, policies and extensions record owner, RLS mode, role grants, definitions, dependency order and side-effect analysis; (4) authorize a separate **read-only hosted catalog inventory** before claiming current state object parity; and (5) **STOP** on omitted, unidentified or mismatched objects instead of silently filtering them. All blob hashes above are repository-source identities, **not** actual database-backup hashes.

**DBA design choice still open:** Should option A restrict itself to the existing synthetic PR #685 SQL/ACL fixture, explicitly excluding **uninstalled** PR #686 sources? Or is a broader current-hosted schema reconstruction (option B, requiring separate schema-export consent) necessary for the revised narrow staging gate? Replaying new migration candidates out of order cannot establish faithful current-hosted staging recovery. No SQL execution, source export or stage install is authorized here.

### 6.2b Source-exact #685 function grant/search-path manifest (read from immutable Git blob; not replay authorization)

The **26 revoke and 4 search-path statements below have been extracted directly**, in source order, from [PR #685's reviewed stage-only SQL](https://github.com/yogakulamacademy/salsys-os/blob/1243ea8e5940210542b8a05385cac4d4b27692e7/supabase/staging-only/migrations/20261110041634_r2_staging_privileged_function_grants_v1.sql), Git blob `4dce41ad8f75d486c33e1364646ca24d44bf5c31`. This list is an **exact referenced SQL signature/delta subset**, *not* the 389-function hosted catalog; it does **not** prove that every function body, owner or ACL equals the hosted target. Unshown dependent objects are **not presumed covered**.

| # | Exact SQL function signature in reviewed source | Proposed grant/config delta |
| ---: | --- | --- |
| 1 | `public.attach_whatsapp_outbound_message_id(p_lead_id uuid, p_conversation_id uuid, p_body text, p_external_message_id text)` | Revoke PUBLIC, anon |
| 2 | `public.auto_disarm_whatsapp_provider_pilot_v1()` | Revoke PUBLIC, anon, authenticated |
| 3 | `public.can_manage_lead_assignments()` | Revoke PUBLIC, anon, authenticated |
| 4 | `public.enforce_admissions_auto_task_event_org()` | Revoke PUBLIC, anon, authenticated |
| 5 | `public.enforce_automation_tenant_alignment_v1()` | Revoke PUBLIC, anon, authenticated |
| 6 | `public.enforce_task_organization()` | Revoke PUBLIC, anon, authenticated |
| 7 | `public.evaluate_identity_for_lead_v1(p_lead_id uuid, p_source_system text)` | Revoke PUBLIC, anon, authenticated |
| 8 | `public.finalize_course_catalog_sync(p_run_id uuid, p_source_system text, p_organization_id uuid)` | Revoke PUBLIC, anon, authenticated |
| 9 | `public.guard_organization_site_alias_claim_v1()` | Revoke PUBLIC, anon, authenticated |
| 10 | `public.guard_organization_site_primary_claim_v1()` | Revoke PUBLIC, anon, authenticated |
| 11 | `public.ingest_tracking_event_v1(p_organization_id uuid, p_tracking_source_id uuid, p_source_event_id text, p_event_name text, p_ingestion_method text, p_occurred_at timestamp with time zone, p_anonymous_visitor_id text, p_session_key text, p_external_message_id text, p_site text, p_payload jsonb, p_context jsonb, p_metadata jsonb, p_schema_version integer, p_is_browser boolean)` | Revoke PUBLIC, anon, authenticated |
| 12 | `public.reconcile_whatsapp_canonical_message_approval_v1()` | Revoke PUBLIC, anon, authenticated |
| 13 | `public.release_physical_room_with_accommodation()` | Revoke PUBLIC, anon, authenticated |
| 14 | `public.resolve_whatsapp_channel_policy_v3(p_organization_id uuid, p_lead_id uuid, p_workflow_id uuid, p_template_name text, p_template_language text, p_whatsapp_account_id uuid, p_approval_request_id uuid, p_now timestamp with time zone)` | Revoke PUBLIC, anon, authenticated |
| 15 | `public.run_admissions_auto_tasks(p_organization_id uuid, p_dry_run boolean)` | Revoke PUBLIC, anon, authenticated |
| 16 | `public.search_enqueue_row_trigger_v1()` | Revoke PUBLIC, anon, authenticated |
| 17 | `public.search_privacy_tombstone_trigger_v1()` | Revoke PUBLIC, anon, authenticated |
| 18 | `public.set_course_batch_admin_event_organization()` | Revoke PUBLIC, anon, authenticated |
| 19 | `public.sync_batch_changes_to_leads()` | Revoke PUBLIC, anon, authenticated |
| 20 | `public.sync_lead_from_preferred_batch()` | Revoke PUBLIC, anon, authenticated |
| 21 | `public.update_crm_pipeline_aging_rule(p_stage text, p_warning_hours numeric, p_stuck_hours numeric)` | Revoke PUBLIC, anon, authenticated |
| 22 | `public.update_crm_stage_probability(p_stage text, p_probability numeric)` | Revoke PUBLIC, anon, authenticated |
| 23 | `public.prepare_failed_whatsapp_provider_retry_v1(p_organization_id uuid, p_failed_audit_id uuid, p_now timestamp with time zone)` | Revoke authenticated |
| 24 | `public.get_pipeline_snapshot()` | Revoke PUBLIC, anon |
| 25 | `public.get_reengaged_workspace_v2()` | Revoke PUBLIC, anon |
| 26 | `public.get_tracking_workspace()` | Revoke PUBLIC, anon |
| 27 | `public.log_new_lead_stage()` | Set search_path to public, pg_temp |
| 28 | `public.normalize_event_intelligence_url_v1(p_value text)` | Set search_path to public, pg_temp |
| 29 | `public.privacy_purpose_for_event_v1(p_event_name text)` | Set search_path to public, pg_temp |
| 30 | `public.set_updated_at()` | Set search_path to public, pg_temp |

**Count integrity:** **26** function EXECUTE revocations, **4** search-path alterations, **30** source statements total. The source changes **no table DDL**; it must **never be rerun on hosted staging**, where earlier read-only postconditions were already present but the migration version `20261110041634` remains absent. The reviewer's remaining obligations are: independent authoritative per-signature owner/SECURITY DEFINER/EXECUTE/search_path catalog comparison, function body/dependency assessment, the complete in-scope database object manifest, and an explicit replacement-vs-supplementary evidence decision. Any differences require **CHANGES REQUIRED**, not source-based assumptions. **No SQL executed in producing this manifest.**

### 6.3 Proposed pre-execution no-egress architecture and witness procedure

**Design intent (not yet built or witnessed):**

1. Use an **operator-owned ephemeral local PostgreSQL environment**, disconnected from customer-facing networks, cloud VPCs, CI runners with Internet access and any Supabase service. Pin tool versions and binaries; require an independently reviewed PostgreSQL/extension compatibility table.
2. Establish **deny-by-construction network containment before PostgreSQL or any import SQL starts**: detached/disabled network adapter or isolated VM/network namespace with default-deny egress at **host and guest** boundaries; no default route, usable DNS, bridged Docker network or forwarding to Internet. A firewall rule toggled *after* import is insufficient. If the host cannot demonstrate durable outbound denial, **NO-GO**.
3. Prohibit all real credentials and live source endpoints: no DATABASE_URL, service-role/JWT secrets, SMTP, WhatsApp/Meta, Instagram, ads, payment, webhooks, analytics, Supabase Auth/Vault keys, browser tracking or automatic retries. Runtime uses only generated local synthetic roles and fixtures. Do not put sensitive dumps in GitHub, Actions, logs or chat.
4. Independently review the DDL **statically before any execution**, including post-install hooks, event triggers, background workers, extension load behavior, SECURITY DEFINER search paths, cron/jobs and external functions. Explicitly strip/disable or replace unsafe dependencies by **reviewed local-only fixtures**, documenting test exclusions and fidelity losses. Do not execute arbitrary uninspected dump text.
5. **Witness pre-start negative controls** using reserved, non-production network targets, verifying denied DNS and TCP/UDP attempts while capturing host/guest firewall and route state. Validate the controls without making contact with live customers, providers or production services. Independent witness records timestamped denial evidence, interface/route state and absence of provider secrets **before DB start/import**.
6. Keep containment enabled throughout hypothetical import, synthetic test execution and cleanup. Re-run denied-connectivity tests during and after teardown. Never interpret 0 observed external events alone as proof; require demonstrable blocked paths and monitoring. Any network route, egress packet success, unexpected credential, active external job or unreviewed side-effecting function triggers **ABORT** and incident review.

**Witness proof required for a future execution:** operator/independent witness identity, signed isolation checklist, host/guest policy hash and adapter state, negative test outcomes, timestamps before start and after cleanup, and redacted firewall/network observations. No such evidence exists yet, so **NO-EGRESS NOT VERIFIED**.

### 6.4 Synthetic-only fixture and tenant authorization matrix

Synthetic fixtures must use random **non-real** identifiers, generated emails under reserved example domains, fictitious tenants A/B, synthetic users/roles and non-production consent events. Do not copy current production or staging identities, payment states, visitor keys, auth cookies or provider messages.

| Fixture case | Expected acceptance assertion | Failure outcome |
| --- | --- | --- |
| Tenant A owner/admin with synthetic active session | Sees only tenant A authorised objects/operations; matching in-scope RLS and owner/admin policy | Unauthorized denial, unexpected cross-tenant visibility |
| Tenant B owner/admin with separate synthetic session | Sees only tenant B state | A↔B data exposure or accepted cross-tenant mutation |
| Tenant A non-admin/member | Denied privileged merge/export/delete or grant-changing actions; intended authorized read-only behavior retained | Unauthorized elevation |
| Anonymous/expired/revoked session | Cannot invoke restricted SECURITY DEFINER/RPC paths or read restricted tables; no anonymous privilege broadening | Any unexpected EXECUTE or data access |
| Local synthetic service role | Only explicitly reviewed service operations are permitted; privilege use and expected definer ownership traceable | Unreviewed bypass, excess grants |
| Consent withdraw/regrant fixture | Optional analytics absent without consent; identity epochs not silently stitched across withdrawal; necessary forms handled separately | Consent-boundary stitch or optional event write |
| Failure injections | Simulated import interruption and transaction rollback leave no partial authoritative state; cleanup can erase disposable artifacts | Unreconciled DDL/permissions, artifacts or side effects |
| Egress denial under side-effect test | Reviewed synthetic network-attempt function cannot reach external network | Any successful outbound connection |

**Important limitation:** A local role stub is not an actual Supabase JWT/Auth integration; these tests cannot replace **0/16 real signed-in staging cases** or prove full managed service behavior. Any discrepancy goes to **CHANGES REQUIRED**, not a weaker assertion. No fixture/database creation is authorized by this documentation.

### 6.5 Proposed operator runbook: design → separately authorized execution → post-test acceptance

| Phase | Planned action / artifact | Stop or gate |
| --- | --- | --- |
| **A — design freeze (current)** | Review proposed replacement-vs-supplementary contract; complete object-level scope/exclusion manifest; select option A or B; assign names to DBA, privacy approver, operator, independent witness, incident lead and cleanup owner; provide precise pinned tool and SHA list; produce offline/static SQL inspection method, consent/privacy procedure and no-egress test plan | **DBA written ACCEPT / CHANGES REQUIRED / REJECT**, plus separate privacy review. No SQL and no export |
| **B — owner contract adoption (future)** | Only after qualified independent DBA and privacy decisions, owner **ADOPTS or REJECTS** narrow staging replacement and explicitly owns physical-backup, physical RPO/RTO and platform-restore residual risks | No implicit adoption from a GitHub APPROVED review |
| **C — execution GO (future)** | Owner separately authorizes a **named operator**, exact source/target, no-egress target and approved version-pinned procedure, cost limit (if any), duration/retention, witness and abort/cleanup process. If option B selected, separately permit its exact schema-only source export and classify incidental sensitive metadata | Without specific new authorization: **NO-GO**. Even a schema-only dump is an export |
| **D — rehearsal (future only)** | Independently witness isolation **before SQL**; inspect approved input; construct/reconcile pinned in-scope schema and synthetic fixtures; run tenant/RLS/privilege/rollback and egress-denial cases; time only logical reconstruction; compare expected-vs-observed objects, permissions, policies, counts and exclusions | Immediate **ABORT** on egress, secrets, unapproved objects/data, privileged drift, missing protections, runtime error outside reviewed expectation or broken cleanup |
| **E — post-test closeout (future only)** | Witness artifact deletion, confirm no external actions, independently verify redacted logs and expected failure paths; DBA issues PASS/FAIL for **bounded logical reconstruction only**, privacy independently reviews data containment, owner decides if R2 narrow recovery gate can be closed | Physical backup, RPO/RTO, managed Auth/Storage/Vault, migration-history repair and 0/16 real staging acceptance **remain separately open** |

**Prescribed rollback/stop decision:** The only acceptable candidate destination is disposable, disconnected and non-public. If the run deviates, **stop immediately**, block source/target access, preserve redacted incident metadata in the protected evidence location, discard the destination only under the signed incident/cleanup procedure, and require DBA/privacy review before any rerun. Never attempt automatic reconnection or automatic reconciliation of live source rows.

### 6.6 Roles and evidence — mandatory fields remain blank until independently assigned

| Role | Candidate/confirmation | Required evidence |
| --- | --- | --- |
| Qualified independent DBA/recovery approver | **thedetourclubind-cloud candidate; changes required** | A dated decision specifying permitted source type A/B, scope manifest, pass/fail/rollback, no-egress design and unverified physical debt |
| Independent privacy/security approver | **thedetourclubind-cloud nominated by owner as candidate**, **qualifications/authority/independence NOT established** in [#700](https://github.com/yogakulamacademy/salsys-os/issues/700) | Separate written privacy decision, competence, authority, conflicts, risk and artifact control conditions |
| R2 owner / residual-risk acceptor | **yogakulamacademy**; final adoption **NOT GIVEN** | Later explicit **ADOPT / DO NOT ADOPT** plus risk decision |
| Actual local execution operator | **UNASSIGNED / NOT AUTHORIZED** | Full name/role, host/target scope, per-run GO, signed runbook/version and operator log |
| Independent network/DB witness | **UNASSIGNED** | Independently signed pre-start and ongoing no-egress checks, SQL/permission observations and cleanup |
| Incident escalation & cleanup owner | **UNASSIGNED** | Contact method in protected register, incident thresholds, disposal policy and signed destruction proof |

**Evidence location:** A restricted owner-approved evidence store (not GitHub public comments, customer chats, CI logs or any production database). GitHub retains *only redacted digests and decision references*. Evidence IDs should be reserved for: **E01** approved source/manifest/version hashes; **E02** isolation and pre-start negative network test; **E03** approved/sanitized DDL plus excluded-object manifest; **E04** synthetic tenant and ACL/RLS outcomes; **E05** expected/observed inventory and rollback results; **E06** timing with logical-only label; **E07** incident/stop and independent cleanup attestation; **E08** two independent decisions plus final owner adoption and operator GO. **E01–E08 are required future evidence, not currently observed artifacts**. Evidence retention/deletion periods must be determined by the privacy approver, not invented in this document.

### 6.7 Explicit separate history and release boundaries

The earlier **433-version** hosted staging manifest and PR #697 offline 433→434 calculation are **not** hosted ledger reconciliation. Missing **20261110041634** relates to manually executed PR #685 security ACL SQL already reflected in staging catalogs. **Do not rerun PR #685 SQL, insert/repair ledger entries, apply PR #686, or merge any release PR under this recovery design.** The two WhatsApp migration aliases remain provenance caveats requiring independent DBA treatment. PR #686 tenant/privacy/reliability stage-only files have their own migration-privacy-rollback acceptance and no install approval.

Full R2 requires distinct P1 consent-safe opt-in, P2 signed-in tenant isolation, P3 consent/retention and enough mature history, plus isolated staging witnessed acceptance. These remain **0/16 ON HOLD** and **R2 NO-GO** regardless of this document.

**Current condition-closure summary:** Scope choice **PROPOSED, NOT DBA ACCEPTED**; dated aggregate source inventory **AVAILABLE**; complete object-name manifest **NOT PROVIDED**; network isolation architecture **PROPOSED, NOT WITNESSED**; synthetic test matrix **SPECIFIED, NOT EXECUTED**; tool pinning and real source hash **PENDING**; named operator/witness **UNASSIGNED**; protected evidence and retention policy **PENDING PRIVACY REVIEW**; owner contract adoption **NOT GIVEN**. This is a concrete package for follow-up design evaluation, **not** a claim that every DBA condition is already closed.

## 7. Unchanged release boundary

**R2 release NO-GO; 0/16 isolated staging acceptance stays on hold; production and hosted staging unchanged.** Do not start the Supabase physical clone, do not run `supabase db dump`, do not create a billed project or deploy code, and do not repair the migration ledger. PRs #685, #697 and #698 retain their separate review, merge and authorization gates.
