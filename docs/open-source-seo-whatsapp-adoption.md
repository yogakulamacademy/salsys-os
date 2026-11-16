# SalsysOS: OpenSEO + DeskcommCRM adoption boundary (2026-11-16)

## Intent and decision

**Goal:** reuse `every-app/open-seo` for SEO research and `melgarafael/DeskcommCRM` for WhatsApp automation capabilities without destroying existing SalsysOS CRM history, attribution, messaging safeguards or multitenant permissions.

**Decision:** migrate by *capability* (strangler pattern), not by deleting an entire domain or copying a second CRM database into SalsysOS. Both upstream projects currently advertise MIT licenses. Preserve any upstream attribution and third-party notices when code is actually copied. Pin reviewed upstream commits and audit dependencies; the upstream app's license does **not** automatically license WAHA Plus or any third-party paid API.

- OpenSEO: a separate SEO application using DataForSEO; self-hosting is supported, but API credentials, hosting, authentication, and usage billing are separate from SalsysOS. Its workflows include keywords, rankings, competitors, backlinks, audits, and AI visibility.
- DeskcommCRM: Next.js + Supabase CRM with WhatsApp via WAHA/QR or Meta Cloud API, agent routing, RAG, event worker and handoff patterns. Its own CRM schema, tenant identities, session lifecycle and workers are not compatible drop-in replacements for SalsysOS.
- SalsysOS: already has GSC/SEO evidence, organic revenue and experiment records, WhatsApp official Cloud API integration, approved templates, sender readiness, consent suppression, rate controls and broadcast runner. These are production-sensitive dependencies. Keep them as the source of record until observed parity is demonstrated.

Upstream links: https://github.com/every-app/open-seo and https://github.com/melgarafael/DeskcommCRM

## Current change: operator pilot only (NOT end-to-end)

Files added in this branch implement a **read-only operator preview and explicit health diagnostics**. The preview is disabled by default. Owner/admin visitors can request credential-free GET health probes from SalsysOS to OpenSEO `/api/health` and DeskcommCRM `/api/v1/health`. Requests are time-bounded, do not follow redirects and expose only a coarse status. There is no data sync, SSO, credential sharing, business API client, webhook subscription, messaging send, workflow activation, or migration of tables. The existing SEO and WhatsApp pages and security boundaries remain preserved.

To preview independently deployed vendor applications, set in server environment:

```env
SALSYS_VENDOR_WORKSPACE_PREVIEW=true
SALSYS_OPENSEO_URL=https://seo.example.org
SALSYS_DESKCOMM_URL=https://messaging.example.org
```

Only owner/admin users see the pilot notice within the relevant existing workspace; managers retain current capabilities without access to these optional links. URLs must use HTTPS in production, with no embedded userinfo, query, or fragment. Non-production localhost HTTP is allowed for developer testing. Do not put API credentials in URLs. Users sign into vendor tools separately.

### First functional OpenSEO adapter (read-only)

Set these additional **server-only** variables after deploying OpenSEO and creating an API key in OpenSEO Settings:

```env
SALSYS_OPENSEO_SALSYS_ORG_ID=EXACT_SALSYS_TENANT_UUID
SALSYS_OPENSEO_API_KEY=oseo_YOUR_OPEN_SEO_API_KEY
```

The administrator opens `/seo/open-seo` to verify a real OpenSEO project inventory, then selects **View saved trackers** to see existing configuration records at `/seo/open-seo/rank-trackers`. The adapter sends authenticated `tools/call` JSON-RPC requests to `/mcp` for `list_projects` and, after checking that the selected project belongs to the mapped OpenSEO workspace, `get_rank_tracker`. Upstream documents both as zero-credit tools. The adapter refuses all outbound calls unless the current SalsysOS organization ID exactly equals `SALSYS_OPENSEO_SALSYS_ORG_ID`. This **intentionally supports one mapped tenant per deployment**; for true multitenant support, use separately encrypted per-tenant connector credentials with revocation and RLS, not a global shared API key.

The adapter accepts only bounded JSON or SSE replies and validated `structuredContent.projects` or `structuredContent.configs` arrays, and shows clear disconnected, unauthorized, malformed, and empty-project states. It never treats a health ping as proof of authenticated data access. It cannot write OpenSEO projects, trigger billable tools or rank checks, publish SEO changes, or update SalsysOS attribution. Tracker rows do not claim any search positions unless future verified snapshot evidence exists.

Run `npm run test:openseo-mcp-projects` for deterministic JSON/SSE parser tests. Also run `npm run verify:vendor-workspace-pilot`, `npm run typecheck` and the complete build.


**Important:** A configured link or positive upstream health response does not prove subscription, authorized business API access, provider eligibility, Meta approval, tenant mapping, data isolation, or delivery success. Open `/settings/vendor-workspaces` as an owner/admin for a live read-only health check. The new `/seo/open-seo` page uses OpenSEO's real zero-credit `list_projects` MCP tool but requires a fixed SalsysOS-tenant mapping and API key.

## Intended target architecture

```text
                              SalsysOS (canonical tenant, lead + history)
                                     |
            +------------------------+---------------------------+
            |                                                    |
   SEO read-only adapter                                Messaging capability adapter
            |                                                    |
 OpenSEO deployment + DataForSEO                       Selected Deskcomm components
 (external app + separate data)                        (ported behind native boundaries)
            |                                                    |
   rank/keyword/audit snapshots                         SalsysOS WhatsApp Cloud API
            |                                            consent / templates / sender
            +------ SalsysOS evidence & revenue                 |
                                                        Meta-signed inbound/outbound
```

