# R2 PR #685 — GitHub-only recovery rehearsal (2026-11-11)

**Scope:** draft-only CI proposal; no hosted SQL, Supabase writes, migration repair, merge, deployment, paid project, or production changes. Canonical status: issue #531, **STAGING FREEZE / NO-GO**.

## Provenance and version reconciliation

- Hosted read-only staging ledger snapshot: project **ndxpjqkthuzxlmbenxti**, 433 unique versions at the November 11 observation; fixture **tests/fixtures/r2-pr685-staging-ledger-20261111.json**. Contains migration identities only, never tenant rows or credentials.
- Independently uploaded successful GitHub main Migration Replay **#404**: commit **01a83d5190b25d2b0c77f18d3b90be59fded6499**, 433 local versions, digest (sorted, newline-joined version strings) **9b83197df43d64401e6444f0af5458ddae5b8e4be7573736f7a4ff979d1f4d90**.
- Exact 433-version sets agree after **only** these aliases: hosted **20261111082713_whatsapp_template_drafts_v1** maps to source/replay **20261111103500_whatsapp_template_drafts_v1**; hosted **20261111082927_whatsapp_template_draft_name_length_guard_v1** maps to source/replay **20261111141500_whatsapp_template_draft_name_guard_v1**. These are version identity correspondences only; equal SQL bodies or deployment provenance are **not established**.
- Reviewed PR #685 Git head **1243ea8e5940210542b8a05385cac4d4b27692e7**, stage SQL Git blob **4dce41ad8f75d486c33e1364646ca24d44bf5c31**, hosted migration version **20261110041634** absent from ledger. Manual SQL execution is evidenced elsewhere in #531; never rerun it on hosted staging.

## What the new isolated CI verifies

1. Check the pinned hosted manifest has 433 distinct records, expected final aliases, no PR #685 ledger entry, and matches archived main replay #404 digest after exactly two mappings.
2. Check out the **exact PR #685 Git commit** as a read-only secondary fixture source (without merging or moving SQL under normal migrations).
3. Verify exact reviewed SQL Git blob before use.
4. Generate synthetic PostgreSQL 17 functions satisfying catalog preflight (22 privileged definers, 3 ordinary wrappers, service-only retry target, 4 invokers and human-admin-only Sales Asset guard).
5. Execute unchanged reviewed SQL in one throwaway CI Postgres database and require script postflight plus explicit global anonymous-permission and search-path checks.
6. In a second throwaway CI database, inject a controlled exception after reviewed DDL but before COMMIT. Require expected failure and verify original preflight catalog remains intact on a fresh connection.
7. Upload sanitized logs and version/fixture scope reports.

## November 11 read-only hosted WhatsApp catalog verification

After the draft's initial green CI, the operator performed an independent **SELECT-only** PostgreSQL catalog readback against staging project **ndxpjqkthuzxlmbenxti**. The SQL is preserved for repeatability at **docs/sql/r2-pr685-whatsapp-template-drafts-readonly-parity-v1.sql** and returns exactly 15 Boolean assertions, **all true**.

The 15 checks cover the expected 17 WhatsApp draft columns, enabled RLS, fail-closed client policy, corrected 1–512-character template-name constraint, tenant guard trigger, SECURITY DEFINER function body/search-path settings, service-role-only guard EXECUTE permission, table SELECT permissions, organization/status index, unique template-name constraint, category/status/payload checks, and payload/status defaults.

Compared with repository files:
- **supabase/migrations/20261111103500_whatsapp_template_drafts_v1.sql** (Git blob **d50e5faa263ee82d3b486b1b69cb139ba5b7619c**)
- **supabase/migrations/20261111141500_whatsapp_template_draft_name_guard_v1.sql** (Git blob **0f8d0597f519a85d84131a7e7b5963d7d35463a5**)

The current hosted metadata **agrees with the intended resulting table, policy, constraints, trigger, defaults and access-control structure** of these source migrations. This improves confidence in the two timestamp aliases; it does **not** prove the hosted migration SQL bodies were byte-for-byte identical, establish causation or history, test runtime tenant access, or change the missing PR #685 ledger entry. No rows or application data were read or modified.

## Critical evidence limits and blockers

- **Offline version reconciliation and synthetic SQL transaction rehearsal only.** This does NOT replay all 433 hosted migration bodies, prove hosted data/schema parity, prove live signed-in/tenant app behavior, or reconstruct exact WhatsApp SQL objects.
- Does NOT restore the **November 10 physical backup**, prove hosted Supabase restore, or demonstrate recovery time.
- The manual SQL Editor batch is already present in hosted staging but its ledger entry is absent. No ledger repair, db push, grant expansion, rollback or history insertion is authorized.
- Passing CI is not DBA approval, release approval or permission to lift the staging freeze.
- The workflow passes no secret or Supabase project target. PostgreSQL is runner-local **127.0.0.1:55432**, with SQL in throwaway databases only.

## Independent review required

Review pinned fixture provenance/digest, workflow permissions, exact PR SQL checkout and byte guard, synthetic fixture realism, transaction rollback assertion, and artifacts. The independent DBA decides whether the limited **logical reconstruction / function ACL** gate can be credited and which provider physical backup/hosted restore evidence remains open.

Keep PR #685 and issue #531 unclosed until separately approved decisions are recorded.
