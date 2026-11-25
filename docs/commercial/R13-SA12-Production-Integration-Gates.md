# SA-12 production integration preparation — release gates

Status: draft design, not deployment authorization. Baseline main `4e44f56ce132ea22d8a284fc9cd2b5df8963d2fe` includes #855. The consolidated rehearsals are private and ungranted.

## Read-only preflight (2026-11-25)

Production aggregate-only queries found zero Instagram automation runs, zero WhatsApp broadcast campaigns, zero eligible/queued broadcast recipients, and zero ready/sending WhatsApp provider-send audits. This is a point-in-time observation, not permission to backfill or a guarantee that no other work exists. Re-run immediately before any approved rollout with workers quiesced. Authenticated still has effective UPDATE privilege on organizations.status; saas_lifecycle schema is absent.

## Proposed staged rollout

1. Inventory all queue producers, consumers, direct RPCs, status writers, retry paths, consent/suppression, provider receipts and non-broadcast workflows. Confirm internal platform operations are excluded from customer suspension without inadvertently blocking its legitimate automation.
2. Review actual schemas, grants, RLS and existing triggers; reproduce on an isolated full migration replay database. Check legacy organization compatibility, existing name-only onboarding update, direct PostgREST status/queue writes and service-role paths. Do not apply fixture-only SQL verbatim.
3. Prepare additive private schema and separate permissions for quota reads, lifecycle reads and lifecycle mutations. Require current signed bound session and exact platform and target identities. No service-role impersonation, browser grants to private functions, automatic operator seeding or user-editable claims.
4. Define exact read-only RPC response contracts; verify consistent quota and lifecycle history snapshots during concurrent transitions. Validate safe integers, bounded history and data minimization. Keep existing profile counts explicitly distinct from effective quota.
5. Implement guarded producer/approval/claim transactions against actual SQL, including existing consent, template, audience, approval, pilot and suppression checks. Eliminate bypass via old RPCs/direct DML. Lock-order review is mandatory (organization before work where feasible; current update triggers may invert this order). Verify provider pre-call check and preserve finalization even when status changes. External calls already in flight cannot be recalled.
6. Approve legacy queue disposition: never automatically bind old work or clear receipts. Reconcile ready/sending/unknown delivery outcomes and quarantine stale work; explicitly re-create newly authorized work when appropriate. Existing STOP and consent records remain authoritative. No automatic replay after restore.
7. Validate with real signed users in isolated staging: normal customer, cross-tenant, revoked/expired session, non-operator, read-only operator, suspend-only, restore-only, protected platform target, duplicate request, stale revision, concurrent approval/transition, in-flight receipt, and quota read during expiry/reconciliation. Verify old RPC denial, no customer message sent, migration/rollback, and worker throughput.
8. Obtain independent security and DBA review, approved production migration generated with the project CLI, documented rollback/recovery and explicit release authorization. Start with mutations disabled, read-only UI after authorized endpoint acceptance. Enable controlled lifecycle pilot only after worker enforcement is verified. Do not suspend actual customers as a test.

## Rollback and stop conditions

Keep lifecycle control and new execution rollout independently disabled until acceptance. On authorization mismatch, unexpected queue mutation, lost receipt, cross-tenant visibility, deadlocks, worker starvation, or inconsistent counters: stop rollout and new execution, preserve append-only history and receipts, reconcile ambiguous sends before any retry. Do not restore broad authenticated status UPDATE as a routine rollback; do not remove lifecycle fences while suspended tenants or unresolved old work remain. Test exact rollback procedures in isolation and obtain DBA approval. No actual migration or production permission changes are authorized by this document.
