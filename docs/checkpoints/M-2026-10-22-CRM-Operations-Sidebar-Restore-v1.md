# CRM Operations Sidebar Restore — 2026-10-22

## Scope

Restore the CRM Operations secondary navigation as a persistent desktop/tablet sidebar while preserving the existing mobile collapsed control.

## Change

- CRM Operations sidebar becomes visible from 768px available workspace width instead of 881px.
- CRM workspace grid allocates its 220px secondary navigation column from the same 768px breakpoint.
- Mobile widths below 768px retain the compact disclosure navigation.

## Safety

- No CRM data queries, mutations, authorization, tracking, realtime subscriptions, or database behavior are changed.
- The performance/realtime optimization already on `main` remains untouched.
