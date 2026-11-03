// Builds a rollback-only subsystem test. This script never connects to a database.
import fs from 'node:fs';
import path from 'node:path';
const root = process.cwd();
const migrations = fs.readdirSync(path.join(root, 'supabase/migrations')).filter(f => f.endsWith('.sql')).sort();
const names = ['set_updated_at', 'is_crm_user', 'tenant_session_enforcement_enabled', 'current_tenant_organization_id', 'session_is_bound_to_organization', 'has_organization_role', 'is_organization_member', 'can_manage_organization'];
const selected = new Map();
for (const file of migrations) {
  const sql = fs.readFileSync(path.join(root, 'supabase/migrations', file), 'utf8');
  for (const name of names) {
    const start = new RegExp(`create\\s+or\\s+replace\\s+function\\s+public\\.${name}\\s*\\(`, 'ig');
    let match;
    while ((match = start.exec(sql))) {
      const tail = sql.slice(match.index);
      const tag = /\bas\s+(\$[a-zA-Z_0-9]*\$)/i.exec(tail);
      if (!tag) throw new Error(`Missing body for ${name} in ${file}`);
      const end = tail.indexOf(tag[1], tag.index + tag[0].length);
      if (end < 0) throw new Error(`Unclosed body for ${name}`);
      selected.set(name, `-- Exact source: ${file}\n${tail.slice(0, end + tag[1].length)};`);
    }
  }
}
for (const name of names) if (!selected.has(name)) throw new Error(`Missing canonical helper ${name}`);
const files = [
  '20261016171500_organization_knowledge_v1.sql',
  '20261016182500_fix_organization_knowledge_search_v1.sql',
  '20261101063000_ai_knowledge_final_closeout_v1.sql',
  '20261102053201_knowledge_retrieval_anon_execute_hardening.sql',
  '20261103190000_ai_knowledge_provenance_readiness_v2.sql',
];
const knowledge = files.map(file => `-- Exact source: ${file}\n${fs.readFileSync(path.join(root, 'supabase/migrations', file), 'utf8')}`).join('\n');
const fixture = fs.readFileSync(path.join(root, 'tests/database/knowledge-readiness.fixture.sql'), 'utf8');
const sql = fixture.replace('-- __AUTHORIZATION__', () => names.map(name => selected.get(name)).join('\n')).replace('-- __KNOWLEDGE__', () => knowledge);
if (/-- __(?:AUTHORIZATION|KNOWLEDGE)__/.test(sql)) throw new Error('Unexpanded fixture');
const out = process.argv[2];
if (!out) throw new Error('Provide the output SQL path. Execute only on an approved empty sandbox; never production.');
fs.writeFileSync(out, sql);
console.log(JSON.stringify({ output: out, bytes: Buffer.byteLength(sql), helpers: names.length, knowledgeMigrations: files.length }));
