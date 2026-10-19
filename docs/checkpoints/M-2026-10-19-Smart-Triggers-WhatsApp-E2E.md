# M-2026-10-19 — Smart Triggers + WhatsApp E2E checkpoint

## Scope

This checkpoint records the production evidence for the guarded Smart Triggers + WhatsApp path and the operator tooling promoted around it.

The production database remains the source of truth. This checkpoint does not authorize another customer message and does not change any runtime, messaging-policy, provider, pilot, scheduler, suppression or approval state.

## Product surface promoted to `main`

The following operator-facing automation capabilities are now on production `main`:

- Smart Triggers workspace and tenant-scoped workflow definitions.
- Conversation Flow Builder with persisted nodes, edges, waits, conditions and stop-on-reply behavior.
- Human approval queue for guarded WhatsApp actions.
- WhatsApp template synchronization and provider-approved template inventory.
- Meta Cloud API provider adapter with policy, approval, suppression, quiet-hours, frequency and pilot checks.
- Protected runtime scheduler API and workers.
- Rollout Readiness dashboard.
- Safe starter recipes for internal follow-up workflows.
- Guarded WhatsApp template actions in Flow Builder with forced human approval.
- Draft validation and atomic publish/clone lifecycle.
- Read-only Runtime Monitor for workflows, enrollments, scheduled jobs, provider audits and trigger runs.
- Fail-closed WhatsApp Pilot Control surface for exact-lead preparation and safe shutdown. Pilot preparation keeps provider execution off and the page exposes no send or provider-arm action.

Key production merge commits:

- `ed61d1f3e2134c69d583e1c6ded6eb41ab20cbff` — guarded Smart Triggers + WhatsApp runtime promoted.
- `1deb1ab4c4cc4302948d783c02828e7555c5ad44` — rollout readiness dashboard.
- `c87fa70e655da1258554b77124f632cfbd522b41` — safe starter recipes.
- `3b4c1096ec131f9f474c6a25da17ccaacf29a12f` — guarded WhatsApp template actions in Flow Builder.
- `2e62ab9118820a84f19949fba95738cbbb8419b4` — guarded validate/publish lifecycle.
- `34fc934a213eca7e93b9ecf9ed747689f48f184b` — read-only Runtime Monitor.
- `a870d1d191d044b098a47b1cf23981fbe38c8f8d` — fail-closed WhatsApp Pilot Control surface.

## Controlled live provider proof

A single controlled internal pilot send completed for the allowlisted SalsysOS test lead.

Evidence:

- Provider audit: `153ca3da-bd32-4286-90d9-1347dddc95a8`.
- Approval request: `d47b4749-abbe-49b7-8cc3-20bf4fadec78`.
- Enrollment: `7befc24d-4d7a-4f26-9923-b6931939b36d`.
- Workflow: `3e69380f-8308-46e7-8d33-d99888986542` (`New lead follow-up`).
- Published flow version: `3`.
- Request mode: `live`.
- Provider audit status: `sent`.
- `customer_message_sent=true`.
- Sent at: `2026-10-19 09:25:09.650412+00`.
- Provider delivery status progressed to `read`.
- Delivered at: `2026-10-19 09:25:11+00`.
- Read at: `2026-10-19 09:25:16+00`.
- No provider error and no block reasons on the successful audit row.

This proves provider acceptance and delivery/read webhook reconciliation for the bounded pilot path.

## Reply / stop-on-reply proof

A separate controlled `lead.created` runtime enrollment exercised the inbound reply path without sending another customer message.

Evidence:

- Enrollment: `8ff22d6e-351c-40a8-8a0b-15d49723ae3d`.
- Published flow version: `3`.
- Runtime entered `wait_for_reply`.
- Reply outcome: `reply_received`.
- Branch selected: `Reply received`.
- Final node: `end_replied`.
- Enrollment status: `completed`.
- `customer_message_sent=false` for this controlled reply test.

This proves the reply path can cancel the pending no-reply journey and complete on the reply branch.

## No-reply + scheduler proof

A separate controlled no-reply E2E exercised the timeout, delayed follow-up and approval boundary without authorizing a second send.

Evidence:

- Enrollment: `6ea9e00c-1bd0-47a1-ab22-5ec3690b59de`.
- Published flow version: `3`.
- Reply outcome: `reply_timeout`.
- Branch selected: `No reply`.
- Delay/wakeup worker advanced to `send_whatsapp_followup`.
- Approval request: `5fdd7827-b27b-4897-9cc5-d86970fd5930`.
- Approval status: `rejected`.
- Decision reason: controlled no-reply scheduler E2E completed; no customer send approved.
- Enrollment was stopped with `controlled_no_reply_e2e_complete`.
- `customer_message_sent=false` for this no-reply test.

This proves the no-reply scheduler path reaches the guarded WhatsApp approval node and remains fail-closed when approval is rejected.

## Current safety posture at checkpoint

SalsysOS test tenant:

- Workflow `New lead follow-up`: `active`.
- Published version: `3`.
- Current draft version: `4`.
- `runtime_flow_enabled=true`.
- `stop_on_reply=true`.
- WhatsApp messaging policy: `policy_enabled=false`.
- `autonomous_send_enabled=false`.
- `requires_human_approval=true`.
- Frequency limits remain 3 messages / 24h, 8 / 7d, minimum 30-minute gap.
- Provider execution: `provider_send_enabled=false`.
- Pilot mode remains enabled with an exact allowlisted lead.
- Pilot cap: `1` message.
- Verified primary WhatsApp is required for the pilot.
- Global application scheduler invocation: `enabled=false`; latest observed outcome `disabled`.

Therefore the successful pilot does **not** leave the system generally open for customer sends. Policy and provider execution are both closed, autonomous sending remains off, and the global scheduler is disabled.

## Operator safeguards added after the live proof

`/automation/pilot` provides a bounded pilot preparation and shutdown surface. It may select only a lead with a verified primary WhatsApp contact, blocks actively suppressed leads, fixes the pilot cap at one, clears the pilot start time during preparation, and explicitly forces `provider_send_enabled=false`.

The same page provides only capability-reducing controls: close provider gate and reset pilot configuration. It deliberately contains no provider-arm button, no test-send button, no autonomous-send control and no messaging-policy mutation.

## Production verification

Production Vercel deployments for the operator tooling reached `READY`, including the Runtime Monitor. The Pilot Control production deployment is verified separately as part of the merge/deploy record for commit `a870d1d191d044b098a47b1cf23981fbe38c8f8d`.

Unauthenticated requests to protected Automation routes correctly resolve to the SalsysOS sign-in flow; tenant data remains behind authenticated workspace resolution.

## Next controlled product work

Recommended next implementation sequence:

1. Keep provider arming separate from normal settings and require an explicit high-friction confirmation plus fresh readiness rechecks immediately before opening execution.
2. Auto-disarm or hard-stop provider execution after the pilot cap is reached.
3. Add richer Runtime Monitor drill-down for approval → provider audit → CRM message → delivery/read lineage.
4. Expand starter recipes into complete publishable conversation flows only after operator controls are in place.
5. Do not enable autonomous WhatsApp sending until repeated production evidence exists across reply, timeout, suppression, quiet-hours, frequency and provider-failure cases.

## Boundary

This checkpoint is evidence and documentation only. It must not be interpreted as approval to send another live WhatsApp message or to enable general autonomous messaging.
