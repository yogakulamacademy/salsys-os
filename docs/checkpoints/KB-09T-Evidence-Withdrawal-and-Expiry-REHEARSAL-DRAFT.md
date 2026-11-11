# KB-09T — Erase synthetic evidence on withdrawal and bounded expiry

**STATUS: LOCAL DISPOSABLE REHEARSAL ONLY; NOT A MIGRATION; NOT RELEASE-APPROVED**  
**Date:** 2026-11-08  
**Parent:** unmerged [KB-09S draft PR #662](https://github.com/yogakulamacademy/salsys-os/pull/662) at exact SHA `4ba501b64444614cb9f603b42ede92faf7d2d7fc`.

## Why this checkpoint exists

KB-09S can atomically persist a small synthetic crawler-evidence envelope with the existing proof-/consent-checked page commit. That establishes **creation integrity**, not the right to retain, access, delete or redistribute real website content. A new source-evidence table would otherwise outlive the user's existing purpose-limited consent after withdrawal, even when the existing jobs and audit are correctly cancelled. An independent legal privacy and DBA decision is required before such content can exist outside a disposable test.

KB-09T tests the **deletion half of the proposed lifecycle** without creating any user data or changing the production collection path.

## Disposable-only design

- `docs/sql/KB-09T-evidence-withdrawal-expiry-REHEARSAL-DRAFT.sql` refuses to run unless the database is a newly created random, auto-dropped `salsys_kb09f_<18 hex>` fixture with synthetic sessions, parent KB-09S checked-contract RPC, and no `leads`/`contacts` tables. It is not in `supabase/migrations`, does not alter an existing hosted DB, and does not install a scheduler.
- A private `kb09t_fixture.erase_on_withdrawal_v1` trigger runs **in the exact transaction** of the existing `withdraw_knowledge_discovery_consent_v1` signed-admin audited consent UPDATE. Its parent obtains locks on matching jobs before consent. The trigger deletes only the matching organization + exact configured HTTPS hostname's **synthetic** evidence rows and writes metadata-only erasure receipts. It never stores quotes, URLs, hashes or HTML in the receipts. The original grant/withdrawal audit is unchanged and remains append-only.
- If writing an erasure receipt fails, the entire withdrawal transaction rolls back, including the consent UPDATE, evidence DELETE and any original cancellation/audit changes; the client cannot receive a misleading successful withdrawal while a dependent synthetic quote remains. An independent product/privacy decision must determine whether a failure should instead put ingestion in a held/blocked state and retry, without falsely reporting erasure completion.
- A private `kb09t_fixture.page_evidence`-associated **synthetic 60-second TTL** and a service-only, bounded (1–50 per call) `kb09t_purge_expired_synthetic_evidence_v1` exercise expiry. **60 seconds is an arbitrary test duration, not a proposed real retention limit.** There is no cron, worker, policy enablement, external service or real content. The sweep only targets expired rows with row locks and writes metadata-only receipts atomically; failed receipt insertion rolls back deletion. Client roles cannot execute the sweep or directly read/modify evidence or receipts, and service role cannot extend TTL or directly delete quotes.
- Private append-only erasure receipts hold only synthetic organization/job/page IDs, an enum reason and timestamp. These IDs may still count as personally identifying metadata under some circumstances. No legal lifespan, backup erasure, log truncation, data export or shared provider retention is approved; an SQL trigger cannot guarantee physical storage removal from WAL, database backups, replicas, CDN or other processors.
- The **production** `lib/knowledge-discovery/runner.ts` still uses the old metadata-only checked commit; it never sends source excerpts, uses the KB-09S rehearsed table, invokes the KB-09T sweep or creates any of the private fixture structures.

## Actual assertions

The existing `tests/database/knowledge-commit-ownership-races.test.mjs` auto-dropped localhost suite now runs KB-09T **after** KB-09S and adds deliberately fake evidence for two synthetic organizations. It verifies service-only bounded TTL sweep, non-expired tenant isolation, invalid batch denial, service/client DML/privilege restrictions, a forced receipt INSERT failure that restores expired quotes, and a forced receipt INSERT failure during **signed-user consent withdrawal** that rolls back both the authorization change and evidence deletion. After dropping the failure trigger, it verifies actual consent withdrawal and immutable grant/withdrawal audit plus the **absence of synthetic evidence rows**, metadata-only two-reason receipts, and idempotent sweep.

This is local PostgreSQL correctness evidence, not independent production erasure proof. Synthetic source hashes are not independently attested to the original website, and mock roles are not the same as a completed real Supabase two-tenant review.

## Decisions an independent reviewer must make before real storage

1. **Lawful basis and purpose.** Approve whether collecting excerpts from publicly reachable websites is permitted, how host control and purpose-limited consent apply, whether robots/copyright or third-party personal information change what may be ingested, and when new consent is required.
2. **Retention schedule.** Select retention duration or no-storage policy, whether raw HTML or only excerpts can be held, when evidence and derived source-backed drafts, embeddings, citations and summaries expire, how revisions/superseded sources are erased, and rules for legal hold and disputes. **No duration is preapproved**.
3. **Withdrawal behavior.** Decide whether withdrawal immediately deletes raw and derived text, suspends Co-Pilot use, how in-flight requests/queued jobs are serialized, whether deletion failures block withdrawal or create a pending-erasure state, and whether past approved knowledge based on the source is invalidated or needs separate legal review.
4. **Erasure receipts and secondary copies.** Approve what identifiers are logged and for how long, enforce retention/deletion in database WAL/backups/replicas, scheduled serverless logs, AI/provider prompts, queues, analytics and exports; define measurable completion receipts.
5. **Security and migration.** Independently review grants, private function ownership, `SECURITY DEFINER` search paths and exact service-role/session policy, mixed-provider failure and rollback, live SQL migration order, RLS, cold restore, and protection of unrelated CRM/finance functions.
6. **Staging and witnesses.** Perform the 16 independently witnessed acceptance cases plus extra post-onboarding/source/content/withdrawal/expiry cases with real signed sessions in a truly isolated environment under fresh spending authorization.

**Release remains BLOCKED:** [#601](https://github.com/yogakulamacademy/salsys-os/issues/601) 0/16 real independently witnessed staging scenarios; [#612](https://github.com/yogakulamacademy/salsys-os/issues/612) independent security/GitHub protections, [#613](https://github.com/yogakulamacademy/salsys-os/issues/613) privacy/legal/DBA, and [#614](https://github.com/yogakulamacademy/salsys-os/issues/614) isolated staging/budget remain open. New paid staging stays deferred until business revenue and separate explicit owner cost approval.

**Non-actions:** No customer content, live crawling, provider/LLM call, Supabase Production/Recovery/staging SQL, real consent, migrated schema, scheduled purge, new paid infrastructure, `main` merge, deployment or branch-protection change.
