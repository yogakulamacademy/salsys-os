# SalsysOS — Smart Triggers + WhatsApp E2E No-Send Proof

**Date:** 2026-10-19  
**Branch:** `feature/smart-triggers-whatsapp-e2e-20261019`  
**Base:** production `main` at `730f51cde695dbf3881336a45ca2ca6734f6420c`  
**Pull request:** #33 — `Smart Triggers + WhatsApp end-to-end productionization`  
**Status:** **NO-SEND SAFETY + SOURCE-PROMOTION CHECKPOINT PASS**

## Goal

Promote the already-built Smart Triggers / Conversation Flow and WhatsApp automation runtime onto the current production source line without enabling autonomous customer messaging, then re-prove the fail-closed safety controls against the production database before any real customer send is considered.

The target architecture is:

`trigger → conditions → flow node → wait/branch → human approval / permitted action → WhatsApp provider boundary → canonical CRM message → reply/opt-out → stop/suppress → measurement`

WhatsApp is one execution channel. PostgreSQL/CRM remains source of truth, and automation must remain tenant-scoped and auditable.

## Source promoted onto the current main line

The clean branch selectively promotes:

- `/automation` workspace and draft workflow actions;
- Conversation Flow Builder source;
- human approval review UI and decision API;
- protected runtime scheduler API;
- scheduler/runtime workers;
- WhatsApp template registry/sync integration source;
- guarded Meta WhatsApp provider-send adapter;
- canonical provider audit / outbound recording support;
- source-control parity for the Smart Trigger / WhatsApp migrations already present in production;
- existing Smart Trigger checkpoint/checklist documentation.

The broad historical Smart Trigger branches were **not** merged wholesale.

A legacy hard-coded controlled-pilot route was deliberately removed from the clean branch. Any future live pilot must go through the standard human-approval + provider-policy boundary rather than through a tenant-specific shortcut.

## Build / preview verification

Latest Vercel Preview for the branch:

- deployment: `dpl_54jjbNfBDe5Crg2i1LCeSDcGcBXV`
- commit: `4ca9c80fca9a5c555d398ae315df47b5d55e3489`
- commit message: `Remove hardcoded controlled WhatsApp pilot route`
- state: **READY**

Earlier branch source-promotion and middleware-integration previews were also READY.

The preview remains protected by Vercel Authentication. We did not weaken deployment protection merely to make an external verifier reach the scheduler route.

## Production database / runtime inventory

Verified production Smart Trigger tables include workflow, trigger, condition, action, event, run, action-run, enrollment, suppression, scheduled-job, flow graph/version, messaging-policy, provider-send, approval, WhatsApp-template and scheduler-control tables.

Verified production trigger/runtime wiring:

- lead-created automation emitter trigger: `1`
- message-received automation emitter trigger: `1`
- customer opt-out trigger: `1`
- scheduler cron job `salsys-automation-runtime-scheduler-v1`: `1`
- cron job itself: active
- application scheduler setting: **disabled**

The one-minute pg_cron infrastructure was observed succeeding 30/30 times during a 30-minute verification window while the application scheduler remained disabled. Therefore the scheduling infrastructure is alive, while business execution remains fail-closed.

## Current production safety posture

### Scheduler

- DB application setting: `enabled=false`
- scheduler endpoint configured
- global application runtime remains fail-closed unless `AUTOMATION_SCHEDULER_ENABLED=true`
- no production-wide `AUTOMATION_SCHEDULER_ENABLED=true` configuration was identified

### WhatsApp messaging policy

Current verified policy state:

- policy enabled: **false**
- autonomous send enabled: **false**
- human approval required: **true**
- max messages / 24h: `3`
- max messages / 7d: `8`
- minimum gap: `30 minutes`

### Provider boundary

- provider: Meta Cloud API
- provider send enabled: **false**
- pilot mode enabled: true
- pilot lead selected: **false**
- pilot max messages: `1`
- verified primary WhatsApp contact required: true

### WhatsApp template registry

Observed registry state at this checkpoint:

- approved + active: `44`
- approved + inactive: `13`
- pending + inactive: `8`
- rejected + inactive: `5`
- successful template-sync runs: `1`

No template approval status is fabricated by SalsysOS; the registry reflects provider-backed state.

## Transactional production no-send proofs

All mutation-based verification below was executed inside database transactions and rolled back. No provider HTTP send was executed.

### 1. Base policy block

For a real tenant-scoped WhatsApp lead, `evaluate_automation_send_policy_v2` returned:

