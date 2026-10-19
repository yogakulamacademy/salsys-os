# M-2026-10-19 — Smart Triggers safety hardening

## Status
PASS / controlled production safety milestone complete with customer-send gates left fail-closed.

## Frequency caps
A rollback-only production test isolated the 24-hour cap. With unrelated blockers removed and the cap set to one, the existing single outbound message caused `frequency_limited=true`, `send_allowed=false`, and `frequency_cap_reached`. No persistent policy changes or customer sends occurred.

## Duplicate and idempotency behavior
- Reclaiming an already-sent provider audit was rejected before any provider call with `already_sent_or_recorded`.
- Re-recording the same accepted provider message reused the existing canonical CRM message rather than creating a duplicate.
- Failed finalization was idempotent.
- Duplicate automation event emission reused the canonical event rather than multiplying work.
- A failed audit could not be silently reclaimed through the ordinary ready-state path.

## Provider-failure recovery
The explicit recovery path:
- preserves failed provider audits as immutable history;
- creates a new audit for each operator retry;
- is idempotent per failed audit to protect double-click/concurrent requests;
- allows at most three total provider attempts per approved send;
- rechecks approval/enrollment state, suppression, frequency caps, WhatsApp channel/template policy, provider kill switch, pilot controls, and the existing claim boundary before a provider call;
- never retries an audit where provider acceptance or a customer message is already recorded.

Controlled production simulation proved first retry, duplicate retry reuse, second retry, retry-cap enforcement and provider-failure finalization without contacting Meta. The active STOP suppression separately blocked retry preparation before a new provider audit could be prepared.

## Quiet hours
Workflow quiet hours are enforced at the centralized WhatsApp policy resolver used by preparation and provider-claim paths.

Controlled tests proved:
- overnight window `22:00 -> 08:00` blocks a send at 23:00 local time with `quiet_hours_active`;
- the same policy allows the send path at 12:00 local time when all other safety checks are satisfied;
- invalid/missing quiet-hours configuration fails closed with `quiet_hours_misconfigured`;
- equal start/end is treated as all-day quiet rather than silently allowing sends.

## Approval lineage and pilot auto-disarm
Later closeout hardening reconciles the canonical CRM message with the persisted human approval request and automatically disarms the provider pilot after the configured one-message cap is consumed.

## Production state after verification
- customer opt-out suppression remains active for the controlled test lead;
- messaging policy remains disabled;
- autonomous sending remains disabled;
- provider sending remains disabled;
- human approval remains required;
- global scheduler remains disabled;
- no additional customer message was sent during these hardening proofs.

## Next productization work
Smart Triggers no longer needs more isolated low-level send tests before productization. Next work is operator-facing workflow settings, safe activation controls, monitoring/alerts, personalization/variables and later a deliberately high-friction production arming flow.
