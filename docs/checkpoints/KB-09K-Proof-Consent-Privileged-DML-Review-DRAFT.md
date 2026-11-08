# KB-09K — Domain proof and consent privileged DML closure

**DRAFT / NEVER DEPLOY / RANDOM DISPOSABLE LOOPBACK POSTGRES ONLY**  
**Date:** 2026-11-08  
**Parent:** [KB-09J draft PR #647](https://github.com/yogakulamacademy/salsys-os/pull/647) exact HEAD `9d93fe9154309fa03c68ed6cfb7ecbc520b8bb39`.

## Findings in the current draft stack

The remaining broad direct `service_role` `GRANT ALL` permissions extend beyond KB-09J discovery job/page INSERT:

- `knowledge_discovery_domain_verifications`: service-role **direct UPDATE** after external website-proof fetch in `app/api/knowledge/discovery/verification/route.ts`; original `issue_knowledge_discovery_domain_challenge_v1` and `claim_knowledge_discovery_proof_check_v1` also depended on service-owned direct table privileges and accepted caller-supplied org/creator.
- `knowledge_discovery_site_consents`: service-role direct DML could bypass KB-06B's audited, session-bound consent-grant and withdrawal RPCs.
- `knowledge_discovery_consent_control`: service-role DML could switch on the approved-policy grant registry without independent legal/operator controls.
- `knowledge_discovery_consent_audit`: service-role INSERT/TRUNCATE/trigger grants could allow forged audit events or bypass append-only row triggers. The separate KB-07D TRUNCATE trigger remains unapplied and needs proper sequencing.

**A service-role key is privileged and a leaked key remains a threat even with narrowed RPCs.** Direct privilege reduction reduces bypass surface; it is not proof of service-key security, real Auth legitimacy or actual legal consent.

## Prototype-only solution

`docs/sql/KB-09K-proof-consent-direct-DML-boundary-REHEARSAL-DRAFT.sql` is guarded to the randomly named, automatically dropped `salsys_kb09f_<18 hex>` local synthetic fixture. It is **not a migration**, and its `REVOKE` statements **must never** be applied to live projects or developer databases.

1. An authenticated, session-bound tenant owner/admin requests a challenge via `issue_knowledge_discovery_challenge_for_admin_v1`; the DB obtains `created_by` from the KB-06B actor helper, verifies current configured HTTPS hostname, enforces the existing 5-minute cooldown/24-hour token and resets proof through a narrowly scoped owner-owned transaction. No forged user/session argument.
2. The same bound admin invokes `claim_knowledge_discovery_proof_check_for_admin_v1`; the DB checks exact current tenant/hostname/challenge digest, stored expiry, 30-second check cooldown and website configuration.
3. Only the server handler, **after** the robots-safe public website file is fetched and matched, invokes `confirm_checked_knowledge_discovery_proof_v1` through the service client. That CAS requires exact tenant/hostname/digest and a recent claim, issues a fixed DB-derived 30-day proof expiry, and refuses replay. No caller-supplied verification timestamp or expiry. The DB **cannot independently attest** the network result: trusted server handler and service-role key safety are mandatory.
4. Three PUBLIC-schema `SECURITY INVOKER` wrappers expose only minimal `EXECUTE` grants; their private `SECURITY DEFINER` functions perform the checks. Legacy proof-write functions lose service-role EXECUTE permission in this fixture, and proof authenticated read policy is upgraded from broad `can_manage_organization` to the KB-06B strict tenant-session check.
5. In the disposable fixture only, direct `INSERT/UPDATE/DELETE/TRUNCATE/TRIGGER/REFERENCES` permissions are revoked from public/anon/authenticated/service_role for proof, site consents, consent-control and consent-audit tables. Existing owner-owned authenticated consent withdrawal remains functional. Service/worker SELECT needed for current checks is retained.

The verification route retains its existing pilot-off, allowlist, origin, robots and proof-file validation and HTTP response contracts. It now validates the strict active Auth session before privileged proof reads, issues and claims with the signed-in user's Supabase client, revalidates the session after external fetch, and calls the bounded service-only confirmation RPC **without direct privileged UPDATE fallback**.

## Synthetic verification scope

The extended auto-dropped PostgreSQL suite exercises direct DML and BYPASSRLS-role privileges, exposed and retired RPC grants, session/tenant denial, configured-host mismatch, SHA-256 digest validation, 5-minute challenge cooldown, 30-second claim cooldown, two-session proof-row CAS race, replay denial, consent-withdrawal audit preservation, strict proof SELECT RLS and an **intentional failing timing test** where the outer transaction commits after expiry. API route unit mocks exercise forbidden calls, missing RPC, strict session denial and the existing fetch-before-confirm sequence.

**Never claim:** proof is valid at actual external transaction COMMIT, a service role can never forge a confirmation, real signed Supabase Auth session was observed, production permissions were tightened, legal consent/policy approved, third-party website actually owned, or tenant A/B independently verified. The SQL is still unreviewed synthetic test infrastructure.

## Residual blockers and sequencing

- **Do not apply these REVOKEs or merge the application route.** An independently reviewed, versioned migration/rollback must deploy all replacement RPCs, verify exact PostgreSQL owners/EXECUTE, protect service-key exposures, inspect every other proof/consent writer, and test the post-cutover route against real signed Supabase Auth. Deploying only the route without RPCs fails closed.
- **New issue: operator policy registry.** Removing service-role write access to `knowledge_discovery_consent_control` means future approved policy registration must use a separately audited, out-of-band DBA/operator process, not an unrestricted service key. No approval is implied by the current synthetic registry.
- The **external COMMIT boundary** remains unresolved. A proof or challenge may be valid when the function returns but expire before caller commits a deliberately held transaction. Locking rows does not guarantee commit-time validity. This requires explicit independent security policy decision and transactional acceptance test.
- All original proof/consent read paths, historic metadata-erasure/audit/control tables, role inheritance (including BYPASSRLS), service-only worker claim/commit, real consent-withdrawal races, audit-retention/erasure and protected staging grants need further review.
- Release gate [#601](https://github.com/yogakulamacademy/salsys-os/issues/601) is still **OPEN/BLOCKED, 0/16 independently witnessed real staging cases**; [#612](https://github.com/yogakulamacademy/salsys-os/issues/612) security reviewer, [#613](https://github.com/yogakulamacademy/salsys-os/issues/613) privacy/legal/DBA and [#614](https://github.com/yogakulamacademy/salsys-os/issues/614) staging/budget remain open. Owner explicitly defers **new paid staging until SalsysOS has revenue**, and a fresh explicit owner cost approval is still required afterward.

**Non-actions:** No hosted Production/Recovery/staging SQL, real user Auth, live website fetch/crawl, customer data, consent grant, model provider call, new paid resource, GitHub protection changes, `main` merge, or deployment.
