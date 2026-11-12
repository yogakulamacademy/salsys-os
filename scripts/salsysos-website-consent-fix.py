#!/usr/bin/env python3
"""SalsysOS R2 safe website snippet repair (v3.1, local files only).

DRY RUN is the default. Supply all directly relevant PHP/HTML include files, e.g.
    python salsysos-website-consent-fix.py header.php footer.php
After review/authorization, to patch the *local* bootstrap file only:
    python salsysos-website-consent-fix.py header.php footer.php \
        --apply --webroot /absolute/path/to/site/document-root

Only adjusts the consent mode of one static, trusted SalsysOS bootstrap.
Refuses unknown/dynamic configurations, duplicate loaders, missing CMP, active
behavior tracking, and PHP-generated script tags. No deployed site is changed.
Do not use as evidence that a CMP respects consent or GPC end-to-end.
"""
from __future__ import annotations

import argparse
import os
import re
import shutil
import sys
import tempfile
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import parse_qs, urlsplit

VERSION = '3.1'
SCRIPT = re.compile(r'<script\b[^>]*>', re.IGNORECASE | re.DOTALL)
ATTR_NAME = re.compile(r'(?<![\w:-])([a-z][\w:-]*)\s*=\s*(["\'])(.*?)\2', re.IGNORECASE | re.DOTALL)
HTML_COMMENT = re.compile(r'<!--.*?-->', re.DOTALL)
PHP_BLOCK = re.compile(r'<\?(?:php|=)?[\s\S]*?\?>', re.IGNORECASE)
DYNAMIC = re.compile(r'<\?|<%|\{\{|\$\{|\{%|%\}', re.IGNORECASE)
TRACKERS = {'salsys-intelligence.js','salsys-tracker.js','yogakulam-tracker.js','salsys-consent.js'}
EXPECTED_PATH = {
    'salsys-intelligence.js': '/salsys-intelligence.js',
    'salsys-consent.js': '/salsys-consent.js',
}

class SafePatchError(Exception):
    """An untrusted or ambiguous website configuration was detected."""

@dataclass(frozen=True)
class Tag:
    path: Path
    start: int
    end: int
    text: str
    name: str
    attrs: dict[str, str]
    raw_mode: tuple[int, int] | None = None


def _attrs(tag: str) -> dict[str, str]:
    attrs: dict[str, str] = {}
    for m in ATTR_NAME.finditer(tag):
        name = m.group(1).lower()
        if name in attrs:
            raise SafePatchError('Duplicate script attribute; manual review required.')
        attrs[name] = m.group(3)
    return attrs


def _in_spans(position: int, spans: list[tuple[int, int]]) -> bool:
    return any(lo <= position < hi for lo, hi in spans)


def _static_src(raw: str) -> tuple[str, str]:
    if DYNAMIC.search(raw):
        raise SafePatchError('Dynamic source URL; manual review required.')
    parsed = urlsplit(raw.strip())
    filename = parsed.path.rsplit('/', 1)[-1].lower()
    if filename in TRACKERS:
        if parsed.scheme != 'https' or parsed.hostname != 'salsysos.com' or parsed.port not in (None, 443) or parsed.username or parsed.password:
            # A website-local wrapper is a recognized but intentionally unsupported case.
            raise SafePatchError('SalsysOS-named script is not from the exact trusted HTTPS origin.')
        if parsed.path != EXPECTED_PATH.get(filename, parsed.path):
            raise SafePatchError('Unexpected SalsysOS script path; manual review required.')
    return filename, parsed.path


def _safe_url(raw: str, expected_path: str) -> bool:
    if DYNAMIC.search(raw):
        return False
    u = urlsplit(raw.strip())
    # Query is allowed, but never echoed in output. Site ID must be present.
    return (u.scheme == 'https' and u.hostname == 'salsysos.com'
        and u.username is None and u.password is None and u.port in (None, 443)
        and u.path == expected_path and bool(parse_qs(u.query).get('site_id', [''])[0]))


