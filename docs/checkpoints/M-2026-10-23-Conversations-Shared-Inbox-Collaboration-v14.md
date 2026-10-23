# M-2026-10-23 — Conversations Shared Inbox + Collaboration V14

## Status

**MERGED AND DEPLOYED TO PRODUCTION — V14 production deployment verified READY.**

This checkpoint records the production state of the SalsysOS Conversations workspace after the V12 Inbox redesign, V13 team-operations layer, and V14 collaboration layer.

It supersedes the old preview-only Conversations prototype checkpoint as the current production evidence record for the Inbox experience. Historical preview checkpoints remain truthful evidence of their earlier state and should not be rewritten.

## Production references

- Repository: `yogakulamacademy/salsys-os`
- Production branch: `main`
- V12 Inbox redesign PR: #136
- V12 merge commit: `be252023ca6a35d7458513090bd3063bdd45cd3b`
- V13 team operations PR: #137
- V13 merge commit: `d1d13893cb3f42649b39c7a66dc7795ce0c615f6`
- V14 collaboration PR: #138
- V14 production merge commit: `fb02f28dd0667a757dbd144aa5ab99a6ce4e97f8`
- V14 production deployment: `dpl_BzTpgddz8UFmd2xy7XwMXJo8xzjZ`
- Production deployment state verified: **READY**
- V14 preview deployment: `dpl_9tpEfQ89u7U5eXQmmCnYaSvY2oWT` — **READY**
- Collaboration migration: `supabase/migrations/20261023181500_conversation_collaboration_v1.sql`

## Product model

The Conversations workspace is now a CRM-connected shared sales inbox rather than a message-only viewer.

Primary production layout:

`Inbox queue -> active conversation -> Customer context / collaboration`

The authoritative relationship remains:

`conversation -> lead -> CRM ownership -> customer journey / activity`

No parallel customer record or inbox-only ownership model was introduced.

## V12 — production Inbox redesign

V12 aligned the production Conversations UI with the approved three-column operational Inbox concept while preserving existing messaging behavior.

Implemented:

- wider, more readable Inbox queue;
- larger lead names, previews, statuses and timestamps;
- search and operational queue filtering;
- `All / Needs reply / Unread` filtering;
- priority filtering across `Urgent / High / Normal / Waiting`;
- improved selected/unread/needs-reply visual states;
- approximately 312px queue / flexible conversation / approximately 316px Customer context desktop geometry;
- Customer context naming and layout cleanup;
- larger Conversation / CRM Activity tabs;
- readable CRM activity timeline and context typography;
- responsive behavior that keeps Inbox-first mobile navigation and context-as-drawer behavior.

V12 deliberately did not replace the messaging backend.

Existing WhatsApp, Instagram, realtime, read-state, CRM activity, lead-update and AI/copilot behavior remained the source of truth.

## V13 — shared team operations

V13 moved the Inbox from a single-user queue toward a true team workspace.

Implemented queue scopes:

- `My Inbox`
- `Team`
- `Unassigned`

Implemented operational filters:

- `All`
- `Reply`
- `Unread`
- `Snoozed`
- priority filters remain independently combinable.

Implemented ownership behavior:

- owner is visible on conversation rows and selected Customer context;
- manager/admin assignment, reassignment and unassignment use the existing audited `assign_lead_owner` RPC;
- CRM lead ownership remains the canonical shared ownership state;
- open work stays synchronized through the existing assignment path rather than a new Inbox-specific owner table.

Implemented personal snooze behavior:

- 1 hour;
- 4 hours;
- tomorrow 09:00;
- next week 09:00;
- return to Inbox / unsnooze.

Important semantic rule:

**Snooze is personal Inbox state.** One salesperson snoozing a conversation does not hide the conversation from the team.

The persisted personal state is protected by RLS and lead access.

## V14 — collaboration layer

V14 adds team-awareness without changing the customer-message send path.

### Teammate presence / collision awareness

The Inbox now supports short-lived conversation presence heartbeats.

Purpose:

- show when another teammate is viewing the same lead/conversation;
- reduce duplicate replies and accidental collision;
- provide advisory awareness only — presence does not lock the conversation.

Presence is persisted in `conversation_presence` and is tenant/lead-access scoped through RLS.

### Internal notes + @mentions

Internal notes remain private CRM activity; they are never customer-visible messages.

V14 adds explicit teammate mentions on top of that existing note model.

- note creation still requires `can_work_lead()` authorization;
- mention targets are validated against active members of the current organization;
- mention notifications are stored in `conversation_mentions`;
- mention notifications are readable/updatable only by the mentioned user;
- note/mention failures do not bypass customer-message safety gates.

### Conversation response SLA

V14 introduces organization-level response SLA thresholds in `conversation_sla_settings`.

The model separates:

- warning threshold;
- breach threshold.

