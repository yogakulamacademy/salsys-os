# R2 staging — physical-backup restore preflight and isolation gates

**Prepared:** 2026-11-12. **Status:** DRAFT, review-only, **NO-GO for any restore**.
**Owner issue:** [#531](https://github.com/yogakulamacademy/salsys-os/issues/531).
**Limited rehearsal:** [PR #697](https://github.com/yogakulamacademy/salsys-os/pull/697) independently **APPROVED** for GitHub-only synthetic scope at `3fa074a9e72930b12cd96805b04834b5d44ea7df`, but explicitly **NOT** for physical recovery, history repair, merge or staging release.

## 1. Exact boundaries

- **Source:** `SalsysOS R2 Temporary Staging 20261109`, Supabase project `ndxpjqkthuzxlmbenxti`, PostgreSQL 17.11, region `ap-southeast-1`. READ ONLY until a later, separate scope is authorized.
- **Production:** `doaozrkrtgeslddwhclj`, NEVER use as the recovery-test source or destination.
- **Historical candidate restore point:** daily physical backup noted in #531 as **2026-11-10 20:08:55 UTC**. **Not freshly verified as still available today**. Reconfirm in provider dashboard before proposing a test.
- **Pre-existing recovery project:** `wunnbqjvfzmawubglyhe`, named "SalsysOS Recovery Rehearsal", is active with **0 recorded application migrations** on the 2026-11-12 read-only check. It is **NOT** an approved physical backup destination. Supabase's built-in "Restore to a New Project" provisions a **new** project; never assume it can overwrite/reuse this project or reset it without separate authorization.
- **Cost:** Supabase organization is Pro. Restoring to a **new** project typically creates additional billed compute/storage. **No project creation, paid service, PITR activation, or incurred cost is authorized** by this document. Get and approve the specific provider quote first.

## 2. Critical pre-start side-effect risk: do not initiate clone

Supabase [Restore to a new project](https://supabase.com/docs/guides/platform/clone-project) documentation explicitly warns that a binary/physical clone copies the **entire database**, including extensions that perform external operations (such as `pg_cron`, `pg_net` and wrappers), and **copied jobs begin executing as soon as the restore completes**. There is no supported self-service checkbox to exclude or pause them in advance. **Disabling copied jobs *after* restore is not sufficient to guarantee zero outbound actions.**

Read-only metadata sampled from **current staging** on 2026-11-12:
- `pg_cron` extension: **installed**;
- `cron.job`: **5 total / 4 active**;
- `pg_net`: not found among installed outbound extensions; `net.http_request_queue`: absent;
- one non-internal trigger had a function name matching generic webhook/HTTP keywords; one function source matched HTTP-call keywords. These are **heuristic counts, not confirmed outbound operations**;
- **Stronger verified current cron evidence (read-only):** every one of the 5 recorded `cron.job.command` values satisfies the anchored pattern `^\\s*select\\s+1\\s*;?\\s*$ ` (case-insensitive) — simple `SELECT 1` no-ops; all five have the same command digest. Four are active, but none of their **current command bodies** invokes an external provider. Job names include automation scheduler, archive, Instagram DM retry, and outcome learning; names alone do not describe what the current commands execute.
- **Historical execution evidence for Nov 10 candidate backup:** sampled `cron.job_run_details` between **19:00 and 21:00 UTC, 2026-11-10**, straddling the backup at **20:08:55 UTC**. Observed **250 job runs**: job 1 = 120; job 2 = 2; job 3 = 120; job 4 = 8. For **250/250 runs** the persisted command matches anchored `SELECT 1`; **0 non-noop commands and 0 failures** in this sampled window. This materially lowers the assessed **scheduled-cron outbound-call risk near the backup**. It does **not** prove an immutable backup snapshot, no unexpected jobs outside the window, or any statement about other triggers, worker types, extensions, Auth/Vault or external API access.
- **Non-cron effects still require review:** the catalog contains a trigger `public.trg_sync_whatsapp_webhook_terminal_state_from_raw_v1` on `public.raw_event_processing`; its function name is a heuristic and does not alone prove an external call. `pg_net` is not installed in the current staging metadata. Exact historical backup configuration is **not independently reconstructed**.
- **Vendor confirmation:** the Supabase [Nov 5 guidance on copied pg_cron jobs](https://supabase.com/kb/troubleshooting/how-to-stop-pg_cron-jobs-from-running-on-a-restored-project-or-branch) warns restored jobs may run **before they can be disabled**. It describes receiver-verified secret rotation for controlled HTTP endpoints, but this would entail an independently approved source/receiver change and **does not cover triggers, wrappers or third-party APIs**. No such changes are authorized here.
- The **Nov 10 backup** may still differ from the current staging extension, trigger, role and credential state. This history narrows one specific risk but is **not provider-supported pre-start isolation proof**.

**Pre-start blocking requirement:** a qualified DBA/security reviewer and Supabase/provider operator must establish and document a credible way to ensure that **no restored scheduled task, trigger or extension can deliver outbound calls, messages, payments, tracking or provider writes before controls are active**. Options require an independently approved assessment:
1. A provider-confirmed, enforceable network egress isolation/quarantine that is active **before** cloned workloads start, with evidence, **or**
2. A provider-supported offline physical restore in a fully isolated environment with jobs disabled **before database service starts**, if actually available, **or**
3. An independently approved substitute recovery test **only if** the DBA explicitly reopens and accepts a changed recovery requirement. A logical schema replay is **not automatically** equivalent to a physical-backup restoration.

**Default: NO-GO** for built-in Restore to a New Project until a pre-start containment control is proven. Source-project configuration changes to suppress outbound jobs are **not** authorized and may alter active staging.

## 2A. Additional read-only trigger/extension review and provider decision request

Read-only PostgreSQL catalog check on **2026-11-12**, current staging `ndxpjqkthuzxlmbenxti`:
- **190 user-defined triggers** in the sampled catalog; **0** trigger function sources matched the direct outbound keywords `net.http`, `http_post`, `http_get`, `http(s)://`, `dblink`, `curl` or `supabase_functions.http_request`. Two trigger *definitions* matched broad HTTP/webhook name patterns, which is not itself evidence of an external request.
- Among installed extensions matching the outbound/cron screening categories, **only `pg_cron`** was present. `pg_net`, `http`, `dblink`, `postgres_fdw`, and `wrappers` were not shown as installed.
- Combined with **250/250 no-op historical cron executions** in the sampled window surrounding Nov 10 20:08:55 UTC, this **narrows but does not eliminate** the risk of an external side effect. It does not prove what all jobs, triggers, auth hooks, or endpoint credentials were in the selected physical backup itself.

**Official Supabase support decision required before restore** (no support ticket has been opened by this draft):

1. With a source physical backup from `ndxpjqkthuzxlmbenxti` near Nov 10 20:08:55 UTC, can the provider confirm that a **new project** is isolated **before** the Postgres scheduler, trigger-capable clients, network and Auth endpoints could have external effects? Specify the mechanism, pre-start timing, and testable evidence.
2. If not, does Supabase offer a managed/offline **physical backup restore** for independent validation with outward traffic prevented from the very start, without making changes to the staging or production source? A logical dump/replay is **not accepted** as equivalent.
3. The official [copied cron-job safety knowledge base](https://supabase.com/kb/troubleshooting/how-to-stop-pg_cron-jobs-from-running-on-a-restored-project-or-branch) recommends receiver-verified secret rotation for selected endpoints, but documents that triggers, third-party APIs and wrapper effects remain outside that mechanism. Are there **provider-supported controls** covering those paths without modifying live endpoints?
4. Confirm whether the Nov 10 physical backup is **still available**, the exact restore-time and retained data scope, **new-project billing quote** (including mirrored compute/storage), estimated charge and deletion policy, and any supported alternative not requiring a new billable project. This document **does not approve charges**.
5. Confirm whether there are database-driven effects not visible in `cron.job` or `pg_extension` that an operator must account for before a physical restore.

**Hold:** no self-service restore, source cron rewrite, production-endpoint secret rotation, customer-data export, paid project creation, SQL replay, or recovery-history edit until the qualified DBA reviews the provider response and the owner grants separate scoped/cost authorization.

## 3. Privacy, authorization and scope

Supabase binary restore copies **Auth user records and hashed passwords, database roles/permissions, application data and the encryption root key**, so cloned Vault secrets and encrypted database columns may be readable. Supabase Storage *objects* and certain application configuration are not carried over (see vendor docs). Treat the destination as **sensitive production-like personal data**, irrespective of its display name.

Require, recorded **before** any restore:
- [ ] Named qualified independent DBA accepts the exact physical restore method, backup ID/time, pre-start outbound isolation proof, and rollback/cleanup plan.
- [ ] Named authorized recovery operator and independent observer accept their responsibilities.
- [ ] Explicit owner approval for **the exact source, recovery timestamp, new destination, regional residency, allowed operations and any cost**; quote and capped expense recorded (no default/assumed $0).
- [ ] Current daily-backup/PITR availability and retention verified from Supabase Dashboard; latest point and expected data-loss window documented.
- [ ] Isolation of API/auth access, Auth users, Vault secrets, Vercel/WhatsApp/Instagram/payment/analytics/cron/queue integrations and application endpoints confirmed **before** clone becomes reachable or scheduled jobs run. Merely not deploying a frontend is inadequate.
- [ ] Written redaction/no-real-user-traffic plan; provider egress guard test evidence, data handling, no exposed service keys and deletion/retention plan.
- [ ] Independent sign-off that external side effects cannot occur **during** restoration, not just afterwards.
- [ ] Staging and production project references explicitly excluded from any write/downtime action.
- [ ] Rollback/stop rule: if no pre-start isolation guarantee or cost consent, do not begin the restore.

## 4. Proposed operator sequence (NON-EXECUTABLE; no steps currently authorized)

**Preparation:** freeze source application changes; take source read-only evidence (migration ledger versions, functions/permissions, anonymous EXECUTE checks, cron/extension inventory, app deployment/queue snapshot, redacted reference aggregates); identify an available backup with exact date. Record a fresh actual baseline—not merely the 2026-11-11 433-row fixture.

**Approval:** review pre-start egress containment with the provider and DBA; receive scoped, signed owner and cost approval. A separate approver must authorize source, new destination, restore moment, and expenses; verify project/role permissions.

**Isolated restoration ONLY AFTER APPROVAL:** designated operator executes the specific provider-supported restore procedure using an expressly approved independent destination; preserve source and production. Record timestamps and provider evidence without tokens, personal data or secrets. Ensure egress controls are active before any scheduled workload can execute; if not possible, abort without invoking the restore.

**Validation with external effects disabled:** verify restored schema, backup-ledger version set, 433-vs-backup date expectations, auth/RLS boundaries, tenant isolation, all critical functions and catalog ACLs, and representative redacted business data. Verify no outbound attempts and no unexpected authentication or side effects. Review the missing SQL version `20261110041634` **as a separate reconciliation item**, not an automatic step. The **Nov 10 backup predates** the known Nov 11 WhatsApp migrations and manual SQL batch; reconstruction must be independently planned, never blind replay.

**Evidence and exit:** record backup timestamp, restore start/end, time to validated isolation, measured RTO, actual RPO against the last known-good transaction, provider dashboard evidence, redacted pass/fail checklist and identified gaps. Independent DBA accepts or rejects the physical restore. Explicit owner approval is needed for destination retirement/cleanup too. Do not automatically reconnect messaging, restart jobs, promote an app, merge #697/#685, repair staging migration history, or release the staging freeze.

## 5. Stop / NO-GO conditions

- No definitive backup and retention proof, no approved monetary quote, or unclear ownership.
- Any uncontained restored cron/webhook/extension that might act externally as soon as the restored DB starts.
- No proven pre-start egress isolation; reliance on turning jobs off after clone starts.
- Auth/Vault/tenant data potentially exposed, or controls cannot be independently witnessed.
- Restore proposes to overwrite staging/production or to assume existing recovery project is the target.
- Approval wording is generic ("RECOVERY TEST GO") without the concrete source/backup/destination/isolation/cost and named operator.
- Any request to modify the 433 hosted migration records or re-execute the manually applied PR #685 SQL in this physical test.

## 6. Exact next decisions

1. **DBA / Supabase operator:** Can a truly isolated physical backup restore be performed with pre-start outbound suppression, and how will it be evidenced? If not, remain NO-GO and request supported alternatives.
2. **Owner:** If and only if a viable approach exists, approve exact expense and source/destination/backup/isolation scope in writing.
3. **Operator + independent witness:** Only then schedule and perform the isolated recovery test.
4. **Separate DBA/owner decision:** Independently determine whether and how missing staging migration-history version `20261110041634` may be reconciled. Current 433-row ledger remains unmodified.
5. **R2 staging acceptance:** Keep all unrelated signed-user staging tests and release gates separately tracked. This runbook does not close them.

## Reference evidence

- [Independent PR #697 APPROVED review](https://github.com/yogakulamacademy/salsys-os/pull/697#pullrequestreview-5868132966) — *limited offline rehearsal accepted, physical backup still mandatory, history repair unauthorized*.
- [R2 recovery issue #531](https://github.com/yogakulamacademy/salsys-os/issues/531)
- [Supabase: Restore to a new project](https://supabase.com/docs/guides/platform/clone-project), [Supabase: Database Backups](https://supabase.com/docs/guides/platform/backups)
- Existing production runbook: `docs/SalsysOS_Database_Recovery_Runbook_v1.md` (RPO/RTO are targets until demonstrated).
