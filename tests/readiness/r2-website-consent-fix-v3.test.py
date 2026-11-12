"""Unit tests for the local-only SalsysOS website consent repair (no live traffic)."""
import contextlib
import importlib.util
import io
import sys
import tempfile
import unittest
from pathlib import Path

FILE = Path(__file__).resolve().parents[2] / 'scripts/salsysos-website-consent-fix.py'
spec = importlib.util.spec_from_file_location('r2_consent_fix_v3', str(FILE))
fix = importlib.util.module_from_spec(spec)
sys.modules[spec.name] = fix
spec.loader.exec_module(fix)

SITE = 'SITE_ID_HIDDEN_IN_REPORTS'
BOOT = (
    f'<script src="https://salsysos.com/salsys-intelligence.js" '
    f'data-salsys-site="{SITE}" '
    f'data-endpoint="https://salsysos.com/api/events/browser/v1?site_id={SITE}" '
    f'data-consent-endpoint="https://salsysos.com/api/privacy/consent/v1?site_id={SITE}" '
    'data-consent-mode="granted" defer></script>'
)
CMP = '<script src="https://salsysos.com/salsys-consent.js" data-consent-banner="auto" defer></script>'


class SafePatching(unittest.TestCase):
    def test_exact_attribute_only(self):
        src = 'prefix\n' + BOOT + '\n' + CMP + '\nsuffix'
        out, message = fix.transform(src)
        self.assertIn('CHANGED', message)
        self.assertEqual(out, src.replace('data-consent-mode="granted"', 'data-consent-mode="required"'))

    def test_idempotent(self):
        src = BOOT.replace('granted', 'required') + CMP
        self.assertEqual(fix.transform(src)[0], src)

    def test_missing_mode_added(self):
        src = BOOT.replace(' data-consent-mode="granted"', '') + CMP
        self.assertEqual(fix.transform(src)[0].count('data-consent-mode="required"'), 1)

    def test_unknown_mode_refused(self):
        with self.assertRaises(fix.SafePatchError):
            fix.transform(BOOT.replace('granted', 'custom') + CMP)

    def test_duplicate_bootstrap_refused(self):
        with self.assertRaises(fix.SafePatchError):
            fix.transform(BOOT + BOOT + CMP)

    def test_missing_cmp_refused(self):
        with self.assertRaises(fix.SafePatchError):
            fix.transform(BOOT)

    def test_duplicate_cmp_refused(self):
        with self.assertRaises(fix.SafePatchError):
            fix.transform(BOOT + CMP + CMP)

    def test_non_auto_cmp_refused(self):
        with self.assertRaises(fix.SafePatchError):
            fix.transform(BOOT + CMP.replace('"auto"', '"manual"'))

    def test_legacy_tracker_refused(self):
        with self.assertRaises(fix.SafePatchError):
            fix.transform(BOOT + CMP + '<script src="https://salsysos.com/salsys-tracker.js"></script>')

    def test_untrusted_script_refused(self):
        with self.assertRaises(fix.SafePatchError):
            fix.transform(BOOT.replace('https://salsysos.com/salsys-intelligence.js',
                                       'https://salsysos.com.evil.invalid/salsys-intelligence.js') + CMP)

    def test_http_script_refused(self):
        with self.assertRaises(fix.SafePatchError):
            fix.transform(BOOT.replace('https://salsysos.com/salsys-intelligence.js',
                                       'http://salsysos.com/salsys-intelligence.js') + CMP)

    def test_wrong_endpoint_refused(self):
        with self.assertRaises(fix.SafePatchError):
            fix.transform(BOOT.replace('/api/events/browser/v1', '/api/events/wrong') + CMP)

    def test_mismatched_site_refused(self):
        with self.assertRaises(fix.SafePatchError):
            fix.transform(BOOT.replace('v1?site_id=' + SITE, 'v1?site_id=OTHER', 1) + CMP)

    def test_dynamic_php_refused(self):
        with self.assertRaises(fix.SafePatchError):
            fix.transform(BOOT.replace('https://salsysos.com/salsys-intelligence.js',
                                       '<?= salsys_url() ?>') + CMP)

    def test_behavior_optin_refused(self):
        with self.assertRaises(fix.SafePatchError):
            fix.transform(BOOT.replace('defer>', 'data-salsys-behavior-tracking="true" defer>') + CMP)

    def test_cross_file_template_include(self):
        header, footer = Path('header.php'), Path('footer.php')
        target, changed, _ = fix.transform_files({header: BOOT, footer: CMP})
        self.assertEqual(target, header)
        self.assertEqual(changed[footer], CMP)
        self.assertIn('data-consent-mode="required"', changed[header])

    def test_dry_run_then_explicit_local_apply(self):
        with tempfile.TemporaryDirectory() as d:
            root, priv = Path(d) / 'website', Path(d) / 'private_backup'
            root.mkdir()
            header, footer = root / 'header.php', root / 'footer.php'
            header.write_text(BOOT)
            footer.write_text(CMP)
            messages = io.StringIO()
            with contextlib.redirect_stdout(messages):
                self.assertEqual(fix.run([str(header), str(footer)]), 0)
            self.assertIn('granted', header.read_text())
            self.assertNotIn(SITE, messages.getvalue())
            with contextlib.redirect_stdout(messages):
                self.assertEqual(fix.run([str(header), str(footer), '--apply', '--webroot', str(root), '--backup-dir', str(priv)]), 0)
            self.assertIn('required', header.read_text())
            self.assertEqual(footer.read_text(), CMP)
            copies = list(priv.glob('header.php.salsys-backup-*'))
            self.assertEqual(len(copies), 1)
            self.assertEqual(copies[0].read_text(), BOOT)
            self.assertEqual(list(root.glob('*backup*')), [])

    def test_backup_inside_website_refused(self):
        with tempfile.TemporaryDirectory() as d:
            header = Path(d) / 'header.php'
            header.write_text(BOOT + CMP)
            with contextlib.redirect_stdout(io.StringIO()), contextlib.redirect_stderr(io.StringIO()):
                self.assertEqual(fix.run([str(header), '--apply', '--webroot', str(Path(d)), '--backup-dir', str(Path(d) / 'bad')]), 2)
            self.assertIn('granted', header.read_text())

    def test_symlink_refused(self):
        with tempfile.TemporaryDirectory() as d:
            target = Path(d) / 'real.php'
            target.write_text(BOOT + CMP)
            link = Path(d) / 'header.php'
            link.symlink_to(target)
            with contextlib.redirect_stderr(io.StringIO()):
                self.assertEqual(fix.run([str(link)]), 2)

    def test_wrong_extension_refused(self):
        with tempfile.TemporaryDirectory() as d:
            target = Path(d) / 'header.sql'
            target.write_text(BOOT + CMP)
            with contextlib.redirect_stderr(io.StringIO()):
                self.assertEqual(fix.run([str(target)]), 2)

    def test_apply_requires_document_root(self):
        with tempfile.TemporaryDirectory() as d:
            target = Path(d) / 'header.php'
            target.write_text(BOOT + CMP)
            with contextlib.redirect_stdout(io.StringIO()), contextlib.redirect_stderr(io.StringIO()):
                self.assertEqual(fix.run([str(target), '--apply', '--backup-dir', str(Path(d).parent / 'safe_private')]), 2)
            self.assertIn('granted', target.read_text())

    def test_refuses_sibling_backups_under_webroot(self):
        with tempfile.TemporaryDirectory() as d:
            root = Path(d) / 'public'
            includes = root / 'includes'
            includes.mkdir(parents=True)
            target = includes / 'header.php'
            target.write_text(BOOT + CMP)
            sibling_backup = root / 'backups'
            with contextlib.redirect_stdout(io.StringIO()), contextlib.redirect_stderr(io.StringIO()):
                self.assertEqual(fix.run([str(target), '--apply', '--webroot', str(root),
                                          '--backup-dir', str(sibling_backup)]), 2)
            self.assertIn('granted', target.read_text())

    def test_refuses_target_outside_webroot(self):
        with tempfile.TemporaryDirectory() as d:
            root = Path(d) / 'public'
            root.mkdir()
            target = Path(d) / 'private_include.php'
            target.write_text(BOOT + CMP)
            with contextlib.redirect_stdout(io.StringIO()), contextlib.redirect_stderr(io.StringIO()):
                self.assertEqual(fix.run([str(target), '--apply', '--webroot', str(root),
                                          '--backup-dir', str(Path(d) / 'private_backup')]), 2)
            self.assertIn('granted', target.read_text())

    def test_preserves_crlf(self):
        src = '\r\n'.join((BOOT, CMP)) + '\r\n'
        out, _ = fix.transform(src)
        self.assertEqual(out.count('\r\n'), 2)


if __name__ == '__main__':
    unittest.main(verbosity=2)
