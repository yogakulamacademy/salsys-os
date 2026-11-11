# SalsysOS R14 — Four-Tier Public Pricing Page (Review Candidate)

**Prepared:** 2026-11-11  
**Status:** Design and offer direction approved for draft work; exact customer-facing limits, legal terms, support and production release remain **UNAPPROVED**. No public pricing is currently published by this change.
**R13 configuration source:** `docs/commercial/r13-p1-pricing-proposal-v1.json` in a separate R13-P1 draft branch (NOT `main`). That file is proposal-only, not a billing source or runtime entitlement authority.

## Commercial direction

Four **proposed** monthly workspace prices, charged per business (not per person), excluding applicable taxes and external Meta/WhatsApp/Ads service fees:

| Package | Monthly fee | Managed one-time setup | Provisional user/lead limits | Main purpose |
| --- | ---: | ---: | --- | --- |
| Free — Starter Workspace | ₹0 | **Optional** ₹2,999–₹4,999 | 1 user / 250 lead records | Try core CRM without mandatory payment |
| Basic — Lead Management | ₹1,499 | ₹4,999–₹7,999 | 2 users / 2,000 leads | Stop missed follow-ups |
| Growth — Marketing Intelligence | **₹3,499** | ₹9,999–₹14,999 | 5 users / 10,000 leads | See lead quality and campaign sources |
| Pro — Business Intelligence Suite | ₹6,999 | ₹19,999–₹34,999 | 10 users / 50,000 leads | Connect authorized business and marketing evidence |

**Growth is the visually featured plan, not a claim it is universally best.** The user/record limits are **proposed**, pending engineering cost modeling, storage/retention policy and commercially authorized enforcement. Do not delete customer data on downgrade. No unlimited messaging, provider usage or customer data is included by implication.

**Important correction to prior draft:** The previous proposal for a default ₹7,999/month managed-pilot continuation is **withdrawn**. After a 60-day managed pilot, customers choose an agreed Basic/Growth/Pro tier, or a *separately priced and separately agreed* managed service. No automatic renewal.

## Public landing copy

**Meta title:** SalsysOS Pricing | Free CRM, Lead Management & Intelligence  
**Meta description:** Explore SalsysOS CRM plans for growing teams: Free, Basic, Growth and Pro. Compare lead management, follow-ups and conditional analytics features.  
**URL after approval:** `/pricing`  
**SEO keywords to evaluate:** lead management CRM pricing, sales CRM for training institutes, marketing attribution CRM  
**Preview/indexation:** keep static prototype non-indexable and outside the public Next.js router until commercial, legal, contact and privacy approvals pass.

### Hero

**Eyebrow:** Straightforward pricing for enquiry-led teams

# Start with leads. Grow into intelligence.

Organize your pipeline, keep follow-ups moving and add marketing insights as your business grows. Choose a workspace tier that fits your team—without assuming that every provider integration is already active.

**Intro reassurance:** Pricing is per workspace. Guided setup is quoted separately. External messaging, advertising and platform-usage charges are not included.

### Free — Starter Workspace
**₹0 / month** — 1 user, proposed limit 250 leads.

For one person evaluating the SalsysOS lead workspace. Manual lead entry, CSV transfer after import checks, leads, contacts, basic pipeline, simple dashboard and follow-up tasks. **No mandatory setup fee**; optional guided assistance ₹2,999–₹4,999. No live provider integrations.

**CTA in future after R13-P2:** Start free  
**CTA in current review preview:** Not available yet

### Basic — Lead Management
**₹1,499 / month** — 2 users, proposed limit 2,000 leads.

For smaller admissions and sales teams that need lead ownership, pipeline, reminders and basic source reporting. Eligible for one website lead-form connection and one WhatsApp Business connection **only if those paths have passed tenant/provider/consent acceptance and are specifically agreed**. No automatic customer messaging.

**One-time managed setup:** ₹4,999–₹7,999, based on approved scope.

### Growth — Marketing Intelligence (featured)
**₹3,499 / month** — 5 users, proposed limit 10,000 leads.

Everything proposed in Basic, plus paid-media leads, re-engaged leads, conversion reporting, team performance and evidence-based campaign/source attribution. Instagram conversation, Google Ads and Meta Ads reporting require each provider's permissions and acceptance; not automatically on.

