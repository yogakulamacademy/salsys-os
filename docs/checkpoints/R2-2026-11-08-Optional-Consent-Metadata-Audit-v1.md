# R2 — Optional analytics consent metadata audit (2026-11-08)

**Status:** Independent **read-only production metadata reconciliation**, NOT full consent/identity acceptance or production change. No additional paid staging was created.

## Scope and method

- A trusted operator may run `docs/sql/r2-optional-consent-metadata-audit-v1.sql` with a **privately verified authorized tenant** and `days=7|14|30` using a read-only SQL connection.
- Returns only UTC receipt-day × event-type aggregates and safe static event categories; never organization UUIDs, visitor/session/source IDs, URLs, contacts, event payloads, individual consent receipts or per-person journeys.
- Uses deployed `public.privacy_purpose_for_event_v1` to confirm that analytics events and **`web.form_submitted`** are classified differently. The latter maps to **`service_delivery`** and can legitimately lack optional analytics consent metadata.
- Bound to at most 50,000 examined events. Invalid windows, inconsistent source purpose classification and excess volume return explicit status. Optional analytics events without a granted **metadata snapshot** trigger `analytics_metadata_review_required` rather than `aggregate_metadata_only`. They are **not automatically actual consent violations**.
- No website tags, consent policies, source settings, RLS, user credentials, enrollment flow, customer data or production tables were modified.

## Actual production SELECT-only findings, Yogakulam Academy tenant

At the November 8, 2026 UTC afternoon snapshot (today incomplete), 7 UTC receipt dates November 2–8:

| Observation | Result |
|---|---:|
| Events in 11 allowlisted web event types | **3,229** |
| Events mapped to optional analytics | **3,156** |
| Analytics events without a `granted` metadata snapshot | **1** |
| Service-delivery form submissions without an analytics grant snapshot | **5** |
| Deployed expected-purpose mapping matches | **true** |
| Diagnostic final status | **analytics_metadata_review_required** |

The one analytics exception is a **November 5 `web.form_started` event** reporting legacy SDK `consent_mode='granted'` without an independently captured analytics grant metadata field. No identity, URL, session, consent receipt, source ID, event payload or form content was accessed. The SDK's `granted` mode can allow analytics by configuration; this historical metadata discrepancy therefore requires source/configuration review, **not a claim of a demonstrated unauthorized visitor event**.

For November 7–8, the audited received `web.session_started`, `web.page_viewed` and `web.form_started` events all carried reported analytics-granted snapshots. Five `web.form_submitted` records lacked them, which is consistent with the server's `service_delivery` mapping and the SDK's explicit necessary-form exception. All seven **new** R2-P1 optional collector event types were absent after the November 5 P1 contract release cutoff (previously verified, Issue #520), so this snapshot is **not** evidence of an actual pilot.

**Source classification:** `public.privacy_gate_tracking_event_v1` delegates to `public.privacy_purpose_for_event_v1` and `public.privacy_effective_permission_v1`; audit verified purpose mapping using read-only SQL. This source/metadata check is not a simulated authenticated browser role or legal compliance proof.

## Still required to close consent and all of R2

- Independent observation of the actual current website PHP/script/tag-manager installation and its consent settings, including whether every loader uses `required`.
- Real website Reject/withdraw/regrant, same/new tab, blocked storage and GPC with protected isolated form submission and correct tenant/source routing.
- Human review/disposition of the isolated historical `web.form_started` metadata exception if there is an authorized privacy investigation; no visitor record is to be exposed in an issue.
- P1 real consent-safe collector pilot; P2 authenticated owner/admin two-tenant UI/SQL acceptance; P3 mature verified D1/D7/D30 cohorts; reliability PR #659 approved release/post-release checks and human identity reconciliation remain independently open.

**Do not** mark #588, #531, #527 or full R2 closed from this metadata-only evidence. No additional paid staging, cloud project, live data write, tracker activation, website enrollment modification or external sends were authorized.
