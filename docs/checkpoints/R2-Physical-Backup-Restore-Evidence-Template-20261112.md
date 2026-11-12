# R2 — physical backup restore witness record (UNFILLED template)

**DO NOT interpret this form as a GO.** This file is documentation to be completed with redacted provider evidence **only after** a separately approved physical restore test. Blank fields are **NOT VERIFIED**. No commands, tokens, credentials, customer details or personal data should be recorded in this file.

| Approval / evidence | Recorded value | Reviewed by |
| --- | --- | --- |
| Source Supabase project | `ndxpjqkthuzxlmbenxti` — staging only | TBD |
| Physical backup ID and exact UTC timestamp | NOT VERIFIED / NOT SELECTED | TBD |
| Backup retention / availability evidence link | NOT VERIFIED | TBD |
| PITR state (if relevant) | NOT VERIFIED | TBD |
| New destination project and region | NOT CREATED / NOT APPROVED | TBD |
| Existing recovery rehearsal project treatment | `wunnbqjvfzmawubglyhe` **NOT AUTHORIZED** as restore destination | TBD |
| Provider cost estimate (compute, disk, restore) | NOT QUOTED | TBD |
| Explicit owner cost approval, limit and date | NOT GIVEN | TBD |
| Independent DBA physical-test procedure GO | NOT GIVEN | TBD |
| Recovery operator and witness acceptance | NOT GIVEN | TBD |
| Pre-start outbound isolation mechanism | NOT PROVEN | TBD |
| Confirmed cron / trigger / extension safety before start | NOT PROVEN; staging sampled 4 active cron jobs | TBD |
| External integrations and auth exposure containment | NOT PROVEN | TBD |
| Data protection / Vault encryption / Auth user handling | NOT APPROVED | TBD |
| Restore initiated | NO | — |
| Physical backup restored and readable | NOT TESTED | — |
| RPO and RTO measured | NOT MEASURED | — |
| Schema / RLS / tenant isolation | NOT TESTED ON A RESTORED DATABASE | — |
| WhatsApp / provider side-effect zero-leak proof | NOT TESTED | — |
| Restored migration ledger vs backup age | NOT TESTED | — |
| Independent DBA final physical-restore acceptance | NOT GIVEN | — |
| Owner acceptance of residual risks | NOT GIVEN | — |
| Destination cleanup and retention confirmation | NOT PERFORMED | — |

## During the test (if later approved)

- **Before start:** name and signature of operator + observer, immutable restore source and target, vendor quote approval, dated pre-start isolation proof.
- **Clock:** record UTC restore request, provider ready, containment confirmation, first safe validation, and exit time separately.
- **Migration:** compare backup-time version ledger with source-time ledger; never assume the Nov 10 backup includes Nov 11 WhatsApp changes or manually executed PR #685 SQL.
- **Security:** corroborate RLS/role tests on restored instance and record redacted errors without tenant content.
- **External action:** independently prove no restored cron, webhook, queue, WhatsApp/Instagram/email, payment or provider action escaped isolation before/during validation.
- **Business state:** use aggregated/redacted counts and synthetic test identities where possible. Treat restored Auth users, Vault secrets and encrypted columns as sensitive even if disconnected from the CRM frontend.
- **Acceptance:** independent DBA records separate **PASS/FAIL** for physical restore integrity, isolation, RPO/RTO observation, security boundaries, and unresolved gaps. Owner authorizes cleanup or continued retention.
- **Separate gates:** staged-history reconciliation for `20261110041634`, PR merges, stage activation, and full R2 closure are not part of this test and remain separately blocked.

**Release status:** STAGING FREEZE / R2 NO-GO until independently documented evidence and separate approvals.
