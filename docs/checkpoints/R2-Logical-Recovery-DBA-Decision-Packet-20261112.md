# R2 — logical recovery alternative: DBA decision packet (NOT AUTHORIZED)

**Prepared:** 2026-11-12 · **Source:** staging `ndxpjqkthuzxlmbenxti` · **Supabase Support:** `SU-549418` · **Status:** REVIEW ONLY / R2 NO-GO.

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

**Gate A — scope/acceptance:** Qualified DBA and R2 owner decide whether logical recovery is (i) supplementary evidence only, or (ii) an explicitly accepted **change** to the physical-recovery requirement. If changed, document the physical-backup residual risk, limited disaster-recovery guarantees and updated acceptance criteria. **Default is (i), not an automatic waiver.**

**Gate B — privacy/security:** Independent privacy/security reviewer approves schema/data coverage, data minimization, storage, outbound containment, audit handling, Auth/Vault restrictions, and final deletion.

**Gate C — operator execution:** Exact named operator, isolated environment, no-egress evidence and *separately explicit* consent for any actual source export. A new Supabase project requires its own cost quote and owner consent. Do not treat this document, a user request to "continue", or review comments as authorization.

**Gate D — measurement:** Observe/log independently witnessed logical RTO and reconstructability only if a test is later authorized. Label results **LOGICAL-CURRENT-SNAPSHOT**. Do not report physical RTO/RPO or Nov 10 restore PASS.

**Gate E — migration provenance:** Missing stage ledger `20261110041634` is a **different** reconciliation decision. The security ACLs have been independently read back, but neither a logical restore nor an offline 433→434 simulation authorizes re-running SQL or modifying the hosted migration ledger.

## 5. Independent DBA review request

Please return a written **APPROVE FOR DOCUMENT REFINEMENT / CHANGES REQUESTED / NOT VIABLE** decision on the logical rehearsal design, explicitly answering:

1. Is an **offline, no-egress, synthetic/schema-first** logical recovery rehearsal acceptable as **supplementary** R2 evidence? What exact schemas and checks are mandatory?
2. If the previous requirement was a Nov 10 **physical-backup** rehearsal, which required recovery guarantees remain unproven, and may any requirement be changed with an explicit residual-risk sign-off?
3. How will Auth/Storage/Vault/roles/extension exclusions and `supabase db dump` defaults be represented without misrepresenting restore completeness?
4. Can a demonstrably isolated local environment be built and deleted under an approved operator procedure **without live provider data or network effects**?
5. Which acceptance and rollback evidence, and which distinct later approval, would be required before a *real* data export?

## 6. Unchanged release boundary

**R2 release NO-GO; 0/16 isolated staging acceptance stays on hold; production and hosted staging unchanged.** Do not start the Supabase physical clone, do not run `supabase db dump`, do not create a billed project or deploy code, and do not repair the migration ledger. PRs #685, #697 and #698 retain their separate review, merge and authorization gates.
