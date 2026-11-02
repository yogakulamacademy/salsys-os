# SalsysOS shared UI contract

This implementation extends the existing SalsysOS interface. It uses the supplied visual references as direction: pale neutral canvas, white panels, restrained violet actions, thin borders and illustrated empty states. SalsysOS keeps its own identity and existing authorization boundaries.

## Shared foundations

- Use `app/salsys-violet-theme.css` for product colors, neutral surfaces, text, borders and radii. Older `--salsys-*` variables resolve to these canonical tokens.
- Use `BrandMark` / `BrandIdentity` from `components/brand.tsx` for product identity. Organization logos and contact avatars are separate identities.
- Use `EmptyState` from `components/ui.tsx` and the original inline `EmptyArtwork` variants. Preserve the relevant search, filters and table headers around list empty states.
- Use `useModalFocus` for the metric investigator, lead inspector, command search and mobile navigation. It manages focus, Escape, background inertness and restoration. Do not add another body-scroll lock to the same modal.
- Keep success, warning and error colors semantic. Green is a recorded success or verified condition, not a competing product brand.
- Respect reduced-motion settings; animation must not be required to understand state.

## Screen rules

| Destination | Primary presentation |
| --- | --- |
| Inbox, no selection | Bounded conversation list plus a centered “Select a conversation” illustration; no dashboard statistic cards. |
| Inbox, empty result | Keep search and filters, state that the result is filtered, and offer reset. Distinguish this from no conversations in the workspace. |
| Inbox, selected | Conversation plus optional customer context. Hiding context must reclaim its column. On smaller screens, open context as a drawer. |
| Leads | The work queue appears before assignment and booking summaries. An empty result retains column headers and offers clear filters. |
| Customer 360 | Preserve the table structure; explain an empty list and provide an appropriate next step. |
| Home, Marketing, Revenue | Use shared panels and typography. State the period, population and evidence limits; do not imply that separate cohorts form a conversion rate or ROAS. |
| Settings, Automations | Use the same controls and panel language. Integration actions link to their actual Settings home. |
| Login and recovery | Use the shared SalsysOS mark and product identity. |

## Data presentation

- Use `percentageWidth` for quantitative bars: a real zero has zero width, and unknown or invalid inputs cannot create a positive bar.
- Use grapheme-aware initials so emoji and combining characters remain complete.
- Source aliases are display labels only. Preserve raw values and do not silently combine attribution totals.
- Lead-list contacts come from `get_admissions_lead_contacts_secure` for visible lead IDs. Keep its masking. Missing authorized contact, restricted access and read failure have different labels. Never fall back to raw overview contacts after a secure-read failure.
- Deterministic pipeline weights are calculated planning values. They are not learned probabilities.
- Withhold marketing ROAS until spend and attributed outcomes share a supported cohort. Sessions are not ad clicks.

## Verification

```sh
npm ci
npm run typecheck
npm run test:ui:unit
npx playwright install --with-deps --only-shell chromium
npm run test:ui
npm run build
```

The browser suite starts a loopback-only synthetic read service and a local Next development server. It exercises the existing middleware and layouts using an entirely synthetic session. No production account, provider send, migration, organization creation or database write is needed. Generated screenshots and traces are under `test-results/` and ignored by Git.

Screens exercised: Inbox, Leads, Home, Marketing, Revenue, Performance, Automations and Settings overview. The Inbox is checked at 390, 768, 1254 and 1440 pixels; core destinations are checked at 390, 768 and 1440 pixels. Interaction checks cover context-column reclamation, a narrow-screen context drawer, filter reset, metric focus trapping/restoration, backdrop dismissal, command search and dark mode.

These are local synthetic acceptance checks, not proof of production database policies, provider availability, real message delivery or complete accessibility conformance. Before merging, inspect the actual preview with the organization's normal user roles and confirm masked-contact behavior against the deployed secure RPC. Do not use the synthetic service outside local/CI testing.

## Working alongside another developer

Keep this work on its feature branch and isolated checkout. Other work is preserved on its own branch. Compare with the latest main branch before merging; resolve any overlapping edits explicitly. A separate checkout prevents working-file interference, but it does not eliminate merge conflicts.

The broader attribution, journey, SEO and AI expansion remains deferred until UI fixes are accepted. This document does not replace Master Context v1.2 or change SalsysOS's vertical strategy and roadmaps.
