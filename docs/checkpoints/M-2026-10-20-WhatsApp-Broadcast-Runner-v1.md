# M-2026-10-20 — Guarded WhatsApp Broadcast Runner V1

## Goal

Complete the execution half of WhatsApp Operations Suite V1 without weakening the already-proven Smart Triggers WhatsApp safety boundary.

This checkpoint allows a human-approved WhatsApp broadcast campaign to be executed automatically **only when** the existing tenant messaging policy and Meta provider-send gate are already enabled. The runner never opens either gate.

## Human approval boundary

The WhatsApp Operations workspace already requires an operator to:

1. create a campaign using an active Meta-approved template;
2. snapshot the exact recipient audience;
3. review eligible/excluded counts;
4. explicitly approve the campaign.

Immediate approved campaigns become eligible for the runner on its next cycle. Scheduled campaigns become eligible only after their scheduled timestamp.

A campaign without `approved_at` and `approved_by` cannot be started by the runner.

## Runtime

Runtime helper:

`lib/automation/whatsapp-broadcast-runner.ts`

Protected route:

`GET /api/automation/whatsapp/broadcast-runner`

Authorization:

- `WHATSAPP_BROADCAST_RUNNER_SECRET`, when configured; or
- existing `CRON_SECRET`.

The route accepts no organization selector from a browser/client. It scans bounded approved/scheduled/running campaigns server-side.

Vercel cron:

```text
*/5 * * * *
```

Each invocation is bounded to:

- 5 campaigns;
- 10 recipients per campaign.

The limits are also clamped inside the runtime helper.

## Safety gates before a campaign can start

The runner checks, per tenant:

- WhatsApp messaging policy exists and `policy_enabled=true`;
- Meta provider-send setting exists and `provider_send_enabled=true`;
- campaign has explicit human approval;
- scheduled time has arrived;
- there is an auditable recipient snapshot.

While provider pilot mode is enabled, the runner additionally requires the entire open campaign scope to be exactly the allowlisted pilot lead and within the configured pilot message cap. The provider claim repeats the pilot checks immediately before the Meta call.

## Per-recipient policy

`evaluate_whatsapp_broadcast_send_policy_v1` reuses the existing base messaging policy and preserves:

- active STOP/messaging suppression;
- missing/disabled messaging-policy blocking;
- 24-hour / 7-day frequency caps;
- minimum-gap enforcement;
- verified primary WhatsApp requirement;
- approved active synchronized template requirement.

The only base-policy reasons an explicitly human-approved campaign is allowed to satisfy are:

- `autonomous_send_disabled`;
- `human_approval_required`.

No other blocker is discarded.

## Template behavior

V1 does not invent customer-facing template parameters.

A synchronized template with header/body variables is blocked with:

`template_variables_not_configured`

until an explicit campaign parameter-mapping feature is implemented.

The current synchronized `hello_world` test template has no header/body variables and is suitable for a controlled single-recipient pilot when all other gates are explicitly opened.

## Provider execution

The existing provider adapter remains the only component that talks to Meta:

`lib/integrations/whatsapp-provider-send.ts`

Its only change in this checkpoint is to call:

`claim_whatsapp_provider_send_v2`

instead of V1.

The V2 claim router delegates all non-broadcast audits back to the existing V1 claim unchanged. Broadcast audits use the new broadcast claim path.

A repository compare verified the provider adapter itself changed by only one added line / one removed line: the claim RPC version.

## Provider-claim recheck

Immediately before the Meta call the broadcast claim rechecks:

- campaign is still running and approved;
- recipient is still executable;
- suppression/frequency/policy state;
- approved template state;
- provider-send gate;
- provider pilot lead allowlist;
- verified primary pilot WhatsApp contact;
- pilot start timestamp;
- pilot message cap.

If any condition changes after preparation, the provider call is blocked.

## Idempotency and retry

Each broadcast recipient receives a deterministic provider-audit idempotency key:

```text
whatsapp-broadcast:{campaign_id}:{recipient_id}
```

The same ready/sending/sent audit is reused and cannot create a second provider send.

If an audit was blocked before any provider call, `rearm_whatsapp_broadcast_provider_send_v1` may re-check current policy and return that same audit to `ready`. It refuses to re-arm an audit once a customer message was sent or a provider message ID exists.

## Delivery and reply reconciliation

Broadcast provider audits are linked to:

- `broadcast_campaign_id`;
- `broadcast_recipient_id`.

Audit status reconciliation updates recipient state for:

- sent;
- delivered;
- read;
- failed;
- safely blocked/excluded/suppressed states.

Inbound reply attribution runs only for messages whose conversation channel is explicitly `whatsapp`. It attributes a reply to the most recent sent broadcast for that lead within seven days. This is operational attribution, not a causal claim.

## Campaign counters

Runtime reconciliation maintains:

- queued;
- sent;
- delivered;
- read;
- replied;
- failed.

The original `eligible_count` remains the human-reviewed audience snapshot count and is not overwritten by runtime state transitions.

A running campaign is marked completed once no `eligible` or `queued` recipient remains.

## Production safety state

At implementation time production remained fail-closed:

- messaging policy OFF;
- autonomous send OFF;
- human approval required;
- provider send OFF;
- pilot mode ON;
- pilot maximum 1.

Deploying this code/schema therefore does not send a broadcast by itself.

## Verification

`npm run verify:whatsapp-broadcast-runner`

CI asserts:

- broadcast lineage exists on provider audits;
- V2 claim routes legacy traffic back to V1;
- only the two campaign-approval blockers can be overridden;
- suppression, policy and frequency gates remain authoritative;
- provider and pilot gates are rechecked;
- dynamic template values are never guessed;
- blocked audits cannot be rearmed after a customer/provider send;
- reply attribution is WhatsApp-only;
- approved audience count stays immutable;
- runner work is bounded;
- runner cannot open production gates;
- cron route is secret-authenticated and accepts no client tenant selector;
- provider adapter uses the V2 claim router.

## Production acceptance still required

Before declaring broadcast execution production-proven:

1. migrations apply successfully;
2. CI/typecheck/build are green;
3. production remains fail-closed after deployment;
4. controlled pilot uses exactly one allowlisted lead;
5. approved zero-variable template is used;
6. one message is accepted by Meta;
7. sent/delivered/read reconcile to the recipient/campaign;
8. a reply reconciles to `replied`;
9. provider pilot auto-disarm / cap behavior remains intact;
10. all global gates return to fail-closed after the pilot.

No broad production broadcast should be enabled merely to prove this checkpoint.
