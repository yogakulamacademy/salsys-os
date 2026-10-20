# M-2026-10-20 — WhatsApp Growth Operations V1

## Goal

Finish the remaining product-level WhatsApp Operations features before the final live one-recipient pilot, without weakening the existing Smart Triggers safety boundary.

This checkpoint adds four capabilities that were previously optional parity enhancements:

1. explicit dynamic template-variable mapping;
2. deterministic A/B campaign variants;
3. safe reply-to-agent routing;
4. campaign conversion and revenue context.

It does **not** enable the messaging policy, autonomous sending or Meta provider execution.

## Explicit template variables

Campaign templates can now use positional header/body variables when every variable is explicitly mapped before human approval.

Supported sources are intentionally allowlisted:

- `lead.first_name`
- `lead.last_name`
- `lead.display_name`
- `lead.lead_code`
- `lead.country`
- `lead.preferred_location`
- `lead.preferred_mode`
- `lead.preferred_month`
- `course.name`
- `campaign.name`
- `constant:<operator supplied value>`

Example operator configuration:

```text
body.1=lead.first_name
body.2=course.name
body.3=constant:November 2026
```

The system does not ask an LLM to invent template parameters and does not infer arbitrary database fields. Binding counts must exactly match the synchronized Meta template schema.

At audience snapshot time, each otherwise-eligible recipient is checked for all required values. A recipient with a missing required field becomes excluded before campaign approval.

At provider preparation time, values are resolved again and embedded into the auditable provider request payload. The provider claim still performs its normal final policy recheck immediately before Meta is called.

## A/B campaign experiments

An advanced campaign may optionally create two active variants:

- `Control`
- `Challenger`

Each variant has:

- an approved synchronized Meta template;
- its own explicit variable bindings;
- an integer allocation weight.

The two default creation weights sum to 100%. Campaign validation requires two or more active variants and a total allocation of exactly 100 before approval.

Recipient assignment is deterministic from campaign ID + lead ID. Refreshing the same audience therefore does not randomly move a lead between variants unless the experiment configuration itself changes.

Variant performance includes:

- audience;
- sent;
- delivered;
- read;
- replied;
- failed;
- operationally attributed conversions;
- operationally attributed enrollments;
- revenue by currency.

No statistical-significance or causal-lift claim is made automatically.

## Human approval freeze

Customer-facing configuration is immutable after human campaign approval.

Protected fields include:

- template;
- template variable bindings;
- audience source/filters;
- schedule;
- reply-routing policy;
- routing pool;
- conversion attribution window;
- experiment variants and weights;
- recipient audience membership;
- recipient experiment assignment.

Any configuration change while a campaign is still draft/ready invalidates the current audience review and returns the campaign to draft so the audience must be snapshotted again.

## Reply routing

Campaigns support three modes:

- `preserve_owner`
- `campaign_creator_if_unassigned`
- `round_robin_if_unassigned`

Routing only runs after a real inbound message on a WhatsApp conversation has been attributed to a recently sent campaign.

Routing never replaces an existing lead owner. Creator/round-robin assignment occurs only when the lead remains unassigned, and round-robin candidates must be active members of the same organization with an allowed CRM role.

Assignments are recorded in the campaign event ledger.

## Conversion and revenue context

The read model adds operational campaign attribution using this rule:

> associate a conversion with the most recent successfully sent WhatsApp campaign for that lead when the conversion occurs inside that campaign's configured attribution window.

Default window: 30 days. Allowed range: 1–90 days.

Metrics include:

- attributed conversion facts;
- attributed payment facts;
- attributed enrollment facts;
- attributed refunds;
- net revenue grouped by currency.

This is explicitly labeled `last_sent_whatsapp_campaign_within_window` and is **operational attribution**, not proof that the WhatsApp campaign caused the sale or enrollment.

## Runtime integration

The existing guarded broadcast runner is reused unchanged.

`prepare_whatsapp_broadcast_provider_send_v1` now resolves the recipient's selected variant and explicit template components before creating the provider-send audit.

The existing provider adapter still uses:

`claim_whatsapp_provider_send_v2`

Therefore all existing runtime controls remain authoritative:

- STOP/messaging suppression;
- messaging policy enabled;
- frequency caps and minimum gap;
- verified primary WhatsApp contact;
- active approved synchronized template;
- human campaign approval;
- provider execution gate;
- pilot allowlist;
- pilot message cap;
- immediate pre-provider claim recheck;
- deterministic idempotency.

## UI

New workspace:

`/automation/whatsapp/growth`

It provides:

- advanced campaign creation;
- explicit variable mapping help;
- optional Control/Challenger A/B setup;
- reply routing configuration;
- conversion-window configuration;
- actual post-trigger audience snapshot counts;
- human approval;
- campaign delivery/read/reply metrics;
- conversion/enrollment/payment context;
- revenue by currency;
- variant-level performance.

The standard `/automation/whatsapp` workspace remains available for simple campaigns, inbox operations, audiences and quick replies.

## Production safety posture

This checkpoint intentionally does not open any send gate.

Expected production state remains:

- messaging policy OFF;
- autonomous send OFF;
- human approval required;
- provider send OFF;
- pilot mode ON;
- pilot maximum 1.

Deploying the schema/UI alone therefore cannot start a customer broadcast.

## Verification

CI command:

```text
npm run verify:whatsapp-growth
```

The verifier protects:

- allowlisted variable sources;
- exact variable-count validation;
- recipient exclusion for missing personalization;
- deterministic experiment assignment;
- variant-level analytics;
- unassigned-only reply routing;
- operational/non-causal revenue attribution wording;
- approved configuration immutability;
- stale snapshot invalidation;
- existing suppression/frequency/provider gates;
- absence of provider execution from campaign-management actions.

## Remaining production acceptance

After this checkpoint is green, migrated and deployed, the remaining acceptance work is the controlled production proof rather than additional core product construction:

1. create one pilot-safe campaign;
2. snapshot exactly the allowlisted pilot lead;
3. use an approved template and explicit parameter mappings if needed;
4. human-approve the campaign;
5. temporarily open only the already-established pilot gates;
6. send exactly one message;
7. prove Meta acceptance and canonical CRM message lineage;
8. prove sent/delivered/read reconciliation;
9. prove inbound reply attribution and routing;
10. if a genuine later conversion occurs, observe attribution rather than manufacturing a test revenue event;
11. return all production send gates to fail-closed.

The product should not fabricate revenue or conversion evidence merely to make the analytics cards non-zero.
