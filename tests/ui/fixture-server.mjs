// Loopback-only synthetic read service for visual QA. No production credentials,
// tenant creation or application authorization bypass is involved.
import http from 'node:http';
const userId='00000000-0000-4000-8000-000000000001';
const organizationId='00000000-0000-4000-8000-000000000002';
const user={id:userId,aud:'authenticated',role:'authenticated',email:'reviewer@example.test',app_metadata:{provider:'email'},user_metadata:{},created_at:'2026-01-01T00:00:00Z'};
const workspace={organization_id:organizationId,active_organization_id:organizationId,organization_name:'Demo Academy',organization_slug:'demo-academy',role:'admin',workspace_codes:['sales','marketing','intelligence','operations','automation','system','performance'],organization_status:'active'};
const server=http.createServer((req,res)=>{
  res.setHeader('Content-Type','application/json');
  res.setHeader('Access-Control-Allow-Origin',`http://127.0.0.1:${process.env.UI_TEST_PORT || 3107}`);
  res.setHeader('Access-Control-Allow-Headers','authorization,apikey,content-type,x-client-info');
  if(req.method==='OPTIONS'){res.end('{}');return;}
  const url=new URL(req.url,'http://127.0.0.1:3108');
  let result=[];
  if(url.pathname==='/auth/v1/user')result=user;
  else if(url.pathname==='/rest/v1/rpc/get_current_workspace_context_v1')result=workspace;
  else if(url.pathname==='/rest/v1/rpc/get_current_provider_visibility_v1')result={organization_id:organizationId,google_connected:false,meta_connected:false,instagram_connected:false,whatsapp_connected:false};
  else if(url.pathname==='/rest/v1/rpc/get_admissions_snapshot')result={metrics:{needs_reply:0,unread:0},priority_queue:[],batch_capacity:[]};
  else if(url.pathname==='/rest/v1/rpc/get_course_management_workspace_v2')result={courses:[],batches:[],summary:{},audits:[]};
  else if(/\/rpc\/(?:can_|organization_has_capability)/.test(url.pathname))result=true;
  else if(url.pathname==='/rest/v1/organization_onboarding')result={status:'completed',enforce_on_sign_in:false};
  else if(url.pathname==='/rest/v1/organization_capabilities')result=[{capability_code:'education_core'},{capability_code:'education_catalog_sync'}];
  else if(url.pathname==='/rest/v1/profiles')result={full_name:'Demo reviewer',role:'admin',active:true};
  else if(req.headers.accept?.includes('application/vnd.pgrst.object+json'))result=null;
  res.end(JSON.stringify(result));
});
server.listen(Number(process.env.UI_FIXTURE_PORT || 3108),'127.0.0.1',()=>console.log('Synthetic UI read service listening on loopback'));
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>server.close(()=>process.exit(0)));