**Do not deploy a second sending system against the same number** without an exclusive sender lease and provider-approved transition. For default production sending, use official Meta WhatsApp Business Platform, not WAHA QR/browser-session emulation. Do not treat throttling/jitter as a substitute for consent, channel authorization, 24-hour service-window and template rules.

### SEO data contract

| Capability | Upstream source | SalsysOS destination | Gate |
|---|---|---|---|
| Keyword volumes and trends | OpenSEO / DataForSEO | SEO research snapshot with source, location, language, time, cost and freshness | Explicit API budget; correct tenant/website |
| Rank tracking and SERP | OpenSEO | SEO query/page metrics annotated with provider and collection time | Reconcile to existing GSC data, never silently overwrite |
| Technical audit | OpenSEO crawler | Versioned findings, evidence URL and crawl timestamp | Crawl ownership and permissions, no auto publishing |
| Backlinks / competitor intelligence | OpenSEO | Research reports, not CRM leads | Provenance and historical retention |
| Organic revenue | Existing SalsysOS attribution | Existing conversion/lead records | Keep as canonical; avoid claims from rank data alone |

### WhatsApp data contract

| Capability | Chosen path | Gate |
|---|---|---|
| Official messages/webhooks | Existing SalsysOS Meta Cloud API | Signed webhook, tenant+phone mapping, exactly-once projection |
| Approved template workflows | Existing SalsysOS with selected Deskcomm patterns | Template approval at Meta, category/language, dynamic variables validated |
| Event queue, retries, dead letters | Port reviewed Deskcomm patterns behind SalsysOS interface | Idempotency keys, retry budget, no duplicate sends |
| AI suggestion, lead qualification | Port only after data boundary | Human approval, prompt-safety, clear AI provenance, no automatic send on first launch |
| Human handoff and assignment | Adapt to existing SalsysOS conversations/leads | RBAC, ownership locks, timestamps, audited transitions |
| STOP/opt-out, frequency limits | Existing SalsysOS policy | Consistently enforced by **every** sending route |
| WAHA QR/Plus | Not part of default migration | Separate legal, security, reliability and Meta-platform-policy review |

## Release gates (no destructive action before all pass)

1. **Discovery and ownership:** inventory live SEO and WhatsApp tables, cron runners, messaging settings, migrations, open PRs, and operational rollback owner. Take restorable backups.
2. **Vendor deployments:** isolate upstream applications in a staging environment; lock SHAs; install under dedicated HTTPS hostnames; configure DataForSEO and other vendor credentials separately. Record independent login and health tests.
3. **Adapter contracts:** design tenant-safe API boundaries, request authentication, data mappings, provider provenance, dedupe, quotas, and schema changes. Never share Supabase service-role keys between unrelated app deployments.
4. **SEO shadow mode:** import read-only sampled keyword/rank/audit results. Show source and freshness. Compare with existing GSC and organic revenue; no historical delete or dashboard overwrite.
5. **WhatsApp shadow mode:** consume signed sandbox webhook events, map identity to CRM, dedupe redelivery, and replay tests without any outbound message.
6. **Messaging canary:** with operator approval, a dedicated Meta test number, approved template, consent and STOP cases, exercise one send and one reply. Verify receipts, attribution, handoff, and rollback.
7. **Cutover:** only after parity, add a per-tenant switch; guarantee one active sender and one message projection owner; disable old cron paths; monitor reconciliation and rollback.
8. **Retire legacy surfaces:** archive migrations and remove replaced UI/code only after retention, exports, rollback window and test suite are signed off. Never drop live message or SEO evidence tables as part of a UI replacement.

### Non-negotiable acceptance criteria

- Existing lead/contact/conversation IDs, enrollment history, and web attribution remain valid, with preserved tenant isolation.
- Every inbound event is idempotent and attributed to one active tenant. Duplicate/out-of-order receipts do not create additional messages or side effects.
- A skipped, denied, or failed send produces no provider request. A successful send has exactly one audit trail and reconciled delivery status.
- Meta templates must be approved before outbound business-initiated messaging. STOP, quiet hours, per-lead limits, human-approval and WhatsApp policy gates remain effective.
- Neither new SEO nor WhatsApp path may claim verified measurements when credentials, audit data, receipts or provider connectivity are absent.
- Integration secrets stay server-side; tests include auth/RLS, malformed webhook signatures, cross-tenant data, and malicious URL inputs.
- CI typecheck and build, database migration rehearsal, staging end-to-end, and operator rollback evidence must pass before enabling production traffic.

## Why the upstream app cannot be copied wholesale

OpenSEO uses a separate Vite/Cloudflare-centric application and database/runtime model; SalsysOS is Next.js with Supabase. DeskcommCRM is itself a full Next.js/Supabase CRM with a different schema and security contract. Combining their entire app folders and migrations would collide on routes, auth, tenant IDs, background workers, and provider message ownership. Their README feature claims are useful for discovery, not proof of production readiness for this SalsysOS installation.

This branch intentionally makes **no claim** to complete the end-to-end migration. It creates a safe reviewable foundation for the next branch: first actual SEO data adapter, then messaging event adapter, with independent tests and credential provisioning.
