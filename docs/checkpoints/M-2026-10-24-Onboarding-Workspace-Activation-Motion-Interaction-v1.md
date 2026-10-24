# M-2026-10-24 — Onboarding, Workspace Activation, Motion and Interaction Feedback V1

## Production state

This checkpoint consolidates the onboarding and UX work merged on 2026-10-24 after the original customer-provisioning milestone.

Latest verified product-code production head at the time of this checkpoint:

- commit: `22c20a3d825014bcee4d692c535fc55a32cb8b06`
- production deployment: `dpl_3dihGMTdsDxtJkZkm35jUUESfBAa`
- deployment state: `READY`
- production aliases include `crm.salsysos.com`, `salsysos.com`, `www.salsysos.com`, and `salsys-os.vercel.app`

The latest product merge is PR #171, **Wire targeted interaction feedback v8**.

## Onboarding flow now in production

The new-customer onboarding path is:

`Security -> Business -> Goals -> Website -> Channels -> Team -> Finish`

### Hard requirements

Only the following onboarding steps are required to complete onboarding:

- Business
- Goals / Priorities

### Optional / recommended setup

The following steps may be skipped without being marked complete:

- Website tracking
- Connected channels
- Team access

The key invariant is:

**Skip != complete.**

Skipped optional steps advance onboarding but are not appended to `completed_steps`.

### Optional-step routing fix

PR #161 removed stale guards that previously forced users back to Website after selecting `Skip for now`.

Channels and Team now require only the true hard prerequisites: Business + Goals.

The onboarding regression verifier now protects this behavior so Website cannot become an accidental route-level prerequisite again.

### Finish behavior

Finish uses the optional-setup completion action and requires only Business + Goals.

Completion writes onboarding status/timestamp and redirects to the completed state without requiring Website, Channels, or Team.

The older completion helper with stricter requirements remains in the repository only as legacy code; it is not the Finish path and should not be removed without a reference audit.

## First-login security gate

Provisioned customer owners continue to use the first-login password replacement flow before onboarding.

Security invariants remain unchanged:

- provisioned owners receive admin-owned `require_password_change: true` app metadata;
- password replacement happens before business onboarding;
- authenticated page navigation cannot bypass the security gate;
- API authorization behavior is not replaced by UX redirects;
- the requirement is cleared only after successful password replacement;
- existing legacy users without the metadata flag remain unaffected.

## Home Workspace Activation redesign

PRs #160-#163 evolved the post-onboarding setup experience from a large recommendation block into the current Workspace Activation step bar.

Current behavior:

- all four activation steps remain visible while activation is incomplete;
- the UI shows live `X of 4 verified` progress;
- the first unfinished item is highlighted as `Start here`;
- completed items stay visibly `Verified`;
- the whole activation block disappears when all four are genuinely verified.

The four activation checks are:

1. Track where leads come from — healthy live website tracking evidence.
2. Connect your conversations — at least one connected integration.
3. Give every lead an owner — real active team/member evidence.
4. Automate your first follow-up — at least one non-archived automation workflow.

These checks are derived from live tenant evidence, not onboarding checkboxes.

Legacy organizations are deliberately excluded unless they completed the new onboarding flow.

## Motion System rollout

The motion work was implemented as a restrained, reusable visual system. The guiding rule is that motion should explain state/progress rather than decorate every surface.

All motion respects `prefers-reduced-motion`.

### V1 — Home + Onboarding

PR #164.

Added:

- animated Workspace Activation progress;
- staggered activation-step entrance;
- subtle active-step emphasis;
- verified/check feedback;
- CTA arrow motion;
- onboarding route/step transitions;
- onboarding progress/state motion.

No onboarding persistence or readiness logic changed.

### V2 — Smart Triggers + Flow Builder

PR #165.

Added route-aware motion to:

- Smart Trigger process sections;
- condition/result feedback;
- modals and focus states;
- Flow Builder nodes, drag/select state, inspector entrance and connector transitions.