Managers/admins can configure these values. The Inbox can use them for consistent waiting/response-state presentation rather than hard-coded visual thresholds.

This is a conversation response SLA and is intentionally separate from existing pipeline stage-aging settings.

### Supervisor workload visibility

Supervisor assignment decisions now use the existing Team Performance evidence model rather than a new JavaScript-only score.

Relevant canonical workload evidence includes:

- current assigned leads;
- active leads;
- needs reply;
- overdue leads/tasks;
- never-contacted leads;
- high-intent leads;
- payment-pending leads;
- current action load.

This keeps Inbox balancing semantics aligned with Team Performance reporting.

## Existing message safety preserved

The Inbox enhancements do **not** weaken customer-message controls.

Still preserved:

- free-text WhatsApp replies only inside the authoritative service window;
- approved-template path when the WhatsApp service window is closed;
- provider connection / eligibility checks;
- Instagram provider semantics;
- human-reviewed AI/copilot drafts;
- AI does not autonomously send customer messages;
- message delivery/read state remains provider-backed where available;
- realtime conversation refresh remains advisory and does not authorize writes;
- lead mutations continue through existing CRM authorization boundaries.

## Security verification

The V14 collaboration migration creates:

- `conversation_presence`
- `conversation_mentions`
- `conversation_sla_settings`

RLS is enabled on all three tables.

Verified policy intent:

- users write/delete only their own presence heartbeat;
- presence visibility requires appropriate lead/organization access;
- mention notifications are visible/updatable only by the mentioned user;
- SLA settings are readable by organization members and writable only by authorized Sales managers/admins.

No new SECURITY DEFINER function was introduced by V14.

After the migration, the Supabase security advisor still reported the same pre-existing count of **67 authenticated SECURITY DEFINER warnings**. V14 introduced zero new findings in that category.

The separate `auth_leaked_password_protection` warning remains open and is not caused by this milestone.

## Database / authority decisions

These invariants are now explicit:

1. **Lead ownership is shared CRM state.**
2. **Inbox snooze is personal user state.**
3. **Internal notes are shared CRM activity, not customer messages.**
4. **Mentions are private collaboration notifications tied to internal-note activity.**
5. **Presence is advisory, short-lived collaboration state, not a lock or ownership authority.**
6. **Conversation SLA is organization configuration, separate from pipeline stage aging.**
7. **Supervisor workload reuses canonical Team Performance evidence.**
8. **Customer sending remains governed by provider/channel authorization and fail-closed policy.**

## Validation

V14 validation completed before merge:

- Universal Tracking contracts — passed;
- Tracking closeout contracts — passed;
- platform/web/WordPress adapter contracts — passed;
- Intelligence accuracy/freshness/calibration contracts — passed;
- Commercial Intelligence contracts — passed;
- WhatsApp Operations/Broadcast/Growth contracts — passed;
- Instagram Operations contracts — passed;
- CRM Core closeout contracts — passed;
- Customer 360 Identity closeout contracts — passed;
- TypeScript — passed;
- full Next.js production build — passed;
- Vercel preview — READY;
- production deployment for the merged V14 head — READY;
- Supabase RLS/policy inspection — passed for the new collaboration tables;
- Supabase security advisor — no new V14 privileged-function warning.

## What is built vs what is not claimed

Built and deployed:

- shared operational Inbox UI;
- ownership-aware team queues;
- personal snooze;
- CRM owner assignment/reassignment controls;
- internal notes;
- teammate @mentions;
- teammate presence/collision awareness;
- configurable response SLA thresholds;
- supervisor workload evidence;
- existing WhatsApp/Instagram/AI assistance integration.

Not claimed by this checkpoint:

- exhaustive multi-user browser E2E verification of every simultaneous presence/collision timing edge case;
- email as a fully connected bidirectional channel;
- website live chat as a fully connected realtime channel;
- hard conversation locking;
- autonomous AI replies;
- complete WhatsApp Operations/Growth broad-production closeout beyond the previously proven controlled paths.

## Recommended next Inbox work

The Inbox is now functionally mature enough that the next work should be evidence-driven rather than adding features by default.

Recommended next steps:

1. authenticated multi-user browser QA for presence/collision timing;
2. verify @mention creation/read-state across two separate users;
3. verify manager SLA edits affect waiting-state presentation as intended;
4. validate supervisor workload values against `/team-performance` for the same users;
5. verify assignment/reassignment from Inbox against CRM owner state and open tasks;
6. perform mobile/tablet QA after collaboration dock changes;
7. only then consider additional channels such as Email or Website Live Chat.

## Release boundary

This checkpoint records a **production-deployed product enhancement inside the already closed R3 CRM Sales Execution area**.

It does not reopen the R3 V1 integrity closeout and does not change the ordered active closeout target, which remains Universal Tracking live production proof.
