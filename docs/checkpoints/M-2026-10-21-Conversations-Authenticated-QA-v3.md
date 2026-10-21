# M-2026-10-21 — Conversations Authenticated QA V3

## Status

**ACTIVE PREVIEW — not merged to `main`.**

This checkpoint records the authenticated visual QA follow-up after the user successfully signed into the CRM Operations Studio preview and supplied desktop/mobile screenshots of `/conversations`.

## Branch / preview

- Repository: `yogakulamacademy/salsys-os`
- Branch: `uiux/crm-operations-studio-v1`
- PR: #98
- Functional head: `5e1f200636e9dfcf7362c02426d1d38c76292ef0`
- Vercel deployment: `dpl_57Cp89TDUSo1V6XCwRT8KTecBxie`
- Preview: `https://salsys-7aonf07h4-salsysos.vercel.app`
- Deployment state: **READY**
- Build compiled successfully, passed type checking and generated all 53 static pages.

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

## Runtime evidence found during QA

Vercel Preview runtime logs for the authenticated screenshot session recorded degraded Person 360 reads on the Lead Inspector endpoint:

- `GET /api/leads/<lead>/inspector`
- `Person 360 read degraded: canceling statement due to statement timeout`

The Lead Inspector data adapter already treats Person 360 / journey as non-authoritative enrichment and degrades those reads rather than taking down the Lead record. However, the expensive Person 360 statement can still delay the Inbox Intelligence request before the graceful fallback becomes visible. This is now a performance follow-up, not a data-truth or authorization failure.

## Interaction verification still required

1. Confirm the latest mobile Inbox no longer highlights a lead until the user taps it.
2. Open and close Lead Context on mobile/tablet; verify background does not scroll, Escape closes it and focus returns correctly.
3. Switch Conversation -> Activity, add an Internal note, and confirm Activity refreshes with the new record.
4. Type a Reply draft, navigate away/back and refresh; confirm the draft remains in browser storage and is never interpreted as sent.
5. Validate a real connected WhatsApp conversation later, including service-window and approved-template gating, without autonomous sending.
6. Authenticated smoke-test Admissions, Leads, Pipeline and Follow-ups before merge.

## Release boundary

PR #98 still targets `uiux/salsysos-experience-v1`, not `main`. Production remains unchanged.
