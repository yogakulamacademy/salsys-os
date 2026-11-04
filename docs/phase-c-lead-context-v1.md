# Phase C / C1 — Lead Context Builder (read-only foundation)

## Scope

Adds `getLeadContextV1(leadId, audience)` in `lib/ai/lead-context.ts`.
This is an **evidence bundle**, not a generated conclusion or a trained model.
There are no database migrations, automatic messages, lead-stage changes,
payment updates, model calls, or new public API routes in C1.

The existing Claude Co-Pilot is intentionally left functionally unchanged,
except its customer-facing prompts no longer retrieve or contain internal
lead summaries and private staff notes.

## Sources, bounds, and evidence

| Source | Boundary | Evidence reference |
| --- | --- | --- |
| Parent lead | active organization + authorized lead | canonical lead ID |
| Conversations | latest 20 in active organization | conversation IDs retained with messages |
| Messages | latest 100 across authorized threads | `message:<uuid>` |
| Staff activities | latest 30 for authorized lead | `activity:<uuid>` |
| Follow-up tasks | latest 30, organization + lead | `task:<uuid>` |
| Stage history | latest 30 for authorized lead | `stage_change:<uuid>` |
| Payment records | latest 30, organization + lead | `payment:<uuid>` |

`activities` and `lead_stage_history` are legacy lead-keyed tables without
an organization ID. They are only queried **after** the active workspace's
organization ID and parent lead access have been verified. Do not use them as
global or unscoped materialized AI context.

Missing/inaccessible leads return `null`. A failed required history query
throws instead of appearing as an empty lead history. IDs and timestamps are
retained as evidence. Raw provider metadata, access tokens, customer contact
details, attachment URLs, internal authorization state, and payment provider
references are not included.

## Audience separation

- `staff_insight`: authorized internal-only summaries, private notes,
  activities, tasks, stage changes and recorded payments. This must **not**
  be serialized directly into a customer-facing prompt.
- `customer_draft`: bounded conversation messages and non-sensitive lead
  preferences only. Explicitly excludes private notes, staff summaries,
  activities, tasks, stage reasons and payments.

Customer messages and notes are untrusted content and must never override
model instructions or the server's action policy.

A recorded `payments.status` is not automatically a verified settlement:
recorded statuses are labeled `recorded_status_only`. Do not compute net
revenue or promise enrollment from this snapshot.

## Acceptance gate for C1

1. Unit tests: denied user or lead never reaches admin queries.
2. Parent organization mismatch prevents all related data retrieval.
3. All tenant-aware child queries filter both organization and lead.
4. Customer draft excludes private summaries, notes and financial records.
5. Staff bundle has source IDs and event times for each evidence item.
6. Failed source query fails closed; never silently implies zero history.
7. Existing Co-Pilot grounding tests and CI build still pass.

## Next controlled checkpoints

- **C2:** Evidence-validated, structured AI insight generation for staff,
  with confidence/uncertainty labels and an explicit `unknown` outcome.
  Do not make customer replies or pipeline changes automatically.
- **C3:** Staff feedback and adjudication tied to context/version/evidence;
  store no unnecessary raw message text. Validate role permissions and
  prompt-injection behavior.
- **C4:** UI integration in the existing Customer 360 and Inbox intelligence
  panels, with source navigation, refresh-on-change, stale-state labeling and
  human approval. Recheck data minimization and provider configuration.

Only subsequent approved phases can enable any autonomous action.
