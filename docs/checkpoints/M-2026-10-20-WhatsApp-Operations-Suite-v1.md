# M-2026-10-20 — WhatsApp Operations Suite V1

## Scope

This checkpoint productizes the existing guarded Smart Triggers + WhatsApp runtime into a broader WATI/AiSensy-style operations surface without weakening the existing messaging safety boundary.

The existing WhatsApp runtime remains authoritative for actual provider execution. This checkpoint does **not** enable autonomous sending, open the provider gate, change the messaging policy, expand the pilot allowlist, or authorize a customer message.

## Existing foundation retained

The suite builds on already-proven production capabilities:

- shared CRM conversation inbox;
- Meta Cloud API integration;
- inbound/outbound canonical messages;
- sent/delivered/read reconciliation;
- approved WhatsApp template synchronization;
- 24-hour service-window behavior;
- Smart Trigger Flow Builder;
- stop-on-reply;
- delayed/no-reply scheduler path;
- human approval queue;
- STOP/opt-out suppression;
- frequency caps;
- quiet hours;
- idempotent provider-send audits;
- retry recovery;
- pilot allowlisting and automatic provider-gate disarm.

## New product surfaces

### WhatsApp Operations workspace

`/automation/whatsapp`

Provides a single operator workspace for:

- reusable CRM audience segments;
- WhatsApp broadcast campaign drafts;
- auditable recipient snapshots;
- human campaign approval;
- pause/cancel controls;
- campaign delivery/read/reply metrics;
- quick/canned reply management;
- current messaging safety posture.

### Audience segments

`whatsapp_audience_segments`

Segments can use CRM evidence including:

- lead stage;
- intent;
- country;
- interested course;
- owner;
- acquisition/contact source;
- preferred location.

The V1 resolver defaults to active sales stages and requires a verified primary WhatsApp contact unless explicitly configured otherwise. Active all-channel or WhatsApp messaging suppressions exclude a lead from eligibility.

### Broadcast campaign ledger

`whatsapp_broadcast_campaigns`

Lifecycle:

```text
draft -> ready -> approved/scheduled -> running -> completed
                           |             |
                           +-> paused ---+
                           +-> cancelled
```

Campaign approval is a separate human review boundary. Approval alone does not authorize a provider send.

### Recipient snapshot

`whatsapp_broadcast_recipients`

A recipient snapshot records the exact lead set evaluated for the campaign, including eligible/excluded/suppressed status and exclusion reason. This prevents a campaign from silently changing audience membership after human review.

### Campaign events

`whatsapp_campaign_events`

Records operator lifecycle evidence such as:

- campaign created;
- audience snapshotted;
- campaign approved;
- campaign paused;
- campaign cancelled.

### Campaign analytics

`v_whatsapp_campaign_performance_v1`

Exposes:

- audience / eligible / excluded;
- queued / sent / delivered / read / replied / failed;
- delivery rate;
- read rate;
- reply rate.

No performance number is fabricated when no sends exist.

### Quick replies

`whatsapp_quick_replies`

Admins can maintain reusable human-agent replies such as `/fees`, `/dates`, or `/location`. The shared WhatsApp composer loads active quick replies through a tenant-bound authenticated API and inserts the selected response into the composer. It does not auto-send the response.

## Tenant and authorization boundary

New tables use organization-scoped RLS:

- organization members can read tenant records;
- organization admins can mutate operational configuration;
- service-role workers remain server-side;
- no client-supplied organization ID is treated as authorization.

The quick-reply endpoint resolves the active organization from the authenticated workspace on the server.

## Safety boundary

This checkpoint deliberately does not implement a direct broadcast provider sender.

Campaign-management actions must not:

- call `executePreparedWhatsAppProviderSend`;
- claim provider-send audits;
- set `provider_send_enabled=true`;
- set `autonomous_send_enabled=true`;
- bypass STOP suppression;
- bypass frequency caps;
- bypass template approval;
- bypass quiet hours or provider pilot controls.

A later controlled broadcast-runner checkpoint must reuse the existing provider policy/claim/audit path and re-check safety immediately before every recipient execution.

## Verification contract

`npm run verify:whatsapp-operations`

CI verifies:

- required schema and RLS contracts;
- tenant/admin boundaries;
- safe active-stage audience defaults;
- verified-primary WhatsApp and suppression filtering;
- campaign human-review marker;
- absence of direct provider execution from campaign management;
- WhatsApp Ops UI and navigation;
- tenant-bound quick-reply API;
- quick-reply integration with the existing Copilot-enabled inbox composer.

## Completion boundary

After this checkpoint merges and the schema is applied, the WATI/AiSensy-style **management layer** will exist, but full broadcast execution is not considered complete until a separate guarded runner proves:

1. per-recipient policy re-check;
2. suppression re-check;
3. approved-template re-check;
4. frequency-cap re-check;
5. quiet-hours re-check;
6. provider gate / pilot re-check;
7. idempotent provider send;
8. delivery/read reconciliation into campaign recipients;
9. inbound reply reconciliation into campaign recipients;
10. safe pause/cancel behavior while a campaign is running.

That runner must remain fail-closed by default.
