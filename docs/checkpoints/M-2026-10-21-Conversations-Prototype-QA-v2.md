# M-2026-10-21 — Conversations Prototype QA V2

## Status

**ACTIVE PREVIEW — not merged to `main`.**

This delta checkpoint records the latest Conversations prototype-alignment pass after the broader CRM Operations Studio V1 checkpoint.

## Branch / preview

- Repository: `yogakulamacademy/salsys-os`
- Branch: `uiux/crm-operations-studio-v1`
- PR: #98
- Latest functional head: `e93e15daedd442425f797c85027276e8a48efba0`
- Latest Vercel deployment: `dpl_8RHQTuqaSZb29fVtjWZtsTcDfGxp`
- Preview: `https://salsys-dp9da1yez-salsysos.vercel.app`
- Deployment state verified: **READY**
- The latest build completed successfully on Vercel.

## Authentication verification

Preview authentication is now **browser-verified**.

The user successfully signed in with the configured SalsysOS operator account and supplied authenticated screenshots of `/conversations` showing live CRM data in desktop and mobile layouts. This clears the earlier preview-login blocker.

Earlier failed password-token requests had correlated with Supabase upstream `502`/`504` responses. Environment/project alignment, account existence, email confirmation, email/password credential presence and active Yogakulam admin membership had already been independently verified before this browser success.

## Important mobile behavior corrections

The optimized Conversations RPC intentionally selects the highest-priority lead when no explicit `lead` parameter is supplied. That behavior is useful on desktop, where the inbox and selected conversation are visible together, but it conflicted with the supplied mobile prototype: opening `/conversations` at `620px` and below should show the Inbox first, not silently jump into the server-selected conversation.

`ConversationWorkspaceShell` now distinguishes between:

- an authoritative server-selected conversation used by tablet/desktop, and
- an **explicit URL selection** (`?lead=...`) required to open the mobile conversation view.

Result:

- `/conversations` at <=620px shows Inbox.
- Selecting a row adds `?lead=...` and opens the conversation.
- Inbox remains available at `/conversations` even though the backend still prepares the highest-priority selected lead.
- The mobile Back action and Escape return to a real Inbox state instead of routing to a URL that immediately reopened the auto-selected chat.
- `Alt+I` / `Alt+R` do not target a hidden auto-selected conversation while the mobile Inbox is the active view.
- Tablet/desktop behavior is unchanged: the backend-selected highest-priority conversation can still populate the visible workspace without requiring a URL selection.

Authenticated screenshot QA exposed one additional fidelity issue: the server-selected lead was still visually highlighted in the mobile Inbox even when no explicit mobile conversation had been opened. The sidebar now suppresses that phantom selected-row state on <=620px unless the current URL explicitly selects that lead. Desktop selection highlighting remains unchanged.

## Authenticated visual QA observed from supplied screenshots

The supplied desktop screenshot confirms:

- three-column Conversations workspace renders with Inbox, conversation and Lead context visible together;
- the server-selected lead is highlighted in the desktop Inbox;
- Needs reply / Unread / Priority summary cards render above the workspace;
- WhatsApp disconnection safety notice is visible and sending remains disabled while disconnected;
- selected lead header, stage badge, Conversation/Activity tabs, origin event, response guidance, Reply draft/Internal note composer and CRM Inspector all render in live-data mode;
- Lead context includes country, course, source, current channel and last-contacted evidence;
- Live sync indicator renders in the application shell.

The supplied mobile Inbox screenshot confirms:

- `/conversations` opens the Inbox-first mobile layout;
- page title/summary metrics remain readable at narrow width;
- search, All / Needs reply / Unread filters and priority selector fit without horizontal overflow;
- conversation rows retain stage/status evidence and are independently scrollable.

The supplied mobile conversation screenshot confirms:

- selecting a lead opens the dedicated conversation view;
- Inbox back navigation is present;
- WhatsApp connection warning remains visible;
- lead header, stage, Lead context trigger, Conversation/Activity tabs, origin card, message bubble, response guidance and composer render at narrow width;
- the conversation layout does not require the desktop Inbox or Inspector columns to remain onscreen.

These screenshots are sufficient to clear the previous authentication blocker and confirm the principal responsive layout. They do not by themselves prove every interaction state, keyboard shortcut, drawer transition, Activity refresh or sending path.

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

## Remaining verification

1. On the latest preview, confirm the mobile Inbox no longer highlights a backend-auto-selected row until the user explicitly opens it.
2. Verify Lead context drawer open/close behavior at tablet/mobile widths, including focus return and Escape.
3. Verify Conversation/Activity switching and Activity refresh after adding an Internal note.
4. Verify Reply draft persistence across navigation/reload.
5. Verify real WhatsApp states with a connected eligible conversation, including service-window and template gating, without enabling autonomous sends.
6. Smoke-test Admissions, Leads, Pipeline and Follow-ups before any merge decision.
7. Review PR #98 against its base branch, then decide whether to merge it into `uiux/salsysos-experience-v1`.

## Release boundary

PR #98 remains a preview branch change. Do not merge directly to `main` from this checkpoint and do not describe it as production-released.
