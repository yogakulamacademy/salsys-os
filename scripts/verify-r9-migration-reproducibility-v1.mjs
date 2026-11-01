import crypto from 'node:crypto';
import fs from 'node:fs';

const migrations = [
  {
    path: 'supabase/migrations/20261018181345_r9_ai_visibility_probe_evidence_v1.sql',
    md5: '15e168e24008f977307caa0622c4172b',
  },
  {
    path: 'supabase/migrations/20261018182256_r9_visibility_health_v1.sql',
    md5: 'd38fbe8709faf1ed6c8994070bef4dc2',
  },
  {
    path: 'supabase/migrations/20261019012850_r9_ai_visibility_probe_history_v1.sql',
    md5: 'e930efce2dc502fe8f0801e86fbf69b9',
  },
  {
    path: 'supabase/migrations/20261019013639_r9_closeout_readiness_v1.sql',
    md5: '02a3dda1904367bc533fed51c60b5e1d',
  },
];

function normalizedSql(path) {
  return fs.readFileSync(path, 'utf8').replace(/\r\n/g, '\n').trimEnd();
}

for (const migration of migrations) {
  if (!fs.existsSync(migration.path)) {
    throw new Error(`Missing ledgered R9 migration: ${migration.path}`);
  }

  const sql = normalizedSql(migration.path);
  const actual = crypto.createHash('md5').update(sql).digest('hex');

  if (actual !== migration.md5) {
    throw new Error(
      `Ledgered R9 migration drift detected for ${migration.path}: expected ${migration.md5}, got ${actual}`,
    );
  }
}

const evidence = normalizedSql(migrations[0].path);
const health = normalizedSql(migrations[1].path);
const history = normalizedSql(migrations[2].path);
const closeout = normalizedSql(migrations[3].path);

for (const [source, needle, label] of [
  [evidence, "status in ('queued','running','completed','failed','cancelled')", 'probe status contract'],
  [evidence, 'is_organization_member(organization_id)', 'tenant member read policy'],
  [evidence, 'directly measured AI model mentions, recommendations and citations', 'direct evidence comment'],
  [health, 'measured_model_visibility_available', 'measured visibility flag'],
  [health, 'ai_referrals_are_observed', 'observed referral flag'],
  [health, 'readiness_is_deterministic', 'deterministic readiness flag'],
  [health, 'does not infer unobserved mentions, recommendations, rankings, or citations', 'no inferred evidence contract'],
  [history, 'Direct model observations are measured evidence', 'probe history evidence separation'],
  [closeout, "else 'ready_for_r9_closeout'", 'formal closeout state'],
  [closeout, 'technical_integrity_clean', 'integrity gate'],
  [closeout, 'deterministic readiness and AI referrals are not substitutes for measured model visibility', 'closeout evidence separation'],
]) {
  if (!source.includes(needle)) {
    throw new Error(`R9 migration reproducibility contract missing ${label}: ${needle}`);
  }
}

console.log('R9 migration reproducibility V1 contracts verified.');
