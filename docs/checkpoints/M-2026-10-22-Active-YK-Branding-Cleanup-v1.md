# M-2026-10-22 — Active YK Branding Cleanup V1

Status: READY FOR VALIDATION

## Goal

Remove Yogakulam-specific `yk` branding from active SalsysOS runtime contracts without rewriting historical migrations/checkpoints or breaking an already-installed legacy website script URL.

## Active runtime changes

- canonical workspace cookie renamed to `salsys-active-workspace`;
- legacy tracking API provenance fallback renamed from `yk_tracker` to `salsys_tracker`;
- Tracking UI examples now use `data-salsys-*`, `salsys:consent`, and `SalsysIntelligence`;
- the old `public/yogakulam-tracker.js` implementation is retired and replaced by a thin compatibility loader into `salsys-intelligence.js`;
- canonical Salsys form/event/consent naming remains the only forward-facing installation contract.

## Compatibility boundary

The `/yogakulam-tracker.js` URL remains temporarily public only so an older external Yogakulam page that still references that script does not fail with a 404. The file is no longer a separate tracking implementation. It maps established legacy markup/events into the canonical Salsys SDK and then loads `salsys-intelligence.js`.

This compatibility URL can be deleted after the live Yogakulam site has been confirmed to load `salsys-intelligence.js` directly.

## Historical evidence

Do not rewrite old migrations or historical checkpoint documents that contain `yk_*` names. They are evidence of the implementation state at that point in time and are not the current runtime contract.

## Current canonical naming

- `salsys_visitor_id`
- `salsys_session_id`
- `salsys_first_touch`
- `salsys_session_touch`
- `data-salsys-lead-form`
- `data-salsys-track`
- `data-salsys-event`
- `salsys:consent`
- `SalsysIntelligence`
- `salsys_tracking_ready`
- `salsys-active-workspace`

## Remaining cutover proof

Before deleting the compatibility URL, prove the live Yogakulam website uses the canonical Salsys installation and successfully completes a real browser -> enquiry -> CRM identity journey.
