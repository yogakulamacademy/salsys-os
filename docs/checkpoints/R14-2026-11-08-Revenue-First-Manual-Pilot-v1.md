# R14 — Revenue-first manual pilot launch kit (draft v1)

**Date:** 2026-11-08  
**Decision:** Until SalsysOS has CRM revenue, do not provision or approve new *paid* staging infrastructure. Existing CI, local disposable PostgreSQL, code review and truthful demo preparation remain usable. This is a GTM and operator playbook, **not** production release acceptance or billing implementation.

**Evidence:** Production CRM is READY on `691dc441`. Platform admins already have a private customer-organization provisioning screen (`/settings/organizations`) and guided onboarding (`/onboarding`). **Subscription plans, SaaS commercial ledger, self-service signup and billing integration do not exist yet**. Student/customer CRM `public.payments` are categorically separate from future SalsysOS SaaS payments. See R13 Audit & Design V1 and [Revenue-first Issue #651](https://github.com/yogakulamacademy/salsys-os/issues/651).

## 1. What we can offer *today*

**Positioning:** SalsysOS helps a small team organize enquiries, assign follow-ups and understand the available customer journey in one CRM, without promising that every website/advertising/messaging integration is already live.

**Initial target (proposed, not owner-selected):** owner-operated education, training and wellness businesses handling regular enquiry volume through websites, WhatsApp, calls or social channels. SalsysOS stays neutrally branded; no vertical-specific yoga skin.

**Invite-only pilot offer — owner must approve scope:**
- Existing CRM workspace: lead list and contact record, pipeline, follow-up tasks, and Customer/Person 360 where legitimate source evidence exists.
- Guided, human-operated setup and one owner workspace after the real-world tenant privacy/authorization gate passes.
- Optional website/channel connectors only after each specific source is actually verified and consent/permissions are approved.
- **Excluded from baseline offer:** optional behavioral SDK activation, unsupported historical funnels, automatic AI messaging, unattended WhatsApp/Instagram sends, unreconciled revenue attribution, billing integration, R13 self-service trials and unapproved future product features.
- No guarantee of revenue increase, AI performance, delivery of specific integrations or zero downtime without independent evidence.
- Any AI feature demonstrated must be in its actually authorized mode, with observed vs generated/predicted facts visibly distinguished.

## 2. Minimal launch sequence: no new paid services

| Sequence | Operator action | Evidence of completion | Stop rule |
| --- | --- | --- | --- |
| 1. Approve offer | Owner chooses customer segment, pilot scope, price/currency, payment frequency, term and refund/cancellation policy | Written owner-approved offer | Never invent price, plan name, limits or trial duration |
| 2. Qualify | Speak with interested businesses one-to-one via authorized existing channels | Prospect explicitly agrees to discuss CRM | No automated bulk send/scraping or purchased contact list |
| 3. Demonstrate | Use only sanitized, approved demo data; walk through Leads, Pipeline, Tasks, customer journey evidence | Real demo completed, user questions recorded | Do not expose another tenant or pretend synthetic data is real business performance |
| 4. Offer pilot | Provide a clear scope sheet, pricing, onboarding requirements, support and privacy terms | Prospect agrees to offer terms | Do not claim staging/R2/AI features are accepted |
| 5. Verify readiness | Human admin verifies authorized owner/other-tenant boundaries, secure login/password reset and privacy requirements | Signed checklist; isolation PASS or FAIL | Without PASS, **do not activate sensitive customer data** |
| 6. Handle SaaS payment | Authorized operator issues a legally compliant commercial invoice via approved off-platform flow and verifies actual receipt | Invoice/payment evidence in separate accounting | NEVER write SaaS payment into CRM lead/enrollment `payments` |
| 7. Activate | Platform admin uses existing controlled provisioning **only after step 5**, then customer owner completes onboarding | Real owner login, org-bound isolation, successful onboarding | No creating demo tenants in production to simulate approval |
| 8. Review value | Customer confirms whether leads/tasks/handovers improved from genuine usage | Customer acknowledgement and next step | Never fabricate sales metrics or claim conversions from synthetic events |

**Revenue metric:** `first paying customer` means an approved commercial agreement + confirmed payment + securely activated tenant, not a demo booking or synthetic invoice. Track prospect → qualified → demo → proposal → agreement → payment confirmed → activated as distinct states.

## 3. Demonstration agenda (human-led)

1. **Discovery:** Ask which enquiries get lost, who owns each follow-up, how leads are transferred, and which tools currently hold the records.
2. **Lead workspace:** Show legitimate sample leads labeled *demo*. Explain capture source restrictions; do not install optional tracking.
3. **Pipeline and follow-ups:** Show how staff sees due tasks, what has changed and what needs action. Make only reversible edits in an authorized demo workspace.
4. **Customer 360:** Explain how a lead's timeline uses verified source events, and where identity reconciliation or missing integration evidence prevents a claim.
5. **Scope and limitations:** Call out integrations not approved, consent settings, pending R2 release gates and the manual support model.
6. **Next action:** Confirm the business's success criterion, what a pilot would include, who approves CRM access, and whether they want a written quote.

**Do not use live sensitive Yogakulam/customer data for external demos.** Existing demo environment must be confirmed safe; production is not a substitute for staging.

## 4. Reusable sales copy (draft; human review before sending)

**Short introduction**

> We're opening a limited, personally guided SalsysOS CRM pilot for businesses that want a clearer view of enquiries, follow-ups and sales progress. Instead of promising a long list of integrations, we'll show you the parts that work today, discuss your current process and put together a practical pilot scope. Would you like a walkthrough?

**After a demo**

> Thanks for reviewing SalsysOS. Based on what we discussed, the pilot would focus on [agreed workflow], with [agreed number of users], [confirmed integrations only] and [agreed support]. I'll send the written scope and commercial terms once approved. We'll only activate your real workspace after its access and privacy checks pass.

**Pricing response when terms are unapproved**

> We're finalizing the pilot package based on the workflow and support included. I'll confirm the exact fee, billing period, scope and terms in writing before asking you to commit.

No bulk automated messaging is authorized by these templates. No external send has occurred.

## 5. Owner-approved commercial terms (intentionally blank)

| Decision | Owner-approved value |
| --- | --- |
| First target customer type | **Pending** |
| Pilot name, duration and maximum users | **Pending** |
| Currency and invoiced fee | **Pending** |
| Included implementation/support hours | **Pending** |
| Payment method and confirmation owner | **Pending** |
| Billing, cancellation and refund terms | **Pending** |
| Terms, privacy/data-processing and support contact | **Pending** |
| Source/connector access and consent responsibilities | **Pending** |

Do not advertise `free trial`, paid subscription, auto-billing, discounts, pricing tiers or refunds before these are approved.

## 6. Release controls that this revenue-first pivot does NOT change

- **R2-P1 #520:** optional behavior collector stays OFF until controlled live pilot acceptance.
- **R2-P2 #523:** formal signed-in owner/admin second-tenant and reporting evidence still open.
- **R2-P3 #527 / #531 / #588:** real-site consent, separate isolated staging and historical retention remain unresolved. No cheap shortcut may send test events into production.
- **Lead reliability #620 / #643:** deadlock and primary-contact drafts remain unmerged; candidate #648 passes disposable tests but is not a release-ready production deployment.
- **R13 commercial P0-P4:** code/design for provider-neutral commercial-state tables and later billing can be prepared under existing GitHub CI, without paid staging, but no merchant provider, plan pricing, backfilled subscriptions or production migrations are authorized here.
- **Tenant safety:** if actual cross-tenant isolation cannot be demonstrated safely on existing approved identities and without exposing customer data, stop at **pre-sales/demo/quote**. Do not onboard real third-party leads until the necessary isolation acceptance is possible.
- **Costs:** existing infrastructure could still incur normal usage or service charges. The decision is **no newly approved paid staging**, not a blanket guarantee that all CRM use has zero cost.

## 7. Operator launch checklist

- [ ] Approve target customer category and exact offer
- [ ] Confirm accessible, appropriate sanitized demo workspace and demo access policy
- [ ] Prepare qualified prospect list from existing legitimate relationships
- [ ] Run first human-led walkthrough; record questions and outcome
- [ ] Approve a written scope, pricing, service terms and privacy obligations
- [ ] Verify safe multi-tenant access before real-data activation
- [ ] Verify invoice/payment outside CRM customer-commerce tables
- [ ] Provision only with platform-admin authorization; secure temporary password reset
- [ ] Measure actual pilot adoption and customer-acknowledged usefulness
- [ ] Revisit isolated staging expenditure only once owner agrees that CRM revenue supports it

**Next engineering checkpoint:** Build the smallest provider-neutral R13-P0 *draft-only* commercial-state foundation when the product owner wants subscription lifecycle tracking, without adding self-service signup, selecting a billing provider or deploying a migration. A manual operator pilot can validate demand independently of a premature payments integration.
