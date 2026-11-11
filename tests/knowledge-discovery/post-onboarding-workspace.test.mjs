import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createRequire } from 'node:module';
const require=createRequire(import.meta.url);
const ts=require('typescript');

function load(file,imports) {
  const js=ts.transpileModule(readFileSync(resolve(file),'utf8'),{
    compilerOptions:{
      module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,
      esModuleInterop:true,
    },
  }).outputText;
  const exports={};
  new Function('require','exports','process',js)(name=>{
    if(!(name in imports))throw Error('Unexpected import: '+name);
    return imports[name];
  },exports,process);
  return exports;
}

const scope=load('lib/knowledge-discovery/url-policy.ts',{
  'node:net':require('node:net'),
  'node:dns/promises':require('node:dns/promises'),
});
const pageLinks=load('lib/knowledge-discovery/public-page-link.ts',{});
const ORG='10000000-0000-4000-8000-000000000001';
const USER='20000000-0000-4000-8000-000000000001';
let role='owner',authenticated=true,permission=true,activeOrg=ORG;
let record={organization_id:ORG,status:'completed',
  website_url:'https://old-business.com/',completed_steps:['business','goals']};
let readError=null,writeError=null,raceWebsite=undefined;
let writes=[],reads=[],rpcs=[],refreshes=[];

const client={
  auth:{getUser:async()=>({data:{user:authenticated?{id:USER}:null},error:null})},
  rpc:async(name,args)=>{
    assert.equal(name,'can_manage_organization');
    rpcs.push({name,args});
    return {data:permission,error:null};
  },
  from(table){
    reads.push(table);
    assert.equal(table,'organization_onboarding','Never touch knowledge/proof/consent/job tables');
    return {
      select(columns){
        assert.equal(columns,'website_url');
        return {eq(field,value){
          assert.equal(field,'organization_id');
          assert.equal(value,ORG);
          return {maybeSingle:async()=>({data:record?{
            website_url:record.website_url,
          }:null,error:readError})};
        }};
      },
      update(values){
        writes.push({table,values});
        assert.deepEqual(Object.keys(values),['website_url']);
        const filters={};
        const builder={
          eq(field,value){filters[field]=value;return builder;},
          is(field,value){filters[field]=value;return builder;},
          select(columns){
            assert.equal(columns,'organization_id,website_url');
            return {maybeSingle:async()=>{
              if(writeError)return {data:null,error:writeError};
              if(raceWebsite!==undefined)record.website_url=raceWebsite;
              if(!record || filters.organization_id!==record.organization_id ||
                filters.website_url!==record.website_url){
                return {data:null,error:null};
              }
              record.website_url=values.website_url;
              return {data:{organization_id:ORG,website_url:record.website_url},error:null};
            }};
          },
        };
        return builder;
      },
    };
  },
};

const actions=load('app/settings/knowledge/discovery/actions.ts',{
  'next/cache':{revalidatePath:(path)=>refreshes.push(path)},
  'next/navigation':{redirect:(url)=>{throw Error('redirect:'+url);}},
  '@/lib/supabase/server':{createClient:async()=>client},
  '@/lib/workspace':{getCurrentWorkspaceContext:async()=>({
    activeOrganizationId:activeOrg,
    activeWorkspace:{organizationId:ORG,role},
  })},
  '@/lib/knowledge-discovery/url-policy':scope,
});

