# SalsysOS R2 — Website Consent Integration Update

**Version 3.3 diagnostic / 3.1 patcher — Review-only operator tools, NOT deployed**  
**Release state: R2 NO-GO / staged acceptance 0 of 16 remains ON HOLD.**

This package makes a narrowly scoped local website-template change **only after an authorized operator explicitly runs `--apply`**. It does not access Supabase, Vercel, SalsysOS CRM databases, the live website, cookies, visitors or external APIs.

## What is already correct

The CRM-generated production snippet in `components/tracker-snippet.tsx` was previously inspected and uses `data-consent-mode="required"` plus the SalsysOS consent UI. No change to that source is necessary for this particular attribute. This does **not** prove the real website currently uses that snippet.

## Included files

- `scripts/r2-consent-installation-audit.js` — browser-console diagnostic v3.3. **Read-only**; it reports enumerated flags, not script URLs, site IDs or visitor data.
- `scripts/salsysos-website-consent-fix.py` — local PHP/HTML patcher. **Dry-run by default**, and refuses unexpected configurations.
- `tests/readiness/r2-consent-installation-audit-v3.test.cjs` — JavaScript regression tests.
- `tests/readiness/r2-website-consent-fix-v3.test.py` — Python regression tests.
- `.github/workflows/r2-consent-operator-tools.yml` — isolated offline CI checks. No .txt test-output files are committed.

## Step A — Inspect actual website installation (read-only)

1. Open the site in Chrome, press **F12**, then choose **Console**.
2. Paste the complete contents of `scripts/r2-consent-installation-audit.js` and press Enter.
3. Save/share the redacted JSON report (do not add cookies, session tokens, network dumps or contact data).

Diagnostic v3.3 also verifies that both configured endpoints use exact trusted HTTPS origins and paths, bind to the same single `site_id` value as the bootstrap, and that the bootstrap and CMP script origins use expected paths. Results are boolean flags; site IDs and endpoint values are never printed.

**v3.3 observed runtime-chain refinement:** The website operator's Nov 12 Chrome Network view showed `salsys-intelligence.js` initiating `salsys-intelligence-core-v1.6.0.js`, which initiated `salsys-tracker.js`. The `main` source confirms this nested tracker is created by the core, inherits `data-*` attributes and receives `data-legacy-aliases="false"`. A single trusted core and a single trusted inherited tracker with matching site/endpoint/required-consent attributes is now **consistent with the expected internal chain**; it does not count as two independent SDK loaders. The diagnostic exposes `expectedInternalTrackerChainConsistent` as a boolean only. It retains fail-closed flags for extra bootstraps/trackers, missing internal-chain markers, mismatched site/mode/endpoint, and untrusted sources. Network initiator provenance and GTM configurations still require independent inspection; static attributes do not prove execution provenance or consent compliance. No website runtime is changed.

The reported status `STATIC_ATTRIBUTES_MATCH_REQUIRED_NOT_E2E_VERIFIED` means **only visible attributes look correct**. It is not confirmation that Reject All, withdrawal, GPC, tenant isolation or event suppression works.

If there is **Google Tag Manager**, a website-specific wrapper, or a dynamically inserted SDK, independently inspect that installation too. The browser check cannot see historical script injections, cross-origin frames or configured tags that have not yet fired.

## Step B — Preview a local website file correction

Collect the actual PHP/HTML **files containing the installed SalsysOS `<script>` tags**. If the bootstrap is in `header.php` and consent UI is in `footer.php`, supply both:

```bash
python3 scripts/salsysos-website-consent-fix.py header.php footer.php
```

The default is **DRY RUN**. It does not edit anything, print your site ID, show full endpoints or write backups.

The tool intentionally refuses to patch if it finds duplicate SalsysOS loaders, legacy tracker wrappers, dynamically generated script tags, unexpected remote origins/endpoints, mismatched or duplicate endpoint `site_id` parameters, unquoted or malformed critical consent/behavior attributes, no SalsysOS consent interface, or enabled behavioral tracking. Resolve those manually with the site owner; do not bypass the checks.

### Step C — Modify a local copy only after owner approval

```bash
python3 scripts/salsysos-website-consent-fix.py header.php footer.php \
    --apply \
    --webroot /absolute/path/to/website-document-root \
    --backup-dir /path/outside/website-document-root/private-backups
```

- The tool modifies **only one trusted bootstrap** and only `data-consent-mode` (`granted` or missing → `required`).
- Existing endpoint URLs, site IDs and unrelated markup are preserved.
- **`--webroot` is mandatory for `--apply`** and must point to an existing, non-symlink website document root; the target template must be beneath it. The tool refuses backup locations **anywhere inside that root**, even in a sibling folder outside the template's directory. The operator is responsible for confirming the correct document root; the tool cannot discover the hosting setup.
- The original file is backed up in a private directory outside the stated document root, with owner-only permissions where supported.
- `--apply` updates the operator's **local file only**. It does not upload it or deploy the website.

## Required release tests (not performed by this package)

With a site-operator-authorized test environment and a separately lifted test hold, witness and record: Reject All; Accept; withdraw; regrant; Global Privacy Control; duplicate-loader and tag-manager behavior; absence of optional events before permission; form/CTA integrity; tenant scoping and consent audit metadata. Don't activate behavioral tracking merely to pass a test. Production deployment requires its own authorization.

## Run included automated tests

```bash
python3 tests/readiness/r2-website-consent-fix-v3.test.py
node --test tests/readiness/r2-consent-installation-audit-v3.test.cjs
```

These tests only cover **local patch logic** and **static diagnostic behavior**; they do not establish real website consent compliance or R2 release approval.

## Separate R2 recovery gate

PR #698's review was **documentation-only**. The separate written DBA/recovery decision, proposed logical rehearsal approval, residual-risk acceptance, migration-history reconciliation authorization, PR #686 installation approval, and 16 witnessed acceptance cases are still distinct gates. **Do not rerun PR #685 SQL.** Nothing in this package authorizes a hosted database migration, physical restore, customer-message send, collector activation, merge or production release.