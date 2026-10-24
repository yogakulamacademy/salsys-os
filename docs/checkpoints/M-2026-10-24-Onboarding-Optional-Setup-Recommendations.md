# M-2026-10-24 — Optional Onboarding Setup + Home Recommendations

## Scope

SalsysOS onboarding now distinguishes between the minimum information required to enter the product and recommended setup that can be completed later.

## Required onboarding

- Business profile
- Goals / priorities

## Recommended setup

- Healthy website tracking
- Connected customer channels
- Active team access
- First automation workflow

Recommended steps may be skipped during onboarding. Skipping advances the onboarding flow but does not mark the skipped step complete.

## Home behavior

After a workspace completes the new onboarding flow, Home shows `Finish setting up SalsysOS` recommendations for unfinished setup. Recommendations are derived from live tenant evidence:

- Website: healthy website source with accepted tracking evidence
- Channels: connected integration connection
- Team: active admissions membership/profile
- Automation: at least one non-archived automation workflow

A recommendation disappears automatically when its underlying evidence becomes ready.

Legacy organizations without a completed `organization_onboarding` record do not receive this recommendation layer.

## Safety boundaries

- No skipped step is written into `completed_steps`.
- No customer messaging, publishing, budget changes or automations are activated by onboarding.
- Tenant identity continues to come from the authenticated active organization.
- Recommendation evidence reads are organization-scoped.
