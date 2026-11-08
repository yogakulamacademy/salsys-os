// Loopback-only synthetic read service for visual QA. No production credentials,
// tenant creation or application authorization bypass is involved.
import http from 'node:http';
const userId='00000000-0000-4000-8000-000000000001';
const organizationId='00000000-0000-4000-8000-000000000002';
const secondaryOrganizationId='00000000-0000-4000-8000-000000000012';
const user={id:userId,aud:'authenticated',role:'authenticated',email:'reviewer@example.test',app_metadata:{provider:'email'},user_metadata:{},created_at:'2026-01-01T00:00:00Z'};
const workspace={organization_id:organizationId,active_organization_id:organizationId,organization_name:'Demo Academy',organization_slug:'demo-academy',role:'admin',workspace_codes:['sales','marketing','intelligence','operations','automation','system','performance'],organization_status:'active'};
let knowledgeScenario='empty';
let financialScenario='empty';
let refundCalls=[];
let behaviorScenario='ready';
let behaviorTenant='primary';
const activeBehaviorOrganization=()=>behaviorTenant==='secondary'?secondaryOrganizationId:organizationId;
let behaviorCalls=[];
let behaviorTrendCalls=[];
let behaviorBreakdownCalls=[];
const syntheticLeadId='80000000-0000-4000-8000-000000000001';
const originalPaymentId='90000000-0000-4000-8000-000000000001';
const financialPayments=()=>financialScenario==='empty'?[]:[
  {id:originalPaymentId,payment_kind:'deposit',status:'paid',amount:30000,currency:'INR',provider:'bank_transfer',external_payment_id:'deposit-1',metadata:{},created_at:'2026-11-01T10:00:00Z'},
  {id:'90000000-0000-4000-8000-000000000002',payment_kind:'balance',status:'paid',amount:60000,currency:'INR',provider:'bank_transfer',external_payment_id:'balance-1',metadata:{},created_at:'2026-11-01T11:00:00Z'},
  {id:'90000000-0000-4000-8000-000000000003',payment_kind:'refund',status:'refunded',amount:10000,currency:'INR',provider:'bank_transfer',external_payment_id:'refund-1',metadata:financialScenario==='unlinked'?{}:{original_payment_id:originalPaymentId},created_at:'2026-11-01T12:00:00Z'},
];
const server=http.createServer(async(req,res)=>{
  res.setHeader('Content-Type','application/json');
  res.setHeader('Access-Control-Allow-Origin',`http://127.0.0.1:${process.env.UI_TEST_PORT || 3107}`);
  res.setHeader('Access-Control-Allow-Headers','authorization,apikey,content-type,x-client-info');
  if(req.method==='OPTIONS'){res.end('{}');return;}
  const url=new URL(req.url,'http://127.0.0.1:3108');
  if(url.pathname==='/__financial_scenario'){
    const state=url.searchParams.get('state');if(!['empty','paid','unlinked','employee','error'].includes(state)){res.statusCode=400;res.end('{}');return;}
    financialScenario=state;refundCalls=[];res.end('{}');return;
  }
  if(url.pathname==='/__refund_calls'){res.end(JSON.stringify(refundCalls));return;}
  if(url.pathname==='/__behavior_scenario'){
    const state=url.searchParams.get('state');
    const tenant=url.searchParams.get('tenant')||'primary';
    if(!['ready','empty','small','denied','error','funnel-error','trends-error','breakdown-error','malformed-funnel-count','malformed-trends-count','malformed-breakdown-count','malformed-path-low-session','malformed-path-minimum','trends-shifted-calendar','trends-stale-window','trends-daily-session-exceeds-window','trends-window-session-exceeds-daily'].includes(state) ||
       !['primary','secondary'].includes(tenant)){res.statusCode=400;res.end('{}');return;}
    behaviorScenario=state;behaviorTenant=tenant;
    behaviorCalls=[];behaviorTrendCalls=[];behaviorBreakdownCalls=[];
    res.end(JSON.stringify({state,tenant}));return;
  }
  if(url.pathname==='/__behavior_calls'){res.end(JSON.stringify(behaviorCalls));return;}
  if(url.pathname==='/__behavior_trend_calls'){res.end(JSON.stringify(behaviorTrendCalls));return;}
  if(url.pathname==='/__behavior_breakdown_calls'){res.end(JSON.stringify(behaviorBreakdownCalls));return;}
  if(url.pathname==='/__knowledge_scenario'){
    const scenario=url.searchParams.get('state');
    if(!['empty','matched','library-error'].includes(scenario)){res.statusCode=400;res.end('{}');return;}
    knowledgeScenario=scenario;res.end('{}');return;
  }
  let result=[];
  if(url.pathname==='/auth/v1/user')result=user;
  else if(url.pathname==='/rest/v1/rpc/get_current_workspace_context_v1')result={
    ...workspace,
    organization_id:activeBehaviorOrganization(),
    active_organization_id:activeBehaviorOrganization(),
    organization_name:behaviorTenant==='secondary'?'Synthetic Second Tenant':workspace.organization_name,
    role:financialScenario==='employee'?'employee':workspace.role
  };
  else if(url.pathname==='/rest/v1/v_leads_overview')result={id:syntheticLeadId,organization_id:organizationId,lead_name:'Synthetic refund lead',lead_code:'SYN-001',current_stage:'closed_won',intent:'high',current_contact_channel:'whatsapp',created_at:'2026-11-01T09:00:00Z'};
  else if(url.pathname==='/rest/v1/leads')result={organization_id:organizationId,potential_value:90000,potential_currency:'INR'};
  else if(url.pathname==='/rest/v1/payments')result=financialPayments();
  else if(url.pathname==='/rest/v1/rpc/get_current_person_journey_workspace_v1')result={organization_id:organizationId,access_granted:false};
  else if(url.pathname==='/rest/v1/rpc/record_refund_v1'){
    let raw='';for await(const chunk of req)raw+=chunk;refundCalls.push(JSON.parse(raw||'{}'));
    if(financialScenario==='error'){res.statusCode=409;res.end(JSON.stringify({code:'P0001',message:'Refund exceeds the remaining refundable amount'}));return;}
    result={ok:true,payment_id:'90000000-0000-4000-8000-000000000004',replayed:false};
  }
  else if(url.pathname==='/rest/v1/rpc/get_native_behavior_workspace_v1'){
    let raw='';
    for await(const chunk of req) raw+=chunk;
    const body=JSON.parse(raw||'{}');
    // Capture only safe request metadata for synthetic assertions.
    behaviorCalls.push({
      organization_id: body.p_organization_id,
      days: body.p_days,
      steps: body.p_steps,
    });
    if(body.p_organization_id!==activeBehaviorOrganization() || behaviorScenario==='denied'){
      res.statusCode=403;
      res.end(JSON.stringify({code:'42501',message:'Tenant-scoped behavior data unavailable'}));
      return;
    }
    if(behaviorScenario==='error' || behaviorScenario==='funnel-error'){
      res.statusCode=503;
      res.end(JSON.stringify({code:'synthetic_unavailable',message:'Read-only fixture error'}));
      return;
    }
    const steps=Array.isArray(body.p_steps)?body.p_steps:[];
    if(![7,14,30].includes(body.p_days) || steps.length<2 || steps.length>5 || new Set(steps).size!==steps.length){
      res.statusCode=400;
      res.end(JSON.stringify({code:'22023',message:'Invalid funnel definition'}));
      return;
    }
    const sessions=behaviorScenario==='empty'?[0,0,0,0,0]:
      behaviorTenant==='secondary'?[7,5,3,2,1]:[12,8,4,2,1];
    result={
      status:{
        available:true,
        window_days:body.p_days,
        generated_at:'2026-11-05T14:00:00Z',
        path_min_sessions:3,
        path_min_visitors:3,
        aggregation_unit:'source_scoped_visitor_session'
      },
      funnel:steps.map((event_name,i)=>({event_name,sessions:sessions[i]})),
      path_sessions:behaviorScenario==='empty'?0:(behaviorTenant==='secondary'?7:12),
      paths:behaviorScenario==='empty'?[]:behaviorTenant==='secondary'?[
        {from_path:'/courses/second-tenant.php',to_path:'/contact.php',sessions:5,transitions:6}
      ]:[
        {from_path:'/courses/200-hour-ytt.php',to_path:'/enroll.php',sessions:8,transitions:11},
        {from_path:'/private?email=student@example.test',to_path:'/enroll.php',sessions:6,transitions:6},
        // Deliberately malformed RPC output simulates a SQL privacy regression;
        // the server layer must still suppress these otherwise clean-looking routes.
        {from_path:'/account/billing.php',to_path:'/enroll.php',sessions:6,transitions:6},
        {from_path:'/courses/200-hour-ytt.php',to_path:'/students/dashboard',sessions:6,transitions:6},
      ]
    };
    if(behaviorScenario==='malformed-funnel-count') result.funnel[0].sessions=null;
    if(behaviorScenario==='malformed-path-low-session') {
      // 2 distinct sessions cannot possibly represent 3 distinct visitors.
      // Keep the public path syntactically clean to test the actual k guard.
      result.paths[0].sessions=2;
    }
    if(behaviorScenario==='malformed-path-minimum') {
      // Metadata claiming only one session is sufficient must fail closed.
      result.status.path_min_sessions=1;
    }
  }
  else if(url.pathname==='/rest/v1/rpc/get_native_behavior_event_trends_v1'){
    let raw='';
    for await(const chunk of req) raw+=chunk;
    const body=JSON.parse(raw||'{}');
    behaviorTrendCalls.push({organization_id:body.p_organization_id,days:body.p_days,events:body.p_events});
    if(body.p_organization_id!==activeBehaviorOrganization() || behaviorScenario==='denied'){
      res.statusCode=403;
      res.end(JSON.stringify({code:'42501',message:'Tenant-scoped trends unavailable'}));
      return;
    }
    if(behaviorScenario==='error' || behaviorScenario==='trends-error'){
      res.statusCode=503;
      res.end(JSON.stringify({code:'synthetic_unavailable',message:'Synthetic trends unavailable'}));
      return;
    }
    const events=Array.isArray(body.p_events)?body.p_events:[];
    if(![7,14,30].includes(body.p_days) || events.length<1 || events.length>5 ||
      new Set(events).size!==events.length){
      res.statusCode=400;
      res.end(JSON.stringify({code:'22023',message:'Invalid trend request'}));
      return;
    }
    const midnight=new Date();
    midnight.setUTCHours(0,0,0,0);
    const dates=Array.from({length:body.p_days},(_,i)=>
      new Date(midnight.getTime()-(body.p_days-1-i)*86400000).toISOString().slice(0,10));
    result={
      status:{
        available:true,window_days:body.p_days,timezone:'UTC',generated_at:new Date().toISOString(),
        first_day_utc:dates[0],last_day_utc:dates[dates.length-1],last_day_incomplete:true
      },
      series:events.map((event_name,index)=>{
        const daily=dates.map((date_utc,i)=>{
          const count=behaviorScenario==='empty'?0:
            behaviorTenant==='secondary'
              ? index===0?3+i%3:index===1?i%2:(i%5===0?1:0)
              : index===0?2+i%3:index===1?i%3:(i%4===0?1:0);
          return {date_utc,events:count,sessions:Math.min(count,2)};
        });
        const total_events=daily.reduce((sum,day)=>sum+day.events,0);
        return {event_name,total_events,observed_sessions:Math.min(total_events,5),daily};
      })
    };
    if(behaviorScenario==='malformed-trends-count') result.series[0].daily[0].sessions=null;
    if(behaviorScenario==='trends-daily-session-exceeds-window'){
      // Valid event counts but a day's source-scoped DISTINCT session count
      // exceeds the whole-window DISTINCT set: impossible by construction.
      result.series[0].observed_sessions=1;
    }
    if(behaviorScenario==='trends-window-session-exceeds-daily'){
      // Valid day dates and event totals, yet the window DISTINCT cardinality
      // exceeds the sum of all daily sets. Reject rather than report a zero.
      const dailySessionSum=result.series[0].daily.reduce((sum,day)=>sum+day.sessions,0);
      result.series[0].observed_sessions=dailySessionSum+1;
    }

    if(behaviorScenario==='trends-shifted-calendar'){
      // Still valid and sorted, yet one date is outside the claimed calendar domain.
      result.series[0].daily[0].date_utc=
        new Date(midnight.getTime()-body.p_days*86400000).toISOString().slice(0,10);
    }
    if(behaviorScenario==='trends-stale-window'){
      // Consistent historical days/status are not the report's current UTC day.
      const shift=(day)=>new Date(Date.parse(day+'T00:00:00Z')-86400000).toISOString().slice(0,10);
      result.status.first_day_utc=shift(result.status.first_day_utc);
      result.status.last_day_utc=shift(result.status.last_day_utc);
      for(const series of result.series){
        for(const day of series.daily) day.date_utc=shift(day.date_utc);
      }
    }
  }
  else if(url.pathname==='/rest/v1/rpc/get_native_behavior_page_breakdown_v1'){
    let raw='';
    for await(const chunk of req) raw+=chunk;
    const body=JSON.parse(raw||'{}');
    behaviorBreakdownCalls.push({
      organization_id:body.p_organization_id,days:body.p_days,event:body.p_event
    });
    if(body.p_organization_id!==activeBehaviorOrganization() || behaviorScenario==='denied'){
      res.statusCode=403;
      res.end(JSON.stringify({code:'42501',message:'Tenant breakdown unavailable'}));
      return;
    }
    if(behaviorScenario==='error' || behaviorScenario==='breakdown-error'){
      res.statusCode=503;
      res.end(JSON.stringify({code:'synthetic_unavailable',message:'Synthetic sensitive error'}));
      return;
    }
    if(![7,14,30].includes(body.p_days) ||
      typeof body.p_event!=='string' || !/^web\.[a-z][a-z0-9_]*$/.test(body.p_event)){
      res.statusCode=400;
      res.end(JSON.stringify({code:'22023',message:'Invalid breakdown request'}));
      return;
    }
    const empty=behaviorScenario==='empty';
    const small=behaviorScenario==='small';
    const secondary=behaviorTenant==='secondary';
    result={
      status:{
        available:true,event_name:body.p_event,window_days:body.p_days,
        timezone:'UTC',generated_at:new Date().toISOString(),
        min_distinct_visitors:3,max_displayed_pages:10,
        total_events:empty?0:(small?2:(secondary?24:60)),
        safe_path_events:empty?0:(small?2:(secondary?18:51)),
        identified_sessions:empty?0:(small?1:(secondary?14:30)),
        displayed_events:empty||small?0:(secondary?18:43),
        hidden_or_other_events:empty?0:(small?2:(secondary?6:17))
      },
      pages:empty||small?[]:secondary?[
        {path:'/courses/second-tenant.php',events:12,sessions:9,visitors:6},
        {path:'/contact.php',events:6,sessions:5,visitors:3}
      ]:[
        {path:'/courses/200-hour-ytt.php',events:30,sessions:22,visitors:12},
        {path:'/enroll.php',events:13,sessions:9,visitors:5}
      ]
    };
    if(behaviorScenario==='malformed-breakdown-count') result.status.identified_sessions=null;
  }
  else if(url.pathname==='/rest/v1/rpc/get_current_provider_visibility_v1')result={organization_id:organizationId,google_connected:false,meta_connected:false,instagram_connected:false,whatsapp_connected:false};
  else if(url.pathname==='/rest/v1/rpc/get_admissions_snapshot')result={metrics:{needs_reply:0,unread:0},priority_queue:[],batch_capacity:[]};
  else if(url.pathname==='/rest/v1/rpc/get_course_management_workspace_v2')result={courses:[],batches:[],summary:{},audits:[]};
  else if(/\/rpc\/(?:can_|organization_has_capability)/.test(url.pathname))result=true;
  else if(url.pathname==='/rest/v1/organization_onboarding')result={status:'completed',enforce_on_sign_in:false};
  else if(url.pathname==='/rest/v1/organization_capabilities')result=[{capability_code:'education_core'},{capability_code:'education_catalog_sync'}];
  else if(url.pathname==='/rest/v1/knowledge_documents'){
    if(knowledgeScenario==='library-error'){res.statusCode=503;res.end(JSON.stringify({code:'synthetic_unavailable',message:'Synthetic knowledge library unavailable'}));return;}
    if(knowledgeScenario==='matched')result=[{id:'50000000-0000-4000-8000-000000000001',title:'Synthetic transfer policy',category:'transfers',status:'approved',content:'Synthetic transfer guidance for preview tests only.',version:2,valid_from:null,valid_until:null,approved_at:'2026-11-01T00:00:00Z',created_at:'2026-11-01T00:00:00Z',updated_at:'2026-11-01T00:00:00Z'}];
  }
  else if(url.pathname==='/rest/v1/rpc/search_organization_knowledge_v1'){
    let raw='';for await(const chunk of req)raw+=chunk;const body=JSON.parse(raw||'{}');
    if(body.p_query==='fail'){res.statusCode=503;res.end(JSON.stringify({code:'synthetic_unavailable',message:'Synthetic retrieval unavailable'}));return;}
    if(knowledgeScenario==='matched'&&body.p_query!=='no-match')result=[{chunk_id:'40000000-0000-4000-8000-000000000001',document_id:'50000000-0000-4000-8000-000000000001',title:'Synthetic transfer policy',category:'transfers',content:'Synthetic transfer guidance for preview tests only.',rank:.5,valid_until:null,metadata:{document_version:2}}];
  }
  else if(url.pathname==='/rest/v1/profiles')result={full_name:'Demo reviewer',role:'admin',active:true};
  else if(req.headers.accept?.includes('application/vnd.pgrst.object+json'))result=null;
  res.end(JSON.stringify(result));
});
server.listen(Number(process.env.UI_FIXTURE_PORT || 3108),'127.0.0.1',()=>console.log('Synthetic UI read service listening on loopback'));
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>server.close(()=>process.exit(0)));
