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

**Required approval order:** (1) qualified **independent DBA/recovery** written decision; (2) independent **privacy/security** written decision by a *designated, qualified reviewer* (**no name verified yet**); (3) **new explicit owner adoption and residual physical-risk acceptance**; (4) **separate named-operator execution authorization** for any actual rehearsal. None is currently received for the *revised* criterion. A previous empty-body GitHub APPROVED review covers the documentation, not this operational change.

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

**Independent privacy/security reviewer:** A qualified reviewer **must first be identified**. Provide **ACCEPT / CHANGES REQUIRED / REJECT** explicitly on synthetic-only default, whether a real data export is forbidden or would need an additional authorization, PII and secrets minimization, Auth/Storage/Vault limitations, provider integration isolation, safe artifact location/access/retention/deletion, incidental sensitive content, and third-party egress assurance. No presumed approval from the DBA's role.

**Owner (after both independent approvals):** Explicitly **ADOPT / DO NOT ADOPT** the changed R2 staging recovery standard and separately record acknowledgement of unverified physical backup integrity and physical RPO/RTO. This owner adoption is **not granted** by permission to propose.

**Operator (only after adoption):** Seek a separate scope-specific execution GO. This packet supplies **no** dump/restore commands and authorizes no operation.

| Required decision | Approval reference/signature | Current status |
| --- | --- | --- |
| Independent DBA revised criterion | Pending | **AWAITING** |
| Qualified independent privacy reviewer identified | Pending | **NOT DESIGNATED** |
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

## 6. Unchanged release boundary

**R2 release NO-GO; 0/16 isolated staging acceptance stays on hold; production and hosted staging unchanged.** Do not start the Supabase physical clone, do not run `supabase db dump`, do not create a billed project or deploy code, and do not repair the migration ledger. PRs #685, #697 and #698 retain their separate review, merge and authorization gates.