- `send_allowed=false`
- `policy_disabled`
- `autonomous_send_disabled`
- `human_approval_required`

The channel policy resolver independently agreed that the provider call was not allowed.

### 2. Explicit suppression

A temporary WhatsApp messaging suppression was inserted transactionally.

Observed:

- `suppressed=true`
- `send_allowed=false`
- block reasons included `suppressed`
- provider customer-message count stayed `0`

The transaction was rolled back.

### 3. Frequency cap

Three temporary outbound ledger messages were inserted transactionally without provider calls.

Observed:

- `messages_24h=3`
- `max_messages_24h=3`
- `frequency_limited=true`
- `send_allowed=false`
- block reasons included `frequency_cap_reached`
- provider customer-message count stayed `0`

The transaction was rolled back.

### 4. Customer STOP / opt-out

A temporary inbound WhatsApp `STOP` message was inserted transactionally.

The database opt-out trigger automatically created an active `customer_opt_out` suppression.

Observed afterward:

- opt-out suppression created: true
- `send_allowed=false`
- block reasons included `suppressed`
- provider customer-message count stayed `0`

The transaction was rolled back.

This proves the current database path can stop automated messaging when the lead opts out.

### 5. Provider claim recheck

An existing unsent provider audit row in `ready` state was passed through `claim_whatsapp_provider_send_v1` transactionally.

Observed:

- `claimed=false`
- status: `blocked`
- reason: `policy_recheck_blocked`
- `policy_send_allowed=false`
- `provider_call_allowed=false`
- `customer_message_sent=false`

The transaction was rolled back.

This is important: even a provider audit that has already reached `ready` cannot cross the final send boundary while the base policy is disabled.

### 6. Scheduler inert proof

`invoke_automation_runtime_scheduler_v1()` was called transactionally while the application scheduler was disabled.

Observed:

- application setting remained disabled
- outcome: `disabled`
- no HTTP request ID was queued

The transaction was rolled back.

## Customer-message proof

At the end of this checkpoint:

`automation_provider_send_audits.customer_message_sent = true` count: **0**

Therefore this checkpoint did not send an automated WhatsApp message to any customer.

## Human-approval boundary

The promoted approval API preserves these controls:

1. authenticated same-origin request;
2. tenant/user authorization;
3. explicit approve/reject decision recorded in the database;
4. approval does not override provider/messaging policy;
5. approved send is prepared through the provider-policy RPC;
6. provider execution occurs only when the final policy gate allows it;
7. successful sends are completed into the canonical outbound/audit path.

A human approval therefore cannot bypass the provider kill switch.

## What is now proven

- Smart Trigger database/runtime foundation exists in production;
- production event emitters exist for lead-created and message-received paths;
- published-flow runtime is pinned/versioned and tenant-scoped;
- scheduler infrastructure is alive;
- scheduler business execution is currently disabled;
- suppression blocks sends;
- customer STOP creates suppression;
- frequency caps block sends;
- human approval remains required;
- provider send is separately kill-switched;
- provider claim rechecks policy before execution;
- Meta WhatsApp template registry is populated with real approval state;
- selective source promotion builds successfully from current `main`;
- no customer message was sent during this verification.

## What is intentionally not yet claimed

This checkpoint does **not** claim a completed live-send E2E.

The final irreversible production proof still requires exactly one explicitly approved live WhatsApp pilot message to one verified pilot lead through the standard approval/provider path, followed by provider/canonical-message verification and, where practical, reply/STOP handling verification.

That live send must not be performed merely because the code is ready. It requires an explicit go-ahead at the actual send step.

## Remaining steps before full live E2E sign-off

1. merge/deploy the selectively promoted source after PR validation;
2. re-check the production scheduler route remains disabled/fail-closed after deployment;
3. keep provider send and autonomous messaging disabled by default;
4. select one verified pilot lead only when an explicit live-pilot approval is given;
5. use one approved WhatsApp template;
6. pass the human approval boundary;
7. permit at most one provider send;
8. verify provider message ID / canonical outbound record / send audit;
9. verify the stop-on-reply / opt-out behavior as applicable;
10. restore all pilot/provider/autonomous switches to the safe OFF state.

## Current conclusion

**Smart Triggers + WhatsApp no-send production safety: PASS.**

**Source-promotion preview build: PASS.**

**Live provider-send E2E: NOT YET RUN.**

The system is ready to advance to production source deployment while retaining all customer-send kill switches.