const pilotKey='KNOWLEDGE_DISCOVERY_PILOT_ENABLED';
const consentKey='KNOWLEDGE_DISCOVERY_CONSENT_MANAGEMENT_ENABLED';
const initialFlags={[pilotKey]:process.env[pilotKey],[consentKey]:process.env[consentKey]};
test.after(()=>{
  for(const key of [pilotKey,consentKey]){
    if(initialFlags[key]===undefined)delete process.env[key];
    else process.env[key]=initialFlags[key];
  }
});
function reset(){
  delete process.env[pilotKey];delete process.env[consentKey];
  role='owner';authenticated=true;permission=true;activeOrg=ORG;
  record={organization_id:ORG,status:'completed',
    website_url:'https://old-business.com/',completed_steps:['business','goals']};
  readError=null;writeError=null;raceWebsite=undefined;
  writes=[];reads=[];rpcs=[];refreshes=[];
}
const form=website=>{
  const f=new FormData();
  if(website!==undefined)f.set('website',website);
  return f;
};
const run=website=>actions.saveKnowledgeWebsiteAction(form(website));
async function expectRedirect(value,url){
  await assert.rejects(value,err=>err instanceof Error&&err.message==='redirect:'+url);
}

test('KB-09P owner updates website AFTER onboarding without resetting completion or knowledge',async()=>{
  reset();
  await expectRedirect(run('https://new-business.com/'),
    '/settings/knowledge/discovery');
  assert.deepEqual(writes,[{
    table:'organization_onboarding',values:{website_url:'https://new-business.com/'},
  }]);
  assert.equal(record.status,'completed');
  assert.deepEqual(record.completed_steps,['business','goals']);
  assert.equal(record.website_url,'https://new-business.com/');
  assert.deepEqual(reads,['organization_onboarding','organization_onboarding']);
  assert.deepEqual(rpcs,[{name:'can_manage_organization',args:{p_organization_id:ORG}}]);
  assert.deepEqual(refreshes,['/settings/knowledge','/settings/knowledge/discovery']);
});

test('KB-09P same editor works DURING onboarding without advancing the current step',async()=>{
  reset();
  record.status='in_progress';
  await expectRedirect(run('https://different-business.com/'),
    '/settings/knowledge/discovery');
  assert.equal(record.status,'in_progress');
  assert.deepEqual(record.completed_steps,['business','goals']);
});

test('KB-09P refuses unauthorized users and other tenant context before writes',async()=>{
  for(const next of [
    ()=>{authenticated=false;},
    ()=>{role='manager';},
    ()=>{role='admissions';},
    ()=>{activeOrg='10000000-0000-4000-8000-000000000002';},
    ()=>{permission=false;},
  ]){
    reset();next();
    await assert.rejects(run('https://new-business.com/'),/redirect:/);
    assert.deepEqual(writes,[]);
    assert.equal(record.website_url,'https://old-business.com/');
  }
});

test('KB-09P pilot or consent features lock website changes, even while the pilot is paused',async()=>{
  for(const key of [pilotKey,consentKey]){
    reset();process.env[key]='true';
    await expectRedirect(run('https://new-business.com/'),
      '/settings/knowledge/discovery?websiteError=pilot_locked');
    assert.deepEqual(writes,[]);
    assert.deepEqual(reads,[]);
  }
});

test('KB-09P rejects private, insecure, off-port or non-root target sites before DB writes',async()=>{
  for(const url of [
    '', 'https://localhost/', 'https://internal.test/', 'https://192.168.1.1/',
    'http://safe-business.com/','https://safe-business.com:8443/',
    'https://user:pass@safe-business.com/',
    'https://safe-business.com/articles',
    'file:///etc/passwd','javascript:alert(1)',
    'https://safe-business.com/'.padEnd(250,'a'),
  ]){
    reset();
    await assert.rejects(run(url),/redirect:\/settings\/knowledge\/discovery\?websiteError=/);
    assert.deepEqual(writes,[],url);
  }
});

test('KB-09P does not erase a missing or unreadable onboarding record',async()=>{
  for(const situation of ['missing','error']){
    reset();
    if(situation==='missing')record=null;
    else readError={code:'42501'};
    await expectRedirect(run('https://new-business.com/'),
      '/settings/knowledge/discovery?websiteError=not_readable');
    assert.deepEqual(writes,[]);
  }
});

test('KB-09P website update is conditional on the exact previous value (stale admin fails)',async()=>{
  reset();
  raceWebsite='https://third-admin.com/';
  await expectRedirect(run('https://new-business.com/'),
    '/settings/knowledge/discovery?websiteError=write_conflict');
  assert.equal(record.website_url,raceWebsite);
  assert.deepEqual(refreshes,[]);
});

