# M-2026-10-20 — WhatsApp RPC Execution Hardening V1

## Reason

A post-migration permission audit found that several new `SECURITY DEFINER` helpers for the guarded WhatsApp broadcast runner and growth operations inherited Supabase/PostgreSQL function execution privileges for `PUBLIC` / `authenticated`.

The application itself still used these functions only from server-side admin/service-role code, and production send gates remained OFF, but the database permission boundary was broader than intended because these RPCs accept tenant/resource identifiers.

## Fix

`20261020103000_whatsapp_rpc_execution_hardening_v1.sql` explicitly revokes direct execution from:

- `PUBLIC`
- `anon`
- `authenticated`

for internal broadcast/growth policy, prepare, claim, rearm, resolution, experiment, campaign-validation and reply-routing helpers.

The runtime-required RPCs are explicitly granted to `service_role` only.

Trigger-only helper functions also have direct browser/user execution revoked. Their database triggers continue to execute normally.

## Preserved application behavior

This does not change:

- CRM tenant RLS;
- operator campaign creation;
- human campaign approval;
- the server-side broadcast runner;
- Meta provider execution;
- delivery/read/reply reconciliation;
- A/B assignment;
- template personalization;
- reply routing;
- campaign revenue/conversion read models.

The application server already uses the admin/service-role client for these internal RPCs.

## Safety posture

The migration does not open any send gate. Production remains expected to have:

- messaging policy OFF;
- autonomous send OFF;
- human approval required;
- provider send OFF;
- pilot mode ON;
- pilot maximum 1.

## Acceptance

Production acceptance requires a permission query confirming that the protected internal RPCs no longer expose execute privilege to `PUBLIC`, `anon`, or `authenticated`, while `service_role` retains execute permission.
