# M-2026-10-24 — Onboarding Optional-Step Routing Fix

## Scope
- Website remains optional during onboarding.
- Channels and Team are reachable even when Website was skipped.
- Skipped Website is not marked complete.
- Channels progress rail reads actual completed steps instead of assuming Website completion.
- CI protects against reintroducing the old Website-completion guards.

## Safety
- Business and Goals remain the only hard onboarding requirements.
- No integration, messaging, publishing, automation or budget action is activated by skipping.
- Tenant boundaries and existing onboarding enforcement remain unchanged.
