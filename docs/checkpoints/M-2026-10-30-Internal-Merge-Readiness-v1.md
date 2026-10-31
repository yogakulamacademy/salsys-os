# SalsysOS Internal Merge Readiness v1

Date: 2026-10-30
Branch: `phase-6a-violet-foundation`
Baseline head before this checkpoint: `2a710494d3476467aa3933b4eaee119a6c6c7e75`

## Decision

The SalsysOS release candidate is internally merge-ready from the application, migration, CI, permissions and preview-feedback perspectives.

Commerce is **not yet production-proven** because the external Yogakulam PHP host has not yet emitted a verified `payment.completed` + `enrollment.completed` pair in production.

This checkpoint does not merge `main` and does not promote any deployment to production.

## Branch state

- Base: `main`
- Branch: `phase-6a-violet-foundation`
- Ahead of `main`: 174 commits
- Behind `main`: 0 commits
- Merge base remains the current `main` head used for this release candidate.
- No mainline drift was detected at the time of this checkpoint.

## CI / preview state

- Latest release-candidate deployment for `2a710494d3476467aa3933b4eaee119a6c6c7e75`: Vercel `READY`.
- GitHub combined status: Vercel `success`.
- Unresolved Vercel preview-toolbar threads: 0.
- `verify:durable-event-ingestion`: PASS.
- `verify:sales-contracts`: PASS.

## Production migration alignment

Production Supabase project: `doaozrkrtgeslddwhclj` (`SalsysOS Production`).

Production migration history reaches the latest release migrations relevant to this branch, including:

- `20261030111609_payment_claim_and_verification_v1`
- `20261030112317_followups_expose_task_type_v1`
- `20261030141148_extend_system_recent_failures_with_raw_events`
- `20261030141233_surface_orphaned_trusted_event_projections`
- `20261030141930_add_commerce_event_readiness_v1`
- `20261030155113_harden_course_management_permissions`
- `20261030160208_include_owner_in_crm_admin_authority`

The historical local filenames for the first two migrations differ from their recorded production versions because those migrations were applied earlier under production-generated versions; the production schema/history is already at the intended state.

## Commerce baseline

Production durable-event baseline remains:

```text
booking.completed      14
payment.started         2
payment.completed       0
enrollment.completed    0
```

This confirms that the remaining commerce blocker is upstream of the Salsys projector: no verified completion event has yet reached production raw-event persistence.

## Commerce implementation already present in SalsysOS

- Payment projection and verification surfaces.
- Enrollment projection.
- Commerce event readiness telemetry.
- Direct UPI verified-completion adapter.
- Provider-neutral verified-payment enrollment adapter for PayPal/ICICI.
- Exact live Yogakulam PHP patch manifest.
- System Health visibility for raw-event failures/orphans.
- Customer 360 commerce journey surfaces.
- Revenue / attribution / funnel consumers.

## Historical integrity decisions already closed

### Booking dead letters

Two booking dead letters were investigated. They were near-duplicate reservation submissions from the same visitor/session with different booking references and no deterministic Lead/identity evidence. They remain preserved; no Lead was fabricated and no replay was forced.

### Orphaned booking projections

Three historical booking projections were investigated. Two reference a deleted historical Opportunity while the surviving Person only provides incomplete/unverified identity evidence; the third has no surviving deterministic relationship. They remain preserved as audit/integrity warnings rather than being automatically relinked.

## Remaining internal technical debt

### Team Performance duplicate page-level admin gate

`app/team-performance/layout.tsx` already enforces the canonical Owner/Admin workspace boundary via `requireAdminWorkspaceAccess()`.

`app/team-performance/page.tsx` still contains a legacy secondary `profiles.role === 'admin'` redirect. The exact cleanup has been mechanically validated as:

```diff
.select(
-  'role,active'
+  'active'
)

- if (
-   profile.role !==
-   'admin'
- ) {
-   redirect(
-     '/dashboard?restricted=1'
-   );
- }
```

This is redundant technical debt, not an active security boundary or merge blocker. The cleanup has not been pushed because safe large-file replacement cannot yet be guaranteed through the available connector path.

## External blocker before commerce can be called production-proven

The live Yogakulam PHP host must apply the already-documented completion wiring for:

1. PayPal verified success/capture handler.
2. ICICI authoritative verified return/callback handler.
3. Direct UPI admin verification handler.
4. Required server-only Salsys adapter includes and credentials.

Then one controlled verified transaction must prove:

```text
booking.completed
-> payment.started
-> payment.completed
-> enrollment.completed
```

and the downstream projections must show:

- one Payment with the stable payment reference;
- one Enrollment using `ENR-<booking_reference>`;
- no duplicate Payment/Enrollment on safe replay;
- revenue excluding processor surcharge;
- Customer 360 payment/enrollment journey;
- funnel/attribution visibility;
- no new System Health processing failure.

## Release interpretation

**Internal SalsysOS status:** merge-ready.

**Commerce status:** implementation-ready, externally blocked, not production-proven.

**Do not merge or promote solely on the basis of this checkpoint without an explicit release decision.**
