# SalsysOS — UI Priority and Paused Engineering Handoff (3 November 2026)

**Status:** Active workstream changed by the user to **UI/UX**. AI/commerce work is **paused, not abandoned or completed**.  
**Repo:** `yogakulamacademy/salsys-os`  
**Verified baseline main:** `57c2abf8638cf4bc08773e25c2d435e4c1387de5` (merge PR #452).  
**Production:** Vercel deployment `dpl_DyWEmbkoMKhVejaCPvkdKsByy9v4` was **READY** on this exact SHA, with production aliases. Production Smoke and CodeQL on that SHA passed. At the last status inspection, post-merge CI was still running; branch-head CI #1678, Migration Replay #187 and CodeQL #963 had passed. Do not treat the post-merge CI as passed without a fresh read.
**Database:** SalsysOS Production Supabase `doaozrkrtgeslddwhclj` (not the separate Recovery Rehearsal project).  
**Type:** Documentation-only handoff. This entry authorizes no migrations, data edits, provider sends, AI activation, production change, or merge of unrelated PRs.

## 1. The active task RIGHT NOW — UI/UX

1. **Start with UI/UX discussion and an agreed screen-level design plan before code.** The user prefers simple, minimal, smart, meaningful, focused product interfaces; no yoga/tenant branding for the SalsysOS product UI. Use the existing neutral/violet / restrained indigo design direction, preserving the SalsysOS identity.
2. Read `docs/UI-CONSISTENCY.md`, `docs/SMART-JOURNEY-WORKSPACE.md`, `docs/JOURNEY-EVIDENCE-CHECKPOINT.md`, and the current screen/source. Preserve existing information architecture, access control, privacy, live CRM semantics and user workflows. Never turn an empty state into misleading zero KPI cards.
3. **UI PR #437 is merged** ("Unify SalsysOS UI and repair Inbox and data presentation"). **UI/Journey PR #438 is merged** ("Add dynamic enquiry Journey workspace and consistent empty states"). These are already on `main` and should **not** be reimplemented from their old draft branches.
4. The user has not specified the next individual screen in this handoff. On a new UI task, use the actual selected screen/reference and discuss the proposed visualization before implementation; do not infer which destination to redesign.
5. UI acceptance: compare with current `main`, inspect at mobile/tablet/desktop, verify empty/error/loading/restricted states and keyboard behavior, run appropriate UI/unit/typecheck/build tests, preserve other developers' branches, then only merge an approved, validated change.

**Routing rule:** A generic "continue UI" means UI work. A specific "resume AI/Sales Asset/commerce" reactivates the corresponding paused checkpoint below, not the whole backlog at once.

## 2. Exact paused Sales Asset + WhatsApp checkpoint

The following milestones are **merged**: #448 Sales Asset Library foundation, #449 scoped Co-Pilot asset discovery, #450 human asset preflight, #451 human-selected WhatsApp image/PDF sending, **#452** language context propagation and deterministic YTT course-scope comparison.

**#452 merge:** `57c2abf8638cf4bc08773e25c2d435e4c1387de5`. The patch passes the lead's actual language to Co-Pilot asset search and human preflight; the dispatch path already rechecks context. Deterministic course key normalization accepts clearly equivalent `200 hour ytt`, `200H-YTT`, `200-Hour Yoga Teacher Training`, and narrow `200h` / `300h` / `500h` aliases, without fuzzy matching or broadening unrelated courses. Tenant, approval, rights, revocation, validity, channel, language, location, course and private-storage guards remain fail-closed.

**Production state observed:** `sales_assets` exists; the approved, rights-cleared JPEG asset **"200H Mysore"** is scoped to 200-hour YTT / Mysore / English / WhatsApp and Instagram. No real send was completed in the checked audit state. The previously configured pilot lead had its last inbound on 19 October, so its WhatsApp 24-hour free-form window was closed, and required course/location/language context was incomplete. Re-read current data before acting.

**Two additive migrations are committed on main but NOT applied to production:**
- `20261103215230_sales_asset_course_scope_normalization_v1.sql`
- `20261103215330_sales_asset_course_scope_shorthand_v1.sql`

The production migration ledger was checked on 3 November: latest applied Sales Asset migration was `20261103213500_whatsapp_sales_asset_human_media_send_v1`; the course-key function `public.sales_asset_course_scope_key_v1(text)` was absent. Clean Migration Replay #187 passed against #452, but production has older exact-text course matching until migrations are applied.

**Resume in order — only when explicitly requested:**
1. Verify current `main`, PR/deployment/smoke status, target production project and exact migration ledger. Review both SQL files and security/execute grants.
2. Obtain specific production-write approval before applying the two migrations. Apply only missing verified migrations, in order. Read back both versions, key behavior, all three resolver paths, grants, and no asset-row rewrites.
3. Recheck approved asset/rights/validity/storage and select a genuinely authorized, correctly scoped WhatsApp pilot with explicit permission, real course/location/language context and a **fresh inbound** inside the supported service window. Do not fabricate a lead field or bypass channel eligibility.
4. Have a human select/preflight/send the asset **once**. Verify provider message ID, canonical CRM message, audit/event record, delivery reconciliation and idempotency; inspect failure/unknown-outcome handling. No autonomous sending is enabled by this test.
5. Record results and any remaining blockers in the canonical checkpoint before moving on.

## 3. Paused priority backlog, after the UI workstream

**P0 — acceptance and production integrity**
1. Finish the two Sales Asset production migrations and real WhatsApp human media send test above.
2. Full real GT-01: complete verified Hostinger/PayPal/ICICI/Direct UPI success handlers as separately approved, external `/api/events/v1` + Queue path, one genuine `payment.completed` / `enrollment.completed`, provider evidence, Person 360, Funnel, Revenue and System Health reconciliation. **Do not confuse this with the PASSED internal rollback-only production-schema GT-01** recorded in `docs/checkpoints/M-2026-11-03-GT01-Internal-Production-Schema-Acceptance-v1.md`.
3. Two existing human-review Customer 360 identity conflicts remain; no automatic identity merge.

**P1 — AI Knowledge + common WhatsApp/Instagram Conversation Agent**
4. Build owner-approved current tenant knowledge/FAQs and reusable scoped assets (eligibility, dates/prices only from structured CRM, certification, travel, payment process, refunds, postponements, policy exceptions) with version/approval/rights/revocation evidence.
5. Implement guarded server-owned agent action policy on the existing Co-Pilot/automation system: automatically perform **permitted routine** FAQ/asset/follow-up actions only after opt-in controlled activation; escalate discounts, refunds, medical/legal/uncertain claims and financial commitments. Canonical stage change and payment truth remain authoritative, with snapshot-based approvals.
6. Implement shared agent orchestration and **separately verified** WhatsApp / Instagram channel adapters: windows/templates/permissions, opt-out/suppression, rate and quiet-hour caps, human takeover, stop-on-reply/races, kill switch, idempotency, unknown-outcome reconciliation, operator audit.
7. Pass `AIK-01` through `AIK-15` acceptance in `docs/AI-KNOWLEDGE-AGENT-WORKFLOW.md` before any production autonomous pilot. Capture observed asset/provider events truthfully (recommended/sent/delivered/click/view are different).

**P1/P2 — Journey, provider coverage and product adoption**
8. Complete live journey/role/privacy proof, purpose permissions, trusted financial/identity lineage, data freshness and asset engagement integration. Synthetic Journey presentation test is **not** equivalent to full GT-01.
9. Provider-side blockers: Google Ads non-test production API approval; Meta Ads permission/account selection; SEO crawl queue/incomplete crawl coverage; Search Indexing activation is parked.
10. Review responsive/product UI operational acceptance on real roles, then prove safe reusable second-tenant onboarding and operational release/observability/support readiness. Do not seed fabricated second-tenant course data.

**P1 — R13 commercial SaaS implementation (separate from student payments)**
11. **R13 audit/design complete, P0 implementation not complete.** Add a provider-neutral logical plan catalog, plan/capability entitlements, organization subscription state, append-only subscription ledger and diagnostic readiness/drift view (no invented prices or tenant backfill).
12. P1 entitlement governance/admin; P2 verified self-serve trial/signup and abuse controls; P3 independently verified SaaS billing provider/webhooks/invoices; P4 grace/cancellation/recovery/export/retention/offboarding. Never reuse `public.payments` as SaaS subscription truth. See `docs/checkpoints/M-2026-11-02-R13-Commercial-SaaS-Audit-Design-v1.md`.

**Future North-Star**
13. Outcome-supported predictive-model calibration/ranking (no claimed learned performance without real outcomes), integration packaging, R12 Realty vertical and R14 launch/first-100-customer GTM. R11 accommodation/physical room and bed operations were **retired from product scope**, not left unfinished.

## 4. Percentages — non-authoritative planning bands

- Internal CRM / Yogakulam operating product: **~98–99%** of prior internal V1 closeout scope.
- Critical V1 release checklist: **~92–93%** complete / **~7–8%** remaining by prior planning estimate, **not** hours or an objective acceptance score.
- Full autonomous AI sales operation: **~35–40%** complete, meaning a substantial new action-policy/rollout layer remains, despite strong Co-Pilot/asset foundations.
- R13 SaaS commercial implementation: **~25–30%** inclusive of audit/design/reused onboarding foundations, with most new plan/billing/subscription work remaining.
- Complete R0–R14 North-Star: older baseline **~77%** complete / **~23%** remaining; not a refreshed measurement. These are **different denominators** and must not be averaged.

Do not call live/provider-gated work complete based only on merged code, mock CI, UI renders or internal rollback-only fixtures.

## 5. Resumption protocol

When asked **"Continue SalsysOS UI"**: inspect latest main and UI docs; discuss only the user's selected screen, design and behavior; then implement only after agreement.

When asked **"Resume the paused SalsysOS work"**: read this handoff, `docs/SalsysOS_Current_Checkpoint.md`, `docs/SalsysOS_Active_Handoff.md`, `docs/SalsysOS_Next_Workflow.md`, `docs/AI-KNOWLEDGE-AGENT-WORKFLOW.md`, and R13/GT-01 checkpoint evidence. Re-verify live GitHub/Vercel/Supabase facts (never assume this snapshot remains current). Start at the smallest outstanding Sales Asset deployment/acceptance checkpoint unless user names a different workstream. Production writes, external provider sends, autonomous activation, financial/identity decisions and merges require the applicable explicit authorization.

Maintain one checkpoint at a time. Keep unrelated PRs and other developers' branches untouched. Record completed evidence and blockers before advancing.
