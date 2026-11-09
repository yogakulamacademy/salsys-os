const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const script = path.resolve(__dirname, '../../scripts/r2-staging-remote-dryrun.mjs');
const STAGING = 'ndxpjqkthuzxlmbenxti';
const PROD = 'doaozrkrtgeslddwhclj';
const RECOVERY = 'wunnbqjvfzmawubglyhe';

async function withFixture(fn) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'r2-only-stage-'));
  const migrations = path.join(dir, 'supabase', 'migrations');
  const temp = path.join(dir, 'supabase', '.temp');
  fs.mkdirSync(migrations, { recursive: true });
  fs.mkdirSync(temp, { recursive: true });
  fs.writeFileSync(path.join(migrations, '001_initial.sql'), 'select 1;');
  fs.writeFileSync(path.join(temp, 'project-ref'), STAGING);
  const tool = await import('../../scripts/r2-staging-remote-dryrun.mjs');
  const manifest = await import('../../scripts/r2-staging-migration-manifest.mjs');
  const digest = manifest.buildManifest(migrations).manifestSha256;
  try { return await fn({ dir, migrations, temp, tool, digest }); }
  finally { fs.rmSync(dir, { recursive: true, force: true }); }
}

test('refuses missing linkage, production and Recovery Rehearsal project refs', async () => {
  await withFixture(({dir,temp,tool,digest}) => {
    fs.rmSync(path.join(temp, 'project-ref'));
    assert.throws(() => tool.planDryRun({projectRoot:dir,expectedDigest:digest}), /BLOCKED_LINK_TO_STAGING_REQUIRED/);
    for(const ref of [PROD,RECOVERY,'malformed']) {
      fs.writeFileSync(path.join(temp, 'project-ref'),ref);
      assert.throws(() => tool.planDryRun({projectRoot:dir,expectedDigest:digest}), /BLOCKED_WRONG_PROJECT_REF/);
    }
  });
});

test('refuses invalid and drifting working-tree digest before CLI runs', async () => {
  await withFixture(({dir,migrations,tool,digest}) => {
    assert.throws(() => tool.planDryRun({projectRoot:dir,expectedDigest:'abc'}),/BLOCKED_INVALID_MANIFEST_DIGEST/);
    fs.writeFileSync(path.join(migrations,'001_initial.sql'),'select 2;');
    assert.throws(() => tool.planDryRun({projectRoot:dir,expectedDigest:digest}),/BLOCKED_MIGRATION_DIGEST_MISMATCH/);
  });
});

test('with staged ref and matching SHA, invokes only db push --dry-run', async () => {
  await withFixture(({dir,tool,digest}) => {
    const out=path.join(dir,'observed-cli-args.txt');
    const stub=path.join(dir,'safe-stub.sh');
    fs.writeFileSync(stub, '#!/bin/sh\nprintf "%s" "$*" > "'+out+'"\nexit 0\n');
    fs.chmodSync(stub,0o755);
    const plan=tool.planDryRun({projectRoot:dir,expectedDigest:digest,cli:stub});
    assert.equal(plan.projectRef,STAGING);
    assert.deepEqual(plan.args,['db','push','--dry-run']);
    const result=tool.runDryRun(plan);
    assert.equal(fs.readFileSync(out,'utf8'),'db push --dry-run');
    assert.equal(result.schemaApplied,false);
    assert.equal(result.acceptanceVerified,false);
  });
});

test('failed CLI is fail-closed and does not expose SQL or provider output', async () => {
  await withFixture(({dir,tool,digest}) => {
    const stub=path.join(dir,'reject.sh');
    fs.writeFileSync(stub,'#!/bin/sh\necho "secret_credentials_marker" >&2\nexit 1\n');
    fs.chmodSync(stub,0o755);
    const plan=tool.planDryRun({projectRoot:dir,expectedDigest:digest,cli:stub});
    assert.throws(()=>tool.runDryRun(plan),e=>e.message==='BLOCKED_SUPABASE_CLI_DRYRUN_FAILED');
  });
});

test('CLI without exact project and manifest arguments never invokes Supabase', () => {
  const r=spawnSync(process.execPath,[script],{encoding:'utf8'});
  assert.equal(r.status,2);
  assert.match(r.stderr,/BLOCKED_USAGE/);
  assert.doesNotMatch(r.stderr,/secret/);
});
