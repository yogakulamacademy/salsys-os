// Outputs SQL only. Run exclusively in an approved empty rollback-only test project.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
export function buildRefundReadinessSql(root=process.cwd()) {
const dir=path.join(root,'supabase/migrations');
const files=fs.readdirSync(dir).filter(f=>f.endsWith('.sql')).sort();
const helpers=['is_crm_user','tenant_session_enforcement_enabled','current_tenant_organization_id','session_is_bound_to_organization','has_organization_role','can_mutate_organization'];
const selected=new Map();
for(const file of files){
  const sql=fs.readFileSync(path.join(dir,file),'utf8');
  for(const name of [...helpers,'verify_payment_v1','promote_paid_payment_to_closed_won_v1']){
    const pattern=new RegExp(`create\\s+or\\s+replace\\s+function\\s+public\\.${name}\\s*\\(`,'ig');let match;
    while((match=pattern.exec(sql))){
      const tail=sql.slice(match.index), tag=/\bas\s+(\$[a-zA-Z_0-9]*\$)/i.exec(tail);
      if(!tag)throw Error(`Missing function body: ${name}`);
      const end=tail.indexOf(tag[1],tag.index+tag[0].length);
      if(end<0)throw Error(`Unclosed function: ${name}`);
      selected.set(name,`-- Exact function: ${file}\n${tail.slice(0,end+tag[1].length)};`);
    }
  }
}
for(const name of [...helpers,'verify_payment_v1','promote_paid_payment_to_closed_won_v1'])if(!selected.has(name))throw Error(`Missing ${name}`);
const initial=fs.readFileSync(path.join(dir,'001_initial_crm.sql'),'utf8');
const payments=/create table if not exists public\.payments \([\s\S]*?\n\);/.exec(initial)?.[0];
if(!payments)throw Error('Missing source payment table');
const refundFiles=files.filter(f=>f.endsWith('_atomic_refund_command_v1.sql')||f.endsWith('_refund_request_replay_binding_v1.sql')||f.endsWith('_payment_enrollment_association_v1.sql'));
if(!refundFiles.some(f=>f.endsWith('_atomic_refund_command_v1.sql')))throw Error('Missing refund migration');
let sql=fs.readFileSync(path.join(root,'tests/database/refund-readiness.fixture.sql'),'utf8');
for(const [marker,body] of Object.entries({AUTHORIZATION:helpers.map(n=>selected.get(n)).join('\n'),PAYMENTS:payments,COMMANDS:[selected.get('verify_payment_v1'),selected.get('promote_paid_payment_to_closed_won_v1'),...refundFiles.map(f=>fs.readFileSync(path.join(dir,f),'utf8'))].join('\n')}))sql=sql.replace(`-- __${marker}__`,()=>body);
if(/-- __[A-Z]+__/.test(sql))throw Error('Unexpanded SQL fixture');
return sql;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  if(!process.argv[2])throw Error('Provide the output SQL path');
  const sql=buildRefundReadinessSql();
  fs.writeFileSync(process.argv[2],sql);console.log(JSON.stringify({output:process.argv[2],bytes:Buffer.byteLength(sql)}));
}