def _scan(path: Path, content: str) -> list[Tag]:
    commented = [(m.start(), m.end()) for m in HTML_COMMENT.finditer(content)]
    php = [(m.start(), m.end()) for m in PHP_BLOCK.finditer(content)]
    # PHP echo/template-generated markup is not safe to rewrite with a regex.
    if any(re.search(r'salsys-(?:intelligence|consent|tracker)\.js|yogakulam-tracker\.js',
                     content[a:b], re.IGNORECASE) for a,b in php):
        raise SafePatchError('SalsysOS script reference in PHP block; manual review required.')
    result: list[Tag] = []
    for m in SCRIPT.finditer(content):
        if _in_spans(m.start(), commented) or _in_spans(m.start(), php):
            continue
        tag_text = m.group()
        if DYNAMIC.search(tag_text):
            raise SafePatchError('Dynamic markup in <script> tag; manual review required.')
        attrs = _attrs(tag_text)
        if 'src' not in attrs:
            continue
        filename, _ = _static_src(attrs['src'])
        if filename in TRACKERS:
            result.append(Tag(path,m.start(),m.end(),tag_text,filename,attrs))
    return result


def transform_files(files: dict[Path, str]) -> tuple[Path | None, dict[Path, str], str]:
    all_tags = [tag for p,c in files.items() for tag in _scan(p,c)]
    boot = [x for x in all_tags if x.name == 'salsys-intelligence.js']
    cmp = [x for x in all_tags if x.name == 'salsys-consent.js']
    legacy = [x for x in all_tags if x.name in {'salsys-tracker.js','yogakulam-tracker.js'}]
    if len(boot) != 1:
        raise SafePatchError(f'Expected one trusted SalsysOS bootstrap across supplied files; found {len(boot)}.')
    if legacy:
        raise SafePatchError('Legacy or website-specific SalsysOS wrapper is present.')
    if len(cmp) != 1:
        raise SafePatchError(f'Expected one SalsysOS consent UI across supplied files; found {len(cmp)}.')
    if cmp[0].attrs.get('data-consent-banner','').strip().lower() != 'auto':
        raise SafePatchError('Consent UI auto banner is not configured; manual CMP review required.')
    b = boot[0]
    for key in ('data-salsys-site','data-endpoint','data-consent-endpoint'):
        val = b.attrs.get(key,'').strip()
        if not val or DYNAMIC.search(val):
            raise SafePatchError(f'Missing or dynamic {key}; manual review required.')
    if not _safe_url(b.attrs['data-endpoint'], '/api/events/browser/v1'):
        raise SafePatchError('Event endpoint is not expected trusted SalsysOS endpoint.')
    if not _safe_url(b.attrs['data-consent-endpoint'], '/api/privacy/consent/v1'):
        raise SafePatchError('Consent endpoint is not expected trusted SalsysOS endpoint.')
    for endpoint_name in ('data-endpoint', 'data-consent-endpoint'):
        bound_id = parse_qs(urlsplit(b.attrs[endpoint_name].strip()).query).get('site_id', [''])[0]
        if bound_id != b.attrs['data-salsys-site'].strip():
            raise SafePatchError('Site ID and endpoint-bound site ID mismatch; refuse partial fix.')
    if b.attrs.get('data-salsys-behavior-tracking', '').strip().lower() == 'true':
        raise SafePatchError('Behavior tracking is enabled; resolve authorization before changing the installation.')
    mode = b.attrs.get('data-consent-mode','').strip().lower()
    if mode not in ('', 'required','granted'):
        raise SafePatchError('Unknown consent mode; patch refused.')
    if mode == 'required':
        return None, files, 'UNCHANGED: Consent mode already required.'
    if 'data-consent-mode' in b.attrs:
        hits = [x for x in ATTR_NAME.finditer(b.text) if x.group(1).lower()=='data-consent-mode']
        if len(hits) != 1: raise SafePatchError('Ambiguous consent-mode attribute.')
        hit = hits[0]
        replaced = b.text[:hit.start(3)] + 'required' + b.text[hit.end(3):]
    else:
        replaced = b.text[:-1]+' data-consent-mode="required">'
    out=dict(files)
    previous=files[b.path]
    out[b.path] = previous[:b.start]+replaced+previous[b.end:]
    return b.path,out,'CHANGED: Updated SalsysOS bootstrap to consent-required mode.'


def transform(contents: str) -> tuple[str, str]:
    """Single-file compatibility API for existing tests."""
    path=Path('template.php')
    _, out, message=transform_files({path:contents})
    return out[path],message


