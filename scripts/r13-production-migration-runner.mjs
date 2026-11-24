// R13 production operator helper. Default is read-only. No automatic deploy,
// backup, restore, migration repair, remote reset, roles, seed or vault writes.
import {spawn,execFileSync} from 'node:child_process';
import {mkdtempSync,mkdirSync,readdirSync,readFileSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
const target='doaozrkrtgeslddwhclj';
const release='5fdd9624a782c39d3b1901d584c75f199cdb1b86';
const expected=[
 ['20261108120000_r13_commercial_state_foundation_v1.sql','697615a6677ec271c96e23d52daef99c4cbdd84e'],
 ['20261124130001_r13_governed_plan_admin.sql','420fc01176662b173e938b807ead6fcd7b12c26f'],
 ['20261124130002_r13_verified_signup.sql','73c04bb77b1dfddf1ffb3cdcf50b4e65e08a5c06'],
 ['20261124130003_r13_subscription_change_requests.sql','1f958fea1e34d9301ed44537335d31b15ff8614e'],
 ['20261124130004_r13_manual_pilot_approvals.sql','795c8d94ce22229681c765837831b8fab6da05bb'],
 ['20261124130005_r13_manual_pilot_activation.sql','773242af49878b5f333393dd8296ba6d1009c475']
];
const requireSafe=(condition,label)=>{if(!condition)throw Error(label)};
const mode=process.argv.slice(2);
requireSafe(mode.length===0||(mode.length===1&&mode[0]==='--apply'),'Only optional --apply is supported');
requireSafe(process.stdin.isTTY,'Run interactively in a trusted local terminal');
const root=execFileSync('git',['rev-parse','--show-toplevel'],{encoding:'utf8'}).trim();
const files=expected.map(([name,sha])=>{
 const data=execFileSync('git',['show',release+':supabase/migrations/'+name],{cwd:root,maxBuffer:2*1024*1024});
 const digest=createHash('sha1').update(Buffer.from('blob '+data.length+'\0')).update(data).digest('hex');
 requireSafe(digest===sha,'Reviewed SQL bytes changed: '+name);
 return {name,data,version:name.split('_')[0]};
});
const work=mkdtempSync(join(tmpdir(),'salsys-r13-release-'));
const remote='--remote='+target;
const cli=(args)=>new Promise((resolve,reject)=>{
 // Fixed arguments only. No interpolated credentials or externally supplied shell text.
 const child=spawn(process.platform==='win32'?'npx.cmd':'npx',['--yes','supabase@3.0.0',...args],{
  cwd:work,shell:process.platform==='win32',stdio:['inherit','pipe','pipe'],env:process.env
 });
 let output='';
 for(const [stream,destination] of [[child.stdout,process.stdout],[child.stderr,process.stderr]])stream.on('data',chunk=>{
  output+=chunk.toString();destination.write(chunk);
 });
 child.once('error',reject);
 child.once('close',code=>code===0?resolve(output):reject(Error('Supabase CLI failed; inspect output, do not repair or retry blindly.')));
});
try{
 console.log('Target: SalsysOS Production '+target+'; source: '+release);
 await cli(['init']);
 const folder=join(work,'supabase','migrations');
 mkdirSync(folder,{recursive:true});
 // Reconstruct remote history in an isolated temporary directory, not the repo.
 await cli(['migration','fetch',remote]);
 const fetched=readdirSync(folder).filter(f=>f.endsWith('.sql'));
 requireSafe(fetched.length>0,'No remote migration history fetched');
 const versions=fetched.map(f=>f.match(/^(\d+)_/)?.[1]);
 requireSafe(versions.every(Boolean)&&new Set(versions).size===versions.length,'Unexpected fetched migration filenames or duplicate versions');
 const already=files.filter(f=>versions.includes(f.version));
 requireSafe(already.length===0,'Some R13 versions already exist. Stop for read-back; do not replay them.');
 for(const file of files)writeFileSync(join(folder,file.name),file.data,{flag:'wx'});
 const preview=await cli(['db','push',remote,'--include-all','--dry-run','--skip-vault']);
 const proposed=[...new Set(preview.match(/\b\d+_[A-Za-z0-9_-]+\.sql\b/g)||[])].sort();
 const wanted=files.map(f=>f.name).sort();
 requireSafe(JSON.stringify(proposed)===JSON.stringify(wanted),'Preview did not enumerate exactly the six reviewed migrations; no write attempted.');
 console.log('Verified: dry run proposes only the six reviewed R13 versions.');
 if(mode[0]==='--apply'){
  console.log('Review the target and six migrations. The CLI will request production confirmation. Ensure registration is closed, the latest scheduled backup is available, and no other operator is deploying.');
  await cli(['db','push',remote,'--include-all','--skip-vault']);
  await cli(['migration','list',remote]);
  console.log('CLI finished. Independently verify all six ledger entries and dormant schema before publication.');
 }else{
  console.log('Preview only: nothing applied. After review, run this helper with --apply; it rebuilds and verifies the preview before pushing.');
 }
}finally{
 // Only remove our locally generated temp directory. No database operation.
 rmSync(work,{recursive:true,force:true});
}