No automation runtime, trigger execution, or Flow Builder persistence logic changed.

### V3 — CRM Pipeline + Analytics

PR #166.

Added:

- pipeline KPI/stage/card reveals;
- drag-target and optimistic stage feedback;
- success/error toast motion;
- analytics KPI reveals;
- chart/bar growth;
- filter/view transitions;
- table/detail drawer transitions.

No CRM mutations or analytics calculations changed.

### V4 — Conversations + Leads + Lead Inspector

PR #167.

Added:

- inbox/thread/activity/context transitions;
- lead-table/filter/selection motion;
- Lead Inspector drawer/backdrop/tab/action feedback.

No messaging send behavior, lead mutation behavior, or inspector API logic changed.

### V5 — Funnel + Attribution + Revenue

PR #168.

Added motion to:

- funnel stages and evidence bars;
- attribution investigation/readiness/filter states;
- revenue KPI/progress/table/status surfaces.

No funnel calculation, attribution model, revenue, payment, or tenant logic changed.

### V6 — Settings + Integrations + Tracking

PR #169.

Added:

- operational section/form reveals;
- integration/setup card feedback;
- tracking health/progress animation;
- dialog/panel/empty-state transitions;
- form focus and save/status feedback.

No integration actions, tracking ingestion, settings persistence, auth, tenant, or database logic changed.

### V7 — Global micro-interactions

PR #170.

Added:

- smoother CRM skeleton shimmer;
- pending / `aria-busy` feedback;
- semantic `role=status` and `role=alert` feedback;
- saved/completed state feedback;
- optimistic/refreshed row motion;
- selected tab/filter interaction feedback;
- reusable copied-state hooks.

This layer reacts to existing real UI state and does not invent completion timers.

## Interaction Feedback V8

PR #171 adds targeted real-state feedback on top of the shared motion system.

Current behavior:

- an interaction bridge observes existing rendered actions;
- disabled buttons whose actual labels indicate real pending work such as Sending, Saving, Creating, Verifying, Connecting, Inviting, Publishing, Syncing, Processing, Loading, Updating or Generating receive `aria-busy` / pending annotations;
- pending buttons show a restrained progress sweep;
- copy confirmation is derived from an existing real `Copied` state;
- tracking snippet copy state is set only after `navigator.clipboard.writeText` succeeds;
- no fake timer or artificial success state is introduced.

No server action, CRM, messaging, tracking ingestion, integration, tenant, persistence or database logic changed.

## Regression / release discipline

Each implementation phase was released through the controlled workflow:

- feature branch;
- focused PR;
- platform contracts;
- onboarding/tracking/commercial-intelligence contracts where relevant;
- TypeScript;
- full Next.js build;
- Vercel preview;
- merge;
- production deployment verification.

The onboarding regression contract specifically protects:

- first-login password security ordering;
- page-navigation bypass prevention;
- explicit `enforce_on_sign_in` opt-in;
- Business + Goals as the only hard onboarding requirements;
- Website skip advancement without completion credit;
- Channels/Team not requiring Website completion;
- evidence-based Home activation recommendations;
- tenant-safe new-onboarding behavior.

## Safety boundaries unchanged

These UX improvements do not alter the product safety posture:

- autonomous customer messaging remains OFF;
- automatic website publishing remains OFF;
- automatic ad-budget changes remain OFF;
- broad/global OpenSearch indexing remains OFF;
- PostgreSQL remains source of truth;
- high-impact actions continue to require appropriate human approval;
- missing evidence remains unknown rather than inferred;
- no fake traffic, revenue, conversion, ranking or model-training evidence is introduced.

## Product-closeout impact

This milestone materially improves onboarding and product polish, but it does not change the canonical product-closeout order.

Core CRM and Customer 360 remain CLOSED V1.

Universal Tracking remains the active closeout area until the real acquisition-to-revenue production acceptance path is proven end-to-end.
