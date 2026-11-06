import { expect, test } from '@playwright/test';

test.beforeEach(async ({ context }) => {
  const user = {
    id:'00000000-0000-4000-8000-000000000001',
    aud:'authenticated',role:'authenticated',
    email:'reviewer@example.test',app_metadata:{provider:'email'},user_metadata:{},
  };
  const base64=(value:unknown)=>Buffer.from(JSON.stringify(value)).toString('base64url');
  const expires=Math.floor(Date.now()/1000)+3600;
  const token=base64({alg:'HS256',typ:'JWT'})+'.'
    +base64({sub:user.id,role:'authenticated',aud:'authenticated',exp:expires})
    +'.synthetic-local-fixture';
  await context.addCookies([{name:'sb-127-auth-token',
    value:'base64-'+base64({
      access_token:token,refresh_token:'synthetic-local-refresh',
      expires_at:expires,expires_in:3600,token_type:'bearer',user,
    }),domain:'127.0.0.1',path:'/',sameSite:'Lax'}]);
});

test('discovery operator can queue and cancel a simulated scan without API or database writes',async({page})=>{
  let latest:null|Record<string,unknown>=null;
  const actions:string[]=[];
  await page.route('**/api/knowledge/discovery',async route=>{
    const req=route.request();
    const method=req.method();
    if(method==='POST'){
      const body=req.postDataJSON();
      actions.push('start');
      expect(body.url).toBe('https://fixture.example.com/');
      expect(body.maxPages).toBe(30);
      latest={
        id:'11111111-1111-4111-8111-111111111111',
        seed_url:'https://fixture.example.com/',
        status:'queued',max_pages:30,pages_discovered:1,pages_fetched:0,
        pages_blocked:0,pages_failed:0,pages_skipped:0,last_error_code:null,
        created_at:'2026-11-06T00:00:00Z',finished_at:null,
      };
      await route.fulfill({status:202,contentType:'application/json',
        body:JSON.stringify({ok:true,jobId:latest.id,status:'queued'})});
      return;
    }
    if(method==='DELETE'){
      actions.push('cancel');
      expect(req.postDataJSON().jobId).toBe(latest?.id);
      latest={...latest,status:'cancelled',finished_at:'2026-11-06T00:01:00Z'};
      await route.fulfill({status:200,contentType:'application/json',
        body:JSON.stringify({ok:true,status:'cancelled'})});
      return;
    }
    await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({
      ok:true,configuredWebsite:'https://fixture.example.com/',
      discoveryEnabled:true,historyAvailable:true,
      jobs:latest?[latest]:[],pages:[],
    })});
  });

  await page.goto('/settings/knowledge/discovery');
  await expect(page.getByRole('heading',{name:'Website discovery'})).toBeVisible();
  await expect(page.getByRole('textbox',{name:'Configured organization website'}))
    .toHaveValue('https://fixture.example.com/');
  await expect(page.getByText('No scans yet.')).toBeVisible();
  await page.getByRole('button',{name:'Start discovery'}).click();
  await expect(page.getByText('Discovery queued. No AI knowledge has been published.')).toBeVisible();
  await expect(page.getByText('Queued',{exact:true})).toBeVisible();
  await expect(page.getByRole('button',{name:'Start discovery'})).toBeDisabled();
  await page.getByRole('button',{name:'Cancel scan'}).click();
  await expect(page.getByText('Discovery cancelled.')).toBeVisible();
  await expect(page.getByText('Cancelled',{exact:true})).toBeVisible();
  await expect(page.getByRole('button',{name:'Cancel scan'})).toHaveCount(0);
  expect(actions).toEqual(['start','cancel']);
});