def run(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument('files', nargs='+', type=Path, help='All directly relevant PHP/HTML files (header, footer, includes).')
    ap.add_argument('--apply',action='store_true',help='Apply local edit after backup; never deploys.')
    ap.add_argument('--webroot',type=Path,help='Required for --apply: canonical website document root. Backup must be outside it.')
    ap.add_argument('--backup-dir',type=Path,default=Path.home()/'.salsysos-r2-backups',
      help='Private backup directory OUTSIDE website document root (default: ~/.salsysos-r2-backups).')
    args=ap.parse_args(argv)
    try:
        paths=[p.absolute() for p in args.files]
        if len(set(paths)) != len(paths):
            raise SafePatchError('Duplicate file arguments.')
        old_bytes:dict[Path,bytes]={}
        for p in paths:
            if p.suffix.lower() not in ('.html','.htm','.php'):
                raise SafePatchError('Only PHP/HTML templates are supported.')
            if p.is_symlink() or not p.is_file():
                raise SafePatchError('Symlink or missing file supplied.')
            old_bytes[p] = p.read_bytes()
        files={p:data.decode('utf-8') for p,data in old_bytes.items()}
        target, rewritten, message=transform_files(files)
        print(f'SalsysOS R2 website consent fix v{VERSION}: {message}')
        print(f'Scanned {len(paths)} local template file(s). Site IDs and endpoint values are not printed.')
        if target is None: return 0
        if not args.apply:
            print('DRY RUN: no files changed. Only the static SalsysOS consent-mode attribute would be updated.')
            print('Review source files and obtain site owner approval before using --apply.')
            return 0
        if target.read_bytes() != old_bytes[target] or target.is_symlink():
            raise SafePatchError('Source file changed since inspection; rerun review.')
        # Explicit document-root boundary is required before ANY local write.
        if args.webroot is None:
            raise SafePatchError('Supply --webroot on --apply to prevent backups inside the published site.')
        webroot=args.webroot.expanduser().absolute()
        if webroot.is_symlink() or not webroot.is_dir():
            raise SafePatchError('--webroot must be an existing non-symlink directory.')
        canonical_webroot=webroot.resolve(strict=True)
        if not target.resolve(strict=True).is_relative_to(canonical_webroot):
            raise SafePatchError('Target template must be located inside the stated --webroot; manual review required.')
        # Keep original permissions and preserve original bytes in an exclusive backup.
        stamp=datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%S%fZ')
        backup_dir=args.backup_dir.expanduser().absolute()
        if backup_dir.resolve().is_relative_to(canonical_webroot):
            raise SafePatchError('Backup directory must be outside the entire website document root.')
        if backup_dir.exists() and backup_dir.is_symlink():
            raise SafePatchError('Backup directory must not be a symlink.')
        backup_dir.mkdir(mode=0o700,parents=True,exist_ok=True)
        os.chmod(backup_dir,0o700)
        backup=backup_dir/(target.name+'.salsys-backup-'+stamp)
        backup_fd=os.open(backup,os.O_WRONLY|os.O_CREAT|os.O_EXCL,0o600)
        with os.fdopen(backup_fd,'wb') as backup_stream:
            backup_stream.write(old_bytes[target])
            backup_stream.flush();os.fsync(backup_stream.fileno())
        os.chmod(backup,0o600)
        fd,temp_name=tempfile.mkstemp(prefix='.salsys-r2-',dir=str(target.parent))
        try:
            with os.fdopen(fd,'wb') as stream:
                stream.write(rewritten[target].encode('utf-8'))
                stream.flush();os.fsync(stream.fileno())
            shutil.copymode(target,temp_name)
            if target.read_bytes() != old_bytes[target]:
                raise SafePatchError('Source file changed during patch; aborting.')
            os.replace(temp_name,target)
        finally:
            if os.path.exists(temp_name): os.unlink(temp_name)
        print(f'LOCAL TEMPLATE UPDATED: {target.name} (private backup stored outside website template directory).')
        print('NOT DEPLOYED. Independently test Reject All, accept, withdrawal, regrant and GPC before release.')
        return 0
    except (SafePatchError, OSError, UnicodeError,ValueError) as exc:
        print(f'REFUSED: {exc}',file=sys.stderr)
        return 2

if __name__=='__main__':
    raise SystemExit(run())