test('KB-09P missing UPDATE privileges fail closed; unchanged URL does no write',async()=>{
  reset();writeError={code:'42501'};
  await expectRedirect(run('https://new-business.com/'),
    '/settings/knowledge/discovery?websiteError=write_conflict');
  assert.equal(record.website_url,'https://old-business.com/');
  reset();
  await expectRedirect(run('https://old-business.com/'),
    '/settings/knowledge/discovery');
  assert.deepEqual(writes,[]);
});

test('KB-09P first configured website uses NULL-aware compare-and-set',async()=>{
  reset();record.website_url=null;
  await expectRedirect(run('https://new-business.com/'),
    '/settings/knowledge/discovery');
  assert.equal(record.website_url,'https://new-business.com/');
});

test('KB-09P no GET query can forge a website-save success status',()=>{
  const page=readFileSync(resolve('app/settings/knowledge/discovery/page.tsx'),'utf8');
  assert.match(page,/requireAdminWorkspaceAccess\(\)/);
  assert.match(page,/key=\{workspace\.organizationId\}/);
  assert.match(page,/websiteError=\{errors\[params\.websiteError \?\? ''\] \?\? ''\}/);
  assert.doesNotMatch(page,/websiteNotice=\{/);
  assert.doesNotMatch(page,/websiteNotice\?/);
  const action=readFileSync(resolve('app/settings/knowledge/discovery/actions.ts'),'utf8');
  assert.doesNotMatch(action,/websiteNotice=/);
  assert.match(action,/redirect\(destination\)/);
});

test('KB-09P uses a permanent post-onboarding route, not an onboarding-only redirect',()=>{
  const finished=readFileSync(resolve('app/onboarding/finish/page.tsx'),'utf8');
  const settings=readFileSync(resolve('app/settings/page.tsx'),'utf8');
  const knowledge=readFileSync(resolve('app/settings/knowledge/page.tsx'),'utf8');
  const discovery=readFileSync(resolve('components/knowledge-discovery-workspace.tsx'),'utf8');
  assert.match(finished,/Manage Knowledge Builder/);
  assert.match(settings,/Open Knowledge Builder/);
  assert.match(settings,/\{admin \? <section/);
  assert.match(knowledge,/href="\/settings\/knowledge\/discovery"/);
  assert.match(discovery,/action=\{saveKnowledgeWebsiteAction\}/);
  assert.doesNotMatch(discovery,/Add a website to your onboarding business profile/);
});

test('KB-09P untrusted page links remain HTTPS and EXACT configured host only',()=>{
  const good=pageLinks.safeDiscoveryPageLink(
    'https://safe-business.com/faq','https://safe-business.com/');
  assert.deepEqual(good,{
    href:'https://safe-business.com/faq',pathname:'/faq',
  });
  for(const raw of [
    'javascript:alert(1)','file:///etc/passwd','/relative/path',
    'https://evil-business.com/faq',
    'https://www.safe-business.com/faq',
    'https://safe-business.com.evil.com/faq',
    'http://safe-business.com/faq','https://user@safe-business.com/',
    'https://safe-business.com:8443/faq','not-a-url',
    'https://safe-business.com/\nmalformed',
  ]) {
    assert.equal(pageLinks.safeDiscoveryPageLink(raw,'https://safe-business.com/'),null,raw);
  }
  assert.equal(pageLinks.safeDiscoveryPageLink('https://safe-business.com/',null),null);
  const ui=readFileSync(resolve('components/knowledge-discovery-workspace.tsx'),'utf8');
  assert.match(ui,/safeDiscoveryPageLink\(page\.url, state\.configuredWebsite\)/);
  assert.doesNotMatch(ui,/href=\{page\.url\}/);
  assert.doesNotMatch(ui,/new URL\(page\.url\)\.pathname/);
});
