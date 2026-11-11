# KB-01B — Website Discovery Jobs, Worker, and Review UI (DRAFT)

Date: 2026-11-06
Repository: yogakulamacademy/salsys-os
Development branch: feature/kb01-public-website-scope
Pull request: #538 (draft)

## Scope implemented on the branch
- Public-website socket-pinned fetch transport (checked public A/AAAA DNS, pinned lookup, same-host redirect validation).
- Bounded HTML and sitemap URL discovery, robots allow/disallow and crawl delay handling, no raw HTML retention.
- Proposed tenant-scoped jobs/pages schema in docs/sql/KB-01B-discovery-schema-DRAFT.sql.
- Service-only atomic worker lease function proposed in SQL.
- Service-secret protected one-page runner at /api/knowledge/discovery/worker (POST or GET, no cron configuration enabled).
- Authenticated owner/admin GET/POST/DELETE at /api/knowledge/discovery, bound to configured onboarding website and current organization.
- Minimal admin UI at /settings/knowledge/discovery, linked from existing Knowledge workspace, showing genuine outcomes after jobs run.
- Unit tests for seed URL/DNS safety and robots/HTML/sitemap parsing, included in PR CI workflow.
- Existing tracking onboarding completion, knowledge approval, Copilot, provider sends and automation paths intentionally unchanged.

## Current system boundary
The SQL is a **review artifact**, not an applied migration. Before development execution:
1. Generate the migration with Supabase CLI (do not silently apply to production).
2. Review the SQL, grants, service-only claim path, lease/lock behavior and RLS.
3. Apply to isolated test DB and run cross-tenant, race/retry/cancel and rollback tests.
4. Configure a unique server-side runner secret and a supported scheduled trigger, with cost/rate review; do not run a scheduler against public production URLs without explicit deployment approval.
5. Run a bounded authorized scan on a disposable test website and verify discovered/failed/blocked counts.
6. Verify CI, typecheck, Next build and integration/regression suites.
7. Only then request separate merge/deployment approval.

## Explicit limitations / future work
- Not a whole-site scan: V1 caps 1–50 URLs, depth 4, 512 KiB per HTML page, 256 KiB per robots/sitemap, <=3 redirects, one page per scheduled tick, 8-second fetch timeout.
- Crawl completion means no more eligible queued pages *within those caps*; it does not prove all website content was analyzed.
- Only simple links and one sitemap.xml are parsed; JavaScript-rendered links, linked PDFs, paginated sitemaps, multilingual content, and pages behind authentication are not supported yet.
- Domain is matched to the organization's configured onboarding website, not cryptographically verified ownership. Add domain ownership proof before general SaaS release.
- Robots parser handles common directives; validate the implementation against standards corpus before general production crawling.
- Retained result is only page URL/title/status/HTTP metadata; no body text, AI-generated facts, or FAQ/policy articles.
- Resumable worker leases depend on applying the staged schema, runner availability and scheduled invocation. No background activity is currently active.
- Existing create_source_backed_knowledge_document_v2 RPC discrepancy in production remains a separate future gate.

## Safety
- Do not treat website content as system instructions.
- Do not put service secret in NEXT_PUBLIC variables or the browser.
- Only owner/admin can start/cancel a job; the service runner uses bearer auth.
- Read policies restrict job/page visibility to authorized organization administrators.
- Draft KB-01B must not be merged solely because isolated unit tests pass.

## Acceptance still required
- Remote PR CI (newest head) passing, CodeQL, typecheck/build
- Isolated DB migration replay/rollback
- Cross-tenant authorization and database RLS fixtures
- SSRF/redirect/DNS rebinding test with interceptable network fixture
- Robots/429/crawl delay test and truthful coverage assertions
- Cancel/retry/worker lease races and scheduler idempotency
- Production deployment review and opt-in