**One-time managed setup:** ₹9,999–₹14,999.

### Pro — Business Intelligence Suite
**₹6,999 / month** — 10 users, proposed limit 50,000 leads.

Everything proposed in Growth, plus richer reports, appropriate advanced roles, reconciled funnel/touchpoint evidence and verified attribution. Optional website behavior, SEO/Search Console and conversion tracking require explicit source authorization and privacy/release acceptance. Prediction/forecasting remains limited to genuinely validated historical outcomes; not a promised feature until accepted.

**One-time managed setup:** ₹19,999–₹34,999.

### What is not included in a price

- WhatsApp/Meta provider message charges, ads spend or applicable third-party usage fees
- Unverified integrations, source backfills or all-site behavioral tracking
- Autonomous AI messaging or legally consequential automated decisions
- Unlimited records/storage/users or guaranteed uplift
- The one-time setup quotation; setup fees are separate and scope-dependent

### Founding managed pilot (separate offer)

**A guided 60-day pilot — proposed one-time fee ₹14,999**, up to 3 named users, four scheduled hours of onboarding/training/review, and a separately signed contract. It does **not** automatically renew at ₹7,999/month or any other amount. The 60-day term begins only after verified secure activation. Prospects can request a human-guided walkthrough before deciding. Real customer data activation remains blocked until tenant/security/privacy gates pass.

### FAQ

**Can I use SalsysOS for free?**  
The proposed Free tier has no monthly subscription and does not require paid setup. Self-service signup has not been released yet.

**Are the prices per user?**  
No. Proposed monthly fees are per business workspace, with separate provisional named-user limits.

**Is WhatsApp/Instagram included?**  
Plan eligibility does not mean an integration is activated. Provider permissions, appropriate consent, specific setup and release checks apply; usage fees are separate.

**Does Pro include automatic AI sales agents?**  
No. Autonomous replies and background actions are not included in the proposed public plans until separately accepted and released.

**Do I have to pay a setup fee?**  
Free can be used without one once self-service is available. Paid tiers have proposed managed setup charges depending on implementation scope, quoted before commitment.

**Can I change or cancel a plan?**  
A downgrade/cancellation and data-export policy will be documented before recurring billing launches. We will not imply that cancellation erases records or that a payment failure instantly shuts off a workspace.

**When can I buy or start?**  
Automated public checkout and self-service activation are not yet live. Until their release acceptance, we can discuss a separately contracted, human-managed pilot after the applicable security/privacy verification.

### UI and conversion rules

- One clear four-card desktop grid; on mobile show stacked cards without sideways scrolling. Growth gets a thin violet highlight, not an urgent countdown.
- A separate short “60-day guided founding pilot” strip below the table, clearly distinguished from subscriptions.
- Feature availability labels: **Core**, **Requires approved connection**, **Future / not yet available**. Never represent conditional features as live on all accounts.
- No “Start free,” “Subscribe,” “Pay now,” “Connect WhatsApp,” or other active control unless a fully functional, reviewed flow exists.
- When first published, a working human-contact form must have a privacy notice and accepted retention. Do not put an inert “Request a Demo” button in production.
- No fabricated brand logos, customer metrics, testimonials, audited-security badges or guaranteed attribution outcomes.

## Launch gates (all still separate)

- [ ] Approve exact four prices, setup-fee policy, recommended limits and tax treatment
- [ ] Confirm user/record quotas against Supabase and media/provider costs
- [ ] Approve cancellation/refund/export, privacy/data-processing and support terms
- [ ] Complete R13-P0 review/installation and R13-P1 entitlement administration
- [ ] Accept R13-P2 verified signup and identity/abuse controls before opening Free
- [ ] Accept R13-P3 billing provider and invoice/webhook handling before paid checkout
- [ ] Accept R13-P4 downgrade/grace, suspension, quotas and offboarding
- [ ] Verify explicit permissions before any Meta/Google/WhatsApp/Instagram integration promise
- [ ] Verify functioning privacy-compliant demo contact workflow before activating CTAs
- [ ] Explicitly approve deployment/publication and re-check exact production build

**Current release boundary:** documentation/preview only. No SaaS price is approved in the database, and the original R13-P0 constraint against seeded pricing remains intact.
