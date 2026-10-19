# SalsysOS — Smart Triggers + WhatsApp Runtime Promotion

**Date:** 2026-10-19  
**Branch:** `feature/smart-triggers-whatsapp-runtime-main-20261019`  
**Pull request:** #34 — `Promote Smart Triggers + WhatsApp runtime to main`  
**Base:** production `main` at `730f51cde695dbf3881336a45ca2ca6734f6420c`  
**Status:** **RUNTIME PROMOTION READY — CUSTOMER SENDS REMAIN OFF**

## Purpose

Promote the validated Smart Triggers / Conversation Flow and WhatsApp runtime source onto the current production source line while preserving the existing production database and all messaging kill switches.

This is intentionally a runtime-only promotion. Historical Smart Trigger migration files are excluded because their source timestamps do not consistently match the versions already recorded in production Supabase. Production already contains the required Smart Trigger / WhatsApp schema, RPCs and triggers; migration-history normalization will be handled separately rather than risking duplicate application.

## Runtime source included

- `/automation` workspace;
- draft workflow actions;
- Conversation Flow Builder;
- human approval queue and approval decision API;
- protected runtime scheduler API;
- scheduler/runtime workers;
- WhatsApp template synchronization;
- guarded Meta WhatsApp provider-send adapter;
- current-main middleware integration for the scheduler service path.

The tenant-specific hard-coded controlled-pilot shortcut is not included.

## Production safety state verified before promotion

### Scheduler

- application scheduler setting: **OFF**;
- scheduler pg_cron infrastructure: active;
- 30/30 observed cron executions succeeded during a 30-minute verification window;
- while disabled, scheduler invocation produced no runtime HTTP request;
- the application runtime remains fail-closed unless `AUTOMATION_SCHEDULER_ENABLED=true`;
- no production-wide `AUTOMATION_SCHEDULER_ENABLED=true` configuration was identified.

### WhatsApp messaging

- base messaging policy: **OFF**;
- autonomous send: **OFF**;
- human approval: **required**;
- provider send: **OFF**;
- pilot mode: enabled but no pilot lead selected;
- pilot maximum: `1` message;
- verified primary WhatsApp contact required.

### Message caps

- max messages / 24 hours: `3`;
- max messages / 7 days: `8`;
- minimum gap: `30 minutes`.

### Provider-backed template registry

Observed before promotion:

- approved + active: `44`;
- approved + inactive: `13`;
- pending + inactive: `8`;
- rejected + inactive: `5`;
- successful template sync runs: `1`.

## No-send production E2E proofs

All mutation-based tests were transactional and rolled back. No provider HTTP send occurred.

1. **Base policy block** — send denied with `policy_disabled`, `autonomous_send_disabled`, and `human_approval_required`.
2. **Suppression** — active WhatsApp suppression caused `send_allowed=false`.
3. **STOP / opt-out** — temporary inbound `STOP` created a `customer_opt_out` suppression and blocked sending.
4. **Frequency cap** — after three temporary outbound ledger rows in 24h, policy returned `frequency_limited=true` and `frequency_cap_reached`.
5. **Provider claim recheck** — a provider audit already in `ready` state was still rejected by `claim_whatsapp_provider_send_v1` while policy was OFF.
6. **Scheduler inert proof** — disabled scheduler returned disabled state and created no runtime request.
7. **Runtime wiring** — one lead-created emitter, one message-received emitter and one opt-out trigger were verified in production.

At the end of verification, `automation_provider_send_audits.customer_message_sent=true` count remained **0**.

## Human approval boundary

The promoted approval path preserves the following order:

1. authenticated same-origin request;
2. tenant/user authorization;
3. explicit human approve/reject decision;
4. provider preparation through policy-aware RPC;
5. final provider claim rechecks messaging/channel policy;
6. provider execution only if all gates allow it;
7. canonical outbound/audit completion after a successful provider response.

Human approval therefore does not bypass the provider kill switch.

## Production deployment gate

Merging this runtime source is safe from a customer-messaging standpoint because the production policies remain OFF and the scheduler/provider code fails closed.

After merge and production deployment we must re-check:

- deployment is READY;
- production scheduler route exists;
- scheduler remains disabled;
- provider send remains disabled;
- autonomous send remains disabled;
- customer-message audit count remains 0.

## Final live E2E gate

A complete live-send E2E requires exactly one approved template message to one verified pilot lead through the standard approval/provider path, then verification of provider ID, canonical outbound message, delivery/status evidence where available, and reply/opt-out behavior.

That irreversible customer send is **not part of this runtime promotion** and must only be performed after a fresh explicit approval at the actual send step.

## Conclusion

**Runtime source promotion readiness: PASS.**  
**Production no-send safety: PASS.**  
**Live WhatsApp provider send: NOT YET RUN.**
