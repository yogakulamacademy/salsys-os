# SalsysOS KB-01A — Public Website Scope Foundation

Date: 2026-11-06
Repository: yogakulamacademy/salsys-os
Branch: feature/kb01-public-website-scope
Status: Isolated branch work; not merged or deployed.

## Implemented
- Added a public HTTP(S) website URL parser with normalized canonical seeds.
- Refuses credentials, nonstandard ports, IP-literal hosts, single-label/internal/reserved hostnames, control characters and dangerous URI schemes.
- Refuses private/reserved IPv4, IPv4-mapped IPv6, IPv6 local/link/documentation/transition address ranges.
- Resolves all A/AAAA DNS responses and refuses a hostname if any resolved address is unsafe (including mixed public and private replies).
- Scopes discovered links to the selected exact/www host pair, strips query/fragment and rejects HTTPS-to-HTTP downgrades, offsite domains and unsupported schemes.
- Added five deterministic unit tests with a fake DNS resolver. All five passed locally with Node 22.16.0.

## Test command
node --experimental-strip-types --test tests/knowledge-discovery/url-policy.test.mjs

These are unit tests only. No live network crawl, endpoint, database write, browser test or production deployment has occurred.

## Critical security boundary
DNS preflight alone is not sufficient for a fetcher. The future HTTP transport must pin the vetted DNS address at the actual socket connection, validate every redirect/hop, prevent DNS rebinding escapes, and recheck site scope. Do not use unguarded global fetch() for user-supplied URLs.

## Remaining KB-01 work before customer use
1. Design tenant-scoped discovery job/page ledger and migrations with admin-only start/cancel/monitor, limits and RLS.
2. Implement a bounded queued worker with pinned network requests, site scope, robots compliance, MIME/body limits, timeout/retry, sitemap and HTML link extraction, rate/depth caps.
3. Produce truthful coverage counts and blocked/failed/duplicate page results.
4. Add an admin-only Discovery screen without disturbing optional website tracking onboarding.
5. Test SSRF/redirect/DNS rebind with deterministic fixtures, unauthorized tenants, quotas, cancellation, job idempotency and partial failures.
6. Verify regression, typecheck and build on the branch before a merge proposal.

## Source-backed function mismatch
The function create_source_backed_knowledge_document_v2 exists in repository migration 20261103190000_ai_knowledge_provenance_readiness_v2.sql but was absent from the production function catalog during the 2026-11-06 read-only audit. Do not rely on it until the migration ledger and deployment are reconciled.

## Explicit exclusions
No knowledge sources/documents/chunks/approvals inserted. No provider sends or automations enabled. No production migration, deployment or merge.
