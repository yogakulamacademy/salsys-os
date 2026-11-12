# SalsysOS R2 — Website Consent Integration Update

**Version 3.0 — Local update package, NOT deployed**  
**Release state: R2 NO-GO / staged acceptance 0 of 16 remains ON HOLD.**

This package makes a narrowly scoped local website-template change **only after an authorized operator explicitly runs `--apply`**. It does not access Supabase, Vercel, SalsysOS CRM databases, the live website, cookies, visitors or external APIs.

## What is already correct

The CRM-generated production snippet in `components/tracker-snippet.tsx` was previously inspected and uses `data-consent-mode="required"` plus the SalsysOS consent UI. No change to that source is necessary for this particular attribute. This does **not** prove the real website currently uses that snippet.

## Included files

- `r2-consent-installation-audit.js` — browser-console diagnostic. **Read-only**; it reports enumerated flags, not script URLs, site IDs or visitor data.
- `salsysos-website-consent-fix.py` — local PHP/HTML patcher. **Dry-run by default**, and refuses unexpected configurations.
- `test-r2-consent-audit.cjs` — 18 automated JavaScript tests.
- `test-salsysos-website-consent-fix.py` — 25 automated Python tests.
- Two `.txt` files — most recent local test output.

## Step A — Inspect actual website installation (read-only)

1. Open the site in Chrome, press **F12**, then choose **Console**.
2. Paste the complete contents of `r2-consent-installation-audit.js` and press Enter.
3. Save/share the redacted JSON report (do not add cookies, session tokens, network dumps or contact data).

The reported status `STATIC_ATTRIBUTES_MATCH_REQUIRED_NOT_E2E_VERIFIED` means **only visible attributes look correct**. It is not confirmation that Reject All, withdrawal, GPC, tenant isolation or event suppression works.

If there is **Google Tag Manager**, a website-specific wrapper, or a dynamically inserted SDK, independently inspect that installation too. The browser check cannot see historical script injections, cross-origin frames or configured tags that have not yet fired.

## Step B — Preview a local website file correction

Collect the actual PHP/HTML **files containing the installed SalsysOS `<script>` tags**. If the bootstrap is in `header.php` and consent UI is in `footer.php`, supply both:

```bash
python3 salsysos-website-consent-fix.py header.php footer.php
```

The default is **DRY RUN**. It does not edit anything, print your site ID, show full endpoints or write backups.

The tool intentionally refuses to patch if it finds duplicate SalsysOS loaders, legacy tracker wrappers, dynamically generated script tags, unexpected remote origins/endpoints, mismatched site IDs, no SalsysOS consent interface, or enabled behavioral tracking. Resolve those manually with the site owner; do not bypass the checks.

### Step C — Modify a local copy only after owner approval

```bash
python3 salsysos-website-consent-fix.py header.php footer.php \
    --apply --backup-dir /path/outside/website-document-root/private-backups
```

- The tool modifies **only one trusted bootstrap** and only `data-consent-mode` (`granted` or missing → `required`).
- Existing endpoint URLs, site IDs and unrelated markup are preserved.
- The original file is backed up in a private directory **outside the website's template directory**, not beside a public HTML/PHP file; file permission is set to owner-only where supported.
- `--apply` updates the operator's **local file only**. It does not upload it or deploy the website.

## Required release tests (not performed by this package)

With a site-operator-authorized test environment and a separately lifted test hold, witness and record: Reject All; Accept; withdraw; regrant; Global Privacy Control; duplicate-loader and tag-manager behavior; absence of optional events before permission; form/CTA integrity; tenant scoping and consent audit metadata. Don't activate behavioral tracking merely to pass a test. Production deployment requires its own authorization.

## Run included automated tests

```bash
python3 test-salsysos-website-consent-fix.py
node --test test-r2-consent-audit.cjs
```

These tests only cover **local patch logic** and **static diagnostic behavior**; they do not establish real website consent compliance or R2 release approval.

## Separate R2 recovery gate

PR #698's review was **documentation-only**. The separate written DBA/recovery decision, proposed logical rehearsal approval, residual-risk acceptance, migration-history reconciliation authorization, PR #686 installation approval, and 16 witnessed acceptance cases are still distinct gates. **Do not rerun PR #685 SQL.** Nothing in this package authorizes a hosted database migration, physical restore, customer-message send, collector activation, merge or production release.