# M-2026-10-21 — Conversations Prototype QA V2

## Status

**ACTIVE PREVIEW — not merged to `main`.**

This delta checkpoint records the latest Conversations prototype-alignment pass after the broader CRM Operations Studio V1 checkpoint.

## Branch / preview

- Repository: `yogakulamacademy/salsys-os`
- Branch: `uiux/crm-operations-studio-v1`
- PR: #98
- Functional head: `8097144d81c8b9988845009c91eb57177ae7bb87`
- Vercel deployment: `dpl_8A2upaV56hWySgk6RVRxFr87jvqA`
- Preview: `https://salsys-ctc27zlhi-salsysos.vercel.app`
- Deployment state verified: **READY**
- Build compiled successfully and completed deployment output generation.
- Unauthenticated `/conversations` verification returns the sign-in page with `next=/conversations` and HTTP 200.

## Important mobile behavior correction

The optimized Conversations RPC intentionally selects the highest-priority lead when no explicit `lead` parameter is supplied. That behavior is useful on desktop, where the inbox and selected conversation are visible together, but it conflicted with the supplied mobile prototype: opening `/conversations` at `620px` and below should show the Inbox first, not silently jump into the server-selected conversation.

`ConversationWorkspaceShell` now distinguishes between:

- an authoritative server-selected conversation used by tablet/desktop, and
- an **explicit URL selection** (`?lead=...`) required to open the mobile conversation view.

Result:

- `/conversations` at <=620px shows Inbox.
- Selecting a row adds `?lead=...` and opens the conversation.
- Inbox remains available at `/conversations` even though the backend still prepares the highest-priority selected lead.
- The mobile Back action and Escape now return to a real Inbox state instead of routing to a URL that immediately reopened the auto-selected chat.
- `Alt+I` / `Alt+R` do not target a hidden auto-selected conversation while the mobile Inbox is the active view.
- Tablet/desktop behavior is unchanged: the backend-selected highest-priority conversation can still populate the visible workspace without requiring a URL selection.

## Prototype-alignment state carried into this head

- `/` focuses Inbox search when the operator is not editing another field.
- Inbox filters and Conversation/Activity/composer tabs support Arrow Left / Arrow Right / Home / End.
- `Alt+I` toggles Lead context; `Alt+R` focuses the visible reply draft.
- CRM Inspector becomes a drawer at `1170px` and below.
- CRM workspace navigation uses the compact presentation at `880px` and below.
- Inbox and conversation become separate mobile views at `620px` and below.
- Inspector drawer traps focus, closes with Escape and restores focus.
- Ctrl/Cmd + Enter saves drafts or private Internal notes; it does not send a customer message.
- Approved WhatsApp template forms suppress keyboard-Enter submission and require an explicit Send/Start button click.
- WhatsApp sending remains gated by authoritative provider/service-window/template state.
- Internal notes remain private CRM Activity records and Activity invalidates after in-place note writes.
- AI drafting remains human-reviewed and draft-only.

## Authentication evidence

Environment/project alignment was previously verified. The configured operator account exists, is confirmed, has an email/password credential and active Yogakulam admin membership. Earlier failed password-token requests correlated with Supabase upstream `502`/`504` responses, so current auth handling classifies these as transient service failures rather than claiming the password was rejected.

A real browser login on the current preview is still required before authentication is marked fully verified.

## Remaining verification

1. Sign in manually on the latest preview.
2. Perform authenticated desktop/tablet/mobile visual QA against the supplied Conversations prototype.
3. At <=620px verify `/conversations` opens Inbox, row selection opens chat, Back/Escape returns to Inbox, and hidden selected-lead controls cannot receive shortcuts.
4. Verify real message bubbles, selected-row density, Activity refresh, inspector density and composer states with CRM data.
5. Smoke-test Admissions, Leads, Pipeline and Follow-ups before any merge decision.

## Release boundary

PR #98 remains a preview branch change. Do not merge directly to `main` from this checkpoint and do not describe it as production-released.
