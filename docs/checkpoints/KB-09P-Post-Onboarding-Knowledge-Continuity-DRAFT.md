# KB-09P — Permanent Knowledge Builder after onboarding

**DRAFT / DO NOT MERGE / DO NOT DEPLOY / NOT A HOSTED MIGRATION**  
**Date:** 2026-11-08  
**Parent:** [KB-09O draft PR #656](https://github.com/yogakulamacademy/salsys-os/pull/656), exact unmerged SHA `caf878a5d903742b486388b976785db4edd015f4`.

## User requirement

The user explicitly requires Knowledge Builder to work **during onboarding and afterward as a permanent workspace**, without requiring the organization to repeat onboarding or losing previously approved knowledge.

## Existing implementation verified

- `/settings/knowledge` already serves a persistent tenant-scoped knowledge library with existing draft/review/approval/archival and retrieval preview workflows.
- `/settings/knowledge/discovery` already serves the website-discovery status, proof verification and controlled start/cancel interface, but originally lacked an after-onboarding website editing path and inherited a broader Settings route guard than its owner/admin API would accept.
- The onboarding screen redirects a completed organization to `/onboarding/finish?completed=1`; **do not rely on reopening onboarding to change website sources**.
- The discovery pilot and its consent-grant operations remain **OFF by default**, with unmerged, disposable-only KB-09F–N SQL and independently blocked release. The existing discovery UI does NOT publish knowledge automatically.

## Draft-only integration changes

1. `app/settings/knowledge/discovery/page.tsx` requires **owner/admin workspace access** and keys the client-side component by the **active tenant organization ID** to reset previous tenant UI state upon workspace switches. It renders only fixed error codes, **never a success claim from a GET query**; a successful update is confirmed only when the signed-in database read returns the newly configured website.
2. A new **owner/admin signed-session server action** `saveKnowledgeWebsiteAction` updates only `organization_onboarding.website_url` through the existing signed Supabase client and RLS. It checks active organization match and `can_manage_organization`, validates a public standard-port HTTPS **root** domain, limits inputs to 240 characters, and uses optimistic compare-and-set on the exact prior website value. It rejects stale admin updates and denies changes if either discovery or consent-grant pilot is configured, **even if emergency-paused**. It does not call service-role clients, create/alter proof or consent, enqueue a scan, update the knowledge library or change onboarding status/completed steps.
3. The permanent discovery screen now includes a website editor when permitted, with an explicit notice that any changed hostname requires **new ownership verification and separately approved, purpose-limited consent**. Prior knowledge and audit records are retained; the old hostname's proof/consent records cannot authorize the new configured hostname under the existing host-bound DB checks.
4. Completed onboarding has a direct **Manage Knowledge Builder** link; Settings has an owner/admin Knowledge Builder shortcut. The existing permanent knowledge library and retrieval/approval code are not altered.
5. Discovery page links are rendered clickable **only for HTTPS URLs on the exact configured hostname and standard port**; malformed, unsafe and off-origin records are safely marked unavailable instead of being executed or crashing a React render.

## Security and functional acceptance

`tests/knowledge-discovery/post-onboarding-workspace.test.mjs` runs in existing zero-cost CI and tests:
- Save as owner after completed onboarding, keeping `status='completed'`, goals, `completed_steps`, current knowledge and proof/consent/jobs untouched.
- Save during onboarding without advancing stages.
- No write for anonymous, manager/admissions, other-tenant, or failed `can_manage_organization` checks.
- Reject private, non-public, non-HTTPS, credentialed, non-standard-port and subpath URLs before any DB write.
- Reject when pilot or consent-grant features are configured.
- Stale-page admin race and missing table UPDATE permission fail closed; null original website compare-and-set and unchanged URL remain safe.
- No GET success-query value exists; a caller cannot forge a saved-site banner. Only actual persisted website reads establish the current configuration.
- Persistent navigation links during/after onboarding and safe, exact-host clickable page URL logic.

**Important:** The tests use a mocked Supabase client; they do **NOT** establish real Supabase Auth/RLS, function grants, actual production onboarding row ownership, legal consent, real website verification or staging acceptance.

## Remaining release blockers

- **#601:** independent real isolated staging acceptance still **0/16**. The post-onboarding scenario must be included in the independent acceptance evidence plan as an **additional product requirement**; do not silently count a synthetic mock as any of the 16 approved cases.
- **#612:** real owner/admin sessions, tenant switching, service-key controls and independently enforced GitHub review protection.
- **#613:** exact legal approval for website discovery, purpose-limited consent, retention/withdrawal and twelve table + five processor life cycles.
- **#614:** dedicated isolated staging after the business earns revenue **and a separate fresh explicit cost approval**. Production or Recovery cannot serve as staging.
- A separate independently reviewed versioned migration, rollback, proof validity at physical outer COMMIT decision and actual tenant A/B / post-onboarding acceptance remain outstanding.

**NON-ACTIONS:** No hosted Supabase Production/Recovery/staging SQL or data access, customer information, real site crawling, model calls, legal policy/consent grants, new paid resources, GitHub protection changes, `main` merge or deployment. This document and these source changes are **draft-only** until the release gate is independently closed.
