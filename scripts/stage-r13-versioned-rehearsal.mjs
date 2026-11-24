// Local release rehearsal only. Never promote or apply SQL to a linked project.
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
const requireSafe=(ok,message)=>{if(!ok)throw Error(message)};
requireSafe(process.env.GITHUB_ACTIONS==='true'&&process.env.RUNNER_ENVIRONMENT==='github-hosted'&&process.env.SALSYS_R13_VERSIONED_REHEARSAL==='1','Disposable GitHub runner only');
const dir='supabase/migrations';
const manifest=JSON.parse(readFileSync('supabase/release-candidates/r13-manual-first.json','utf8'));
const order=['r13_governed_plan_admin','r13_verified_signup','r13_subscription_change_requests','r13_manual_pilot_approvals','r13_manual_pilot_activation'];
requireSafe(manifest.entries.length===order.length,'Unexpected release candidate count');
const existing=readdirSync(dir).filter(x=>x.endsWith('.sql'));
const versions=existing.map(x=>x.match(/^(\d+)_/)?.[1]).filter(Boolean);
const max=versions.filter(x=>x.length===14).sort().at(-1);
requireSafe(versions.includes('20261108120000'),'P0 foundation missing');
const staged=[];
for(let i=0;i<order.length;i++){
 const {name,version,blob}=manifest.entries[i];
 requireSafe(name===order[i]&&/^\d{14}$/.test(version)&&/^[a-f0-9]{40}$/.test(blob),'Invalid candidate manifest');
 requireSafe(!versions.includes(version)&&(!max||version>max)&&(i===0||version>manifest.entries[i-1].version),'Candidate order or migration version conflict');
 const bytes=readFileSync(join('supabase/drafts',name+'.sql'));
 const hash=createHash('sha1').update(Buffer.from('blob '+bytes.length+'\0')).update(bytes).digest('hex');
 requireSafe(hash===blob,'Reviewed candidate bytes changed: '+name);
 staged.push({path:join(dir,version+'_'+name+'.sql'),bytes,version,name});
}
for(const file of staged){writeFileSync(file.path,file.bytes,{flag:'wx'});console.log('Staged provisional migration '+file.version+' '+file.name);}
console.log('Five exact candidate blobs staged in ephemeral checkout only. No remote action.');