test('partial scan inventory is truthful and has no mobile overflow',async({page})=>{
  await page.route('**/api/knowledge/discovery',async route=>{
    await route.fulfill({status:200,contentType:'application/json',
      body:JSON.stringify({
        ok:true,configuredWebsite:'https://fixture.example.com/',
      discoveryEnabled:true,historyAvailable:true,
        jobs:[{
          id:'11111111-1111-4111-8111-111111111111',
          seed_url:'https://fixture.example.com/',status:'partial',
          max_pages:2,pages_discovered:2,pages_fetched:1,
          pages_blocked:1,pages_failed:0,pages_skipped:0,
          created_at:'2026-11-06T00:00:00Z',finished_at:'2026-11-06T00:01:00Z',
          last_error_code:null,
        }],
        pages:[
          {id:'aaa',url:'https://fixture.example.com/',status:'fetched',depth:0,
            http_status:200,page_title:'Example home',failure_code:null},
          {id:'bbb',url:'https://fixture.example.com/private',status:'blocked',depth:1,
            http_status:null,page_title:null,failure_code:'robots_disallow'},
        ],
      })});
  });
  await page.setViewportSize({width:390,height:900});
  await page.goto('/settings/knowledge/discovery');
  await expect(page.getByText('Partial coverage')).toBeVisible();
  await expect(page.getByText('Page cap reached or potentially truncated.')).toBeVisible();
  await expect(page.getByText('robots_disallow')).toBeVisible();
  await expect(page.getByText('Example home')).toBeVisible();
  await expect.poll(()=>page.evaluate(()=>document.documentElement.scrollWidth))
    .toBeLessThanOrEqual(390);
  await page.screenshot({animations:'disabled',path:'test-results/knowledge-discovery-mobile.png'});
});

test('discovery dependency outage does not masquerade as an empty scan',async({page})=>{
  await page.route('**/api/knowledge/discovery',async route=>{
    await route.fulfill({status:503,contentType:'application/json',
      body:JSON.stringify({ok:false,error:'Discovery data unavailable'})});
  });
  await page.goto('/settings/knowledge/discovery');
  await expect(page.getByRole('alert').filter({ hasText: 'Discovery data unavailable' })).toHaveCount(1);
  await expect(page.getByRole('button',{name:'Start discovery'})).toBeDisabled();
  await expect(page.getByText('No scans yet.')).toHaveCount(0);
});


test('paused pilot is read-only and cannot initiate new scans',async({page})=>{
  let mutations=0;
  await page.route('**/api/knowledge/discovery',async route=>{
    if(route.request().method()!=='GET')mutations++;
    await route.fulfill({status:200,contentType:'application/json',
      body:JSON.stringify({
        ok:true,configuredWebsite:'https://fixture.example.com/',
        discoveryEnabled:false,historyAvailable:false,jobs:[],pages:[],
      })});
  });
  await page.goto('/settings/knowledge/discovery');
  await expect(page.getByText('Website discovery is paused or this domain has not been approved for the pilot.')).toBeVisible();
  await expect(page.getByText('Scan history is unavailable while discovery is disabled.')).toBeVisible();
  await expect(page.getByRole('button',{name:'Start discovery'})).toBeDisabled();
  expect(mutations).toBe(0);
});


test('admin ownership challenge is required before discovery can start',async({page})=>{
  let verified=false;
  let issuedToken='';
  const actions:string[]=[];
  await page.route('**/api/knowledge/discovery/verification',async route=>{
    const method=route.request().method();
    if(method==='POST'){
      issuedToken='salsysos-domain-verification='+ 'a'.repeat(64);
      actions.push('issue');
      await route.fulfill({status:201,contentType:'application/json',
        body:JSON.stringify({ok:true,status:'pending',token:issuedToken,
          proofPath:'/.well-known/salsysos-verification.txt'})});
      return;
    }
    if(method==='PUT'){
      actions.push('verify');
      verified=true;
      await route.fulfill({status:200,contentType:'application/json',
        body:JSON.stringify({ok:true,status:'verified',
          verifiedUntil:'2026-12-06T00:00:00Z'})});
      return;
    }
    await route.fulfill({status:200,contentType:'application/json',
      body:JSON.stringify({ok:true,status:verified?'verified':'unverified'})});
  });
  await page.route('**/api/knowledge/discovery',async route=>{
    await route.fulfill({status:200,contentType:'application/json',
      body:JSON.stringify({ok:true,pilotEnabled:true,websiteVerified:verified,
        discoveryEnabled:verified,historyAvailable:true,
        configuredWebsite:'https://fixture.example.com/',jobs:[],pages:[]})});
  });
  await page.goto('/settings/knowledge/discovery');
  await expect(page.getByText('Verify ownership of this website before scanning.')).toBeVisible();
  await expect(page.getByRole('button',{name:'Start discovery'})).toBeDisabled();
  await page.getByRole('button',{name:'Generate token'}).click();
  await expect(page.getByText(issuedToken)).toBeVisible();
  await expect(page.getByText('/.well-known/salsysos-verification.txt')).toBeVisible();
  await page.getByRole('button',{name:'Verify website'}).click();
  await expect(page.getByText('Website ownership verified. Discovery can now be started.')).toBeVisible();
  await expect(page.getByRole('button',{name:'Start discovery'})).toBeEnabled();
  expect(actions).toEqual(['issue','verify']);
});
