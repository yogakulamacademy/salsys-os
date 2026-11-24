// Disposable release rehearsal only. Never apply SQL to a linked project.
import { readFileSync, readdirSync, writeFileSync, existsSync, mkdirSync, renameSync, rmdirSync, appendFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
const requireSafe=(ok,message)=>{if(!ok)throw Error(message)};
requireSafe(process.env.GITHUB_ACTIONS==='true'&&process.env.RUNNER_ENVIRONMENT==='github-hosted','Disposable GitHub runner only');
const dir='supabase/migrations';
const manifest=JSON.parse(readFileSync('supabase/release-candidates/r13-manual-first.json','utf8'));
const order=['r13_governed_plan_admin','r13_verified_signup','r13_subscription_change_requests','r13_manual_pilot_approvals','r13_manual_pilot_activation'];
requireSafe(manifest.entries.length===order.length,'Unexpected release candidate count');
const entries=manifest.entries.map(({name,version,blob},i)=>{
 requireSafe(name===order[i]&&/^\d{14}$/.test(version)&&/^[a-f0-9]{40}$/.test(blob)&&(i===0||version>manifest.entries[i-1].version),'Invalid candidate manifest');
 const bytes=readFileSync(join('supabase/drafts',name+'.sql'));
 const hash=createHash('sha1').update(Buffer.from('blob '+bytes.length+'\0')).update(bytes).digest('hex');
 requireSafe(hash===blob,'Reviewed candidate bytes changed: '+name);
 return {name,version,blob,bytes,file:version+'_'+name+'.sql'};
});
const mode=process.argv[2];
if(mode==='--isolate-promoted'||mode==='--restore-promoted'){
 requireSafe(process.env.RUNNER_TEMP&&process.env.GITHUB_ENV,'GitHub runner paths required');
 const stash=join(process.env.RUNNER_TEMP,'r13-promoted-migrations');
 if(mode==='--isolate-promoted'){
  const present=entries.filter(e=>existsSync(join(dir,e.file)));
  requireSafe(present.length===0||present.length===entries.length,'Partial migration promotion');
  if(present.length){
   for(const e of entries)requireSafe(readFileSync(join(dir,e.file)).equals(e.bytes),'Promoted migration differs from tested bytes: '+e.name);
   mkdirSync(stash);
   // Preserve independent P0 assertions before applying R13 and any later migrations.
   for(const file of readdirSync(dir)){
    const version=file.match(/^(\d{14})_.*\.sql$/)?.[1];
    if(version&&version>=entries[0].version)renameSync(join(dir,file),join(stash,file));
   }
   appendFileSync(process.env.GITHUB_ENV,'SALSYS_R13_VERSIONED_REHEARSAL=1\nSALSYS_R13_PROMOTED=1\n');
   console.log('Verified promoted R13 bytes; isolated later migrations for P0-only replay.');
  }
 }else{
  requireSafe(process.env.SALSYS_R13_PROMOTED==='1'&&existsSync(stash),'Promoted replay stash missing');
  for(const e of entries)requireSafe(readFileSync(join(stash,e.file)).equals(e.bytes),'Promoted bytes changed: '+e.name);
  for(const file of readdirSync(stash)){
   requireSafe(!existsSync(join(dir,file)),'Restore would overwrite '+file);
   renameSync(join(stash,file),join(dir,file));
  }
  rmdirSync(stash);
  console.log('Restored exact committed R13 migrations and any later migrations for second local reset.');
 }
}else{
 requireSafe(!mode&&process.env.SALSYS_R13_VERSIONED_REHEARSAL==='1','Explicit local versioned rehearsal required');
 const existing=readdirSync(dir).filter(x=>x.endsWith('.sql'));
 const versions=existing.map(x=>x.match(/^(\d+)_/)?.[1]).filter(Boolean);
 const max=versions.filter(x=>x.length===14).sort().at(-1);
 requireSafe(versions.includes('20261108120000'),'P0 foundation missing');
 for(const e of entries)requireSafe(!versions.includes(e.version)&&(!max||e.version>max),'Candidate order or version conflict');
 for(const e of entries){writeFileSync(join(dir,e.file),e.bytes,{flag:'wx'});console.log('Staged provisional migration '+e.version+' '+e.name);}
 console.log('Five exact candidate blobs staged in ephemeral checkout only. No remote action.');
}
