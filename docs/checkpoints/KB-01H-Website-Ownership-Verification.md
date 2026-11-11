# KB-01H — Website Ownership Verification Gate (DRAFT)

**Date:** November 6, 2026  
**Repository:** yogakulamacademy/salsys-os  
**Branch:** feature/kb01-public-website-scope  
**Pull request:** #538 (draft; unmerged)  

## Implementation

This checkpoint adds a requirement that the website's configured, exact **HTTPS hostname** must be verified before its pages are scanned.

An authenticated organization owner/admin can request a challenge via `POST /api/knowledge/discovery/verification`. The server generates a cryptographically random 32-byte token and stores only its SHA-256 digest, the configured hostname, its organization ID, issuing user, issue timestamp and 24-hour expiry. The plaintext token is returned **once**, for placement in the public text file:

`https://<configured-website-hostname>/.well-known/salsysos-verification.txt`

The owner/admin can press **Verify website** (`PUT /api/knowledge/discovery/verification`). The server reads `robots.txt`, then fetches the exact proof file via the existing public-IP-validated, socket-pinned HTTPS transport. Proof requests are capped at **4 KiB**, must return **HTTP 200 text/plain**, and **never follow redirects**. It compares the published token's digest in constant time, against the currently issued hash and unexpired challenge, and updates `verified_at` and `verified_until` (30-day proof lifetime). GET provides the admin-only status without returning the token or hash.

The ordinary discovery POST checks the tenant's current proof status before queuing. The scheduled worker rechecks it **every tick before any outbound network activity**, so expired or revoked proof cannot authorize subsequent page fetches. Existing server-side pilot enablement, exact-host allowlist and emergency pause remain mandatory. This is an additive security gate; it never initiates AI knowledge publication.

## Exact-host boundary

The earlier `apex/www` convenience behavior was removed for the pilot: proving `example.com` must not authorize `www.example.com` and vice versa. The discovery scope now requires the exact configured hostname, and the URL/HTML/sitemap/redirect unit tests were updated accordingly. A future version may support multiple separately verified hostnames.

## Schema

The **unapplied** `docs/sql/KB-01B-discovery-schema-DRAFT.sql` now proposes `knowledge_discovery_domain_verifications` with organization-scoped unique hostname, challenge hash and lifecycle timestamps, tenant-admin SELECT RLS, no authenticated role writes, and service-role-only mutation. The draft still requires official Supabase CLI migration generation and isolated staging rehearsal before deployment.

## Tests

- Token entropy, one-time token/hash comparison, exact hostname separation and 30-day expiry.
- Verification route: owner/admin and same-origin, missing/expired challenge, failure on mismatched published proof, successful synthetic file proof and no plaintext token storage.
- Scan start rejects missing verification; queued worker refuses expired verification.
- Browser test: generate and display token, simulate successful verification, unlock scan action.
- Disposable PostgreSQL RLS tests: only the current organization's admin can see its proof; authenticated/anonymous roles cannot write the table.
- Proof transport refuses redirects and HTML responses.
- Existing security, tenancy, rate, robots, cancellation, and synthetic discovery tests still run in CI.

**Validation status:** Check the exact current branch head's GitHub CI and CodeQL results; earlier failures on intermediate commits were due to a malformed SQL draft and a JSX typo, both corrected before this checkpoint. Do not claim full green until latest-head CI completes.

## Release blockers

1. Generate official versioned Supabase migration using the Supabase CLI in a checkout; the current schema is a DRAFT, not deployed.
2. Rehearse schema and full Next.js route-to-PostgREST authentication against a dedicated staging project; never use Production or Recovery Rehearsal for the pilot.
3. Validate genuine pinned TLS connections, `robots.txt`, redirects, proof-file 200/missing/mismatched responses, expiry/renewal, website ownership and tenant isolation using a controlled public staging hostname.
4. Review rate limits on repeated challenge issuance and proof checks, and add adequate monitoring/alerting.
5. Reconcile newer `main` without overwriting parallel developer work (including CI workflow edits).
6. Separate explicit approval for merge, production migration, crawler activation or real customer scans.

## Production

No migration applied, no real ownership token issued, no website crawled, no scheduler activated, no AI knowledge created or published, no automatic customer message, and no changes to `main`.
