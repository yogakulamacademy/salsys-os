# KB-06H — Explicit isolated-staging Auth session binding acceptance (DRAFT / NO DISPATCH)

**Date:** 2026-11-07. **Stacked base:** KB-06G draft PR #597. **Status:** engineering-only, NOT live staging, NOT ready for release.

## Blocker closed in code, not in real staging

KB-06F's optional 20-check read-only consent test signs in two test users using password Auth, but each login mints a **fresh session_id**; its KB-06B `kb_discovery_consent_actor_v1` check strictly requires the exact new session to be bound in `public.tenant_session_bindings` and present in `auth.sessions`. Previous pre-created bindings for other session IDs are unusable, correctly. The existing migration `supabase/migrations/20261014060357_tenant_session_binding_foundation.sql` supplies `public.bind_current_tenant_session(uuid)`, which checks actual signed-in JWT identity, active organization and membership and blocks rebinding an existing session to a different organization.

KB-06H enables **an entirely separate manually authorized mode** that uses that reviewed existing function to bind only the two new test accounts' own sessions in a dedicated staging project. This is a **real session-binding write**, never described as fully read-only or production-safe.

## Runner variable provenance and early credential scope — hardening note

GitHub's [environment documentation](https://docs.github.com/en/actions/how-tos/deploy/configure-and-manage-deployments/manage-environments) explicitly warns that **a job referencing an unknown environment can create it automatically without reviewer rules**. A YAML `environment:` name, a matching `vars` string or a valid input phrase **cannot independently prove protected-environment configuration or a second-person approval**. GitHub [configuration variables](https://docs.github.com/en/actions/reference/workflows-and-actions/variables) also support organization, repository and environment scopes; values may be resolved from a broader scope. **An independent GitHub administrator must read back the actual environment's required reviewers, prevent-self-review, bypass and ref restrictions, and ensure no same-named repository/organization variables or secrets can substitute for intended environment-scoped credentials**. Do not dispatch an unreviewed workflow just to test whether the environment exists.

The KB-06H draft was additionally hardened so that job-wide `env:` holds **only** manual dispatch context and immutable GitHub ref/SHA values. Review-claim `vars` are resolved in the step that performs the corresponding check. The five staging API/test-identity secrets (including both test passwords and the API key) are **only referenced in the final authenticated test step**; checkout, Node setup, manual preflight and offline regression steps receive none of them through workflow configuration. This reduces unnecessary credential exposure but is **not evidence of actual reviewer settings, protected environment origin, approved project identity or staged execution**. No secret or project was created or used during this revision.

New synthetic workflow-regression assertions fail if secrets are reintroduced before the final step or variable/secret expressions are moved to job-wide `env`. Even a green run of those tests never changes S3 from **UNAPPROVED**. The default-branch registration stub PR #602 remains separate, failing by design and unmerged.

## Execution and guard contract

The original `.github/workflows/kb-isolated-staging-readonly.yml`, `--run-readonly`, and `--run-readonly-consent-actor` remain unchanged. The separate, *new* `.github/workflows/kb-isolated-staging-session-binding.yml` has **workflow_dispatch ONLY** and uses distinct protected environment `kb-isolated-staging-session-binding-acceptance`. It is not present or runnable as a production workflow until independently reviewed and merged, and **must not be dispatched automatically**.

The new mode `node scripts/verify-kb-isolated-staging-readonly.mjs --run-bound-consent-actor` is inaccessible unless ALL of the following are present:

1. Original KB-05F exact-sha + reviewed branch + protected project claim, authorized manual `SALSYS_KB_STAGING_RUN_APPROVAL`, and the hard denylist for Production/Recovery Rehearsal.
2. Independent `SALSYS_KB_STAGING_BINDING_APPROVAL_PHRASE=I_APPROVE_TWO_STAGING_TEST_SESSION_BINDINGS_ONLY` (entered by the manual operator) and `SALSYS_KB_STAGING_BINDING_WRITES_READY=OWNER_APPROVED_ISOLATED_STAGING_SESSION_BINDING_WRITES` (from reviewed GitHub environment variables).
3. Two distinct actual, disposable staging owner/admin accounts with active membership in exactly the intended staging tenant, approved synthetic knowledge docs/search markers, and KB-06B draft prerequisites applied **to approved staging ONLY**.
4. A fixed HTTPS `<project_ref>.supabase.co` target matching the exact protected project ref. No secrets, JWT or session IDs in log outputs; no service-role application key, no open HTTP proxy, no arbitrary path or cross-tenant parameter.

The network allowlist permits exactly one new POST endpoint: `/rest/v1/rpc/bind_current_tenant_session`, accepting ONLY the single `p_organization_id` key whose UUID equals one of the two approved staging tenant fixture IDs. It is called separately with A's and B's actual new bearer JWTs, to bind A→A and B→B, then validates exact UUID receipts. No other table-write RPCs are available. **No consent grant/withdrawal/erasure calls, no knowledge updates, no scanning and no provider calls.**

Sequence under the same signed-in test sessions:
- Verify signed-in user identity, verified JWT issuer/user/session, and distinct session IDs.
- Verify **neither newly minted session already has the KB consent owner/admin authority**.
- Bind each session using existing caller-bound membership-checking RPC (two staging tenant-session binding-row writes).
- Verify its own KB-06B actor authority; reject cross-tenant and anonymous access; verify prior KB-05D knowledge own/cross/anonymous 12 read-only checks.
- Sign out **each** newly issued session with `scope=local` even on intermediate failure; cleanup errors FAIL the whole run.
- Reuse the stale bearer tokens to verify KB-06B actor rejects both after Auth logout; do not print or persist the tokens.
- Result is **22 engineering checks** (12 knowledge, 10 consent authority including 2 pre-binding denials), **2 staging session-binding writes**, **2 Auth logins**, **2 local Auth logouts**, **0 consent or knowledge writes**. Reports `independentStagingAcceptanceVerified:false`, `authorizesCrawlOrRelease:false`.

**Session binding rows may remain in staging** after the corresponding test Auth sessions are signed out. The bound `session_id` should not authorize KB-06B once `auth.sessions` is removed, but the physical binding-row retention/cleanup policy is a **separate independent decision**. Do not claim the persistent rows were erased. Staging must have a policy for test rows, Auth JWT expiry and backup retention before enabling.

## Independent operator requirements — unresolved

- Create and pay for a separate isolated Supabase project only after explicit owner approval. Current connected inventory lists only Production and Recovery Rehearsal; neither can be used.
- Install KB draft migrations, seed only explicitly approved synthetic tenant A/B fixture data and eligible active memberships. Never use customer accounts.
- Configure GitHub's new protected environment with manual reviewers and restricted reviewed branches; set the two strong approval claims and exact SHA/project variables securely. A workflow self-check cannot prove that this protection was independently configured.
- Complete independent real Auth/tenant checks, consent lifecycle, owner policy notice review, quote/derived retention and actual deletion, audit/backup reconciliation, domain/SSRF/AI/provider scenarios and rollback.
- The **16 KB-04E independent acceptance cases remain 0/16 verified**, regardless of future output from this test runner.

## Automated verification and non-actions

Synthetic tests cover original read-only unchanged, independent operator/owner claims, no network before invalid preflight, two exact membership-scoped binding POSTs, unbound denial before writes, malformed/bad binding refusal, Auth logout on failures, and stale-token revocation. New static workflow checks confirm separate manual-only action and privileged write label.

No staging workflow was dispatched; no Supabase project created, SQL run, token issued, tenant session bound, live site visited or user data touched; no main merge or deployment. **DRAFT / DO NOT MERGE** pending independent staging and governance approval.
