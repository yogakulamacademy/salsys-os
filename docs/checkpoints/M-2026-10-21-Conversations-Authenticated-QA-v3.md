# M-2026-10-21 — Conversations Authenticated QA V3

## Status

**ACTIVE PREVIEW — not merged to `main`.**

This checkpoint records the authenticated visual QA follow-up after the user successfully signed into the CRM Operations Studio preview and supplied desktop/mobile screenshots of `/conversations`.

## Branch / preview

- Repository: `yogakulamacademy/salsys-os`
- Branch: `uiux/crm-operations-studio-v1`
- PR: #98
- Latest functional head: `394197d3f7186a53264a2c97b78d46ea50c8f9fa`
- Vercel deployment: `dpl_DqpXqjidTwkXdAedSJBr4zYoeGA8`
- Preview: `https://salsys-4l36qvnyp-salsysos.vercel.app`
- Deployment state: **READY**
- Build completed successfully after compilation, type validation, static-page generation and output deployment.

## Authenticated QA confirmed

The supplied screenshots verify successful browser authentication and live CRM rendering on both desktop and mobile.

Observed working states:

- Desktop 3-pane Inbox / Conversation / Lead Context layout.
- Mobile Inbox-first layout at narrow width.
- Explicit lead selection opens the dedicated mobile conversation view.
- Mobile Inbox back navigation is present.
- Needs reply / Unread / Priority summary evidence renders from CRM state.
- WhatsApp disconnected-state warning is visible and separate from website inquiry state.
- Conversation / Activity tabs render.
- Lead origin, real inquiry message, course guidance and safe composer render.
- Lead context shows country, course, source, current channel and last-contacted evidence.

## Fixes added after screenshot review

### Mobile selection truth

The backend intentionally preselects the highest-priority lead for desktop. That server selection was still being painted as a selected green Inbox row on mobile before the user explicitly opened a conversation.

The mobile Inbox now suppresses that phantom selected state until `?lead=` explicitly identifies the opened conversation. Desktop auto-selection remains unchanged.

### CRM realtime wording

The global realtime indicator previously said `Live sync`, which could be misread as evidence that WhatsApp/provider delivery was connected while the page simultaneously showed `WhatsApp connection required`.

The indicator is now scoped to `CRM realtime` / `CRM reconnecting…`, with accessible copy stating that it only reflects CRM record realtime state and does not represent WhatsApp connection or message-delivery status.

### Inspector drawer containment

The tablet/mobile Lead Context drawer already trapped keyboard focus, closed with Escape and restored focus to its trigger. It now also locks background page scrolling while the modal drawer is open and restores the previous body overflow state when closed.

## Runtime evidence and performance guard

Vercel Preview runtime logs for the authenticated screenshot session recorded degraded Person 360 reads on the Lead Inspector endpoint:

- `GET /api/leads/<lead>/inspector`
- `Person 360 read degraded: canceling statement due to statement timeout`

Person 360 / canonical journey are derived enrichment, not the authorization or transactional source of truth. The adapter already degraded these reads without taking down the Lead record, but the database statement could still delay the Inspector before fallback was visible.

The latest functional head now places a soft latency ceiling around these non-authoritative reads:

- Person 360: 2.5 seconds
- Person journey: 2.5 seconds
- targeted latest-lead journey signal: 2.0 seconds

Authentication, active-organization resolution, `can_access_lead`, Lead authorization and lead-to-person binding remain outside these soft timeouts and continue to fail closed. The change only prevents optional derived intelligence from holding the operational Inspector in a long loading state.

## Interaction verification still required

1. Confirm the latest mobile Inbox no longer highlights a lead until the user taps it.
2. Open and close Lead Context on mobile/tablet; verify background does not scroll, Escape closes it and focus returns correctly.
3. Switch Conversation -> Activity, add an Internal note, and confirm Activity refreshes with the new record.
4. Type a Reply draft, navigate away/back and refresh; confirm the draft remains in browser storage and is never interpreted as sent.
5. Confirm Inbox Intelligence reaches either real intelligence or an explicit degraded/empty state promptly rather than staying in a long loading state.
6. Validate a real connected WhatsApp conversation later, including service-window and approved-template gating, without autonomous sending.
7. Authenticated smoke-test Admissions, Leads, Pipeline and Follow-ups before merge.

## Release boundary

PR #98 still targets `uiux/salsysos-experience-v1`, not `main`. Production remains unchanged.
