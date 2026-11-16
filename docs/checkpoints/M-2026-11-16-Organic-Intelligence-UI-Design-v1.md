# SalsysOS Organic Intelligence UI — design implementation checkpoint

Date: 2026-11-16
State: Feature branch for design review; no production merge or tool activation.

## Sources and interface direction

User-shared source: https://github.com/every-app/open-seo (MIT, copyright 2026 Ben Senescu).
Reviewed its README, Sidebar, PageHeader, ResearchPageShell and AI-search discovery patterns.

Adapted the high-level navigation and research workflow ideas, NOT the upstream
TanStack Router / Vite / Cloudflare runtime or source components. This is a
native Next.js server-rendered SalsysOS page using existing visual theme tokens,
SEO data sources, auth guards and marketing navigation. No third-party UI
dependencies or paid DataForSEO calls were added.

Other skill source: https://github.com/Ryze-AI-Adgent/open-seo-mcp-skills
inspired the existing backend PR #719's read-only content-brief and SEO-vs-Ads
tool schemas, but this UI does not call that disabled backend.

## Implemented

- New route: /seo/intelligence
- Discoverable in the existing Growth side navigation and /seo overview.
- Responsive neutral/violet dashboard with Search Console KPIs, recent observed
  click trend, keyword/content/answer evidence explorer, and four working
  server navigation filter links (?focus=search/content/answers/all).
- AEO/GEO panel explicitly differentiates observed GA4 AI referrals from
  unmeasured AI citations.
- Workflow preview cards: Content Brief (review existing evidence) and
  SEO vs Ads (link to integration readiness, no AI execution).
- Native navigation to existing dedicated SEO, technical, OpenSEO and AEO pages.
- Owner/admin gating for OpenSEO links. Managers can use the evidence UI but
  are not offered restricted OpenSEO project routes.
- PII-like search query strings are omitted using the existing backend data
  minimization helper. Missing numeric values render as unavailable rather
  than invented zeros.
- Added source-contract tests in the existing readiness suite.

## Explicit limitations

- This is a working read-only *navigation and evidence* UI, not a connected
  AI content editor, paid SEO provider adapter, or autonomous research agent.
- The existing Claude skills and API mediation gate remain disabled, with no
  new API route, model invocation, provider credential or billing.
- Search Console evidence is whatever the currently authorized SalsysOS
  workspace returns. Aggregates may have known sample/coverage limits.
- GSC query views, AEO demand models and GA4 AI referral metrics are distinct
  sources, never falsely presented as equal or proof of AI answer inclusion.
- OpenSEO /seo/open-seo uses the already existing owner/admin-only, fixed
  tenant-mapped project inventory adapter. The new UI does not make it live.
- No changes to R2 staging hold, WhatsApp, ads campaigns, database schemas,
  permissions, Google Ads API access or production flags.

## Acceptance gates

- [ ] Run npm run typecheck, npm run test:readiness, npm run build, CodeQL.
- [ ] Inspect the responsive page in authorized PR preview (including mobile).
- [ ] Check owner/admin vs manager views and signed-in tenant evidence.
- [ ] Obtain independent design/security review.
- [ ] Decide whether to make this the canonical /seo landing page after review.
- [ ] Separately authorize any future Claude execution or external research.

Do not merge or enable AI skills solely because this interface renders.
