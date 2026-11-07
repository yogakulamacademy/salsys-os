import { expect, test } from '@playwright/test';

test.beforeEach(async({ context }) => {
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
  await context.addCookies([{
    name:'sb-127-auth-token',
    value:'base64-'+base64({
      access_token:token,refresh_token:'synthetic-local-refresh',
      expires_at:expires,expires_in:3600,token_type:'bearer',user,
    }),domain:'127.0.0.1',path:'/',sameSite:'Lax',
  }]);
});
const text='SYNTHETIC ONLY. <script>window.__unapproved = true</script> No actual policy or legal notice is approved.';
const doc={
  ok:true,reviewEnabled:true,available:true,
  policyVersion:'fixture-reviewed-version-v1',
  policySha256:'a'.repeat(64),policyText:text,
  sourceReference:'fixture:operator-nonlegal-evidence',
  recordedAt:'2026-11-07T01:00:00.000Z',
  registryRecordedAt:'2026-11-07T02:00:00.000Z',
};

test('KB-06E disabled: no policy text, approval, crawl or browser write',async({page})=>{
  const writes:string[]=[];
  page.on('request',req=>{
    if(req.method()!=='GET' && req.url().includes('/api/knowledge/discovery')) writes.push(req.url());
  });
  await page.route('**/api/knowledge/discovery/policy',async route=>{
    await route.fulfill({contentType:'application/json',body:JSON.stringify({
      ok:true,reviewEnabled:false,available:false,policyText:text,
    })});
  });
  await page.route('**/api/knowledge/discovery/consent',async route=>{
    await route.fulfill({contentType:'application/json',body:JSON.stringify({
      ok:true,managementEnabled:false,readEnabled:false,records:[],audit:[],
    })});
  });
  await page.goto('/settings/knowledge/discovery/consent');
  const region=page.getByRole('region',{name:'Policy document review'});
  await expect(region.getByText('Policy document review is disabled in this environment.',{exact:false})).toBeVisible();
  await expect(region.getByText(text,{exact:true})).toHaveCount(0);
  await expect(page.getByRole('button',{name:'Grant consent unavailable'})).toBeDisabled();
  expect(writes).toEqual([]);
});

test('KB-06E registered policy is plain text, not clickable HTML or legal consent',async({page})=>{
  const writes:string[]=[];
  page.on('request',req=>{
    if(req.method()!=='GET'&&req.url().includes('/api/knowledge/discovery')) writes.push(req.url());
  });
  await page.route('**/api/knowledge/discovery/policy',async route=>{
    await route.fulfill({contentType:'application/json',body:JSON.stringify(doc)});
  });
  await page.route('**/api/knowledge/discovery/consent',async route=>{
    await route.fulfill({contentType:'application/json',body:JSON.stringify({
      ok:true,managementEnabled:false,readEnabled:false,records:[],audit:[],
    })});
  });
  await page.goto('/settings/knowledge/discovery/consent');
  const region=page.getByRole('region',{name:'Policy document review'});
  await expect(region.getByText(doc.policyVersion)).toBeVisible();
  await expect(region.getByText(doc.sourceReference)).toBeVisible();
  await expect(region.getByText(doc.policySha256)).toBeVisible();
  await expect(region.getByRole('region',{name:'Exact registered policy text'})).toHaveText(text);
  await expect(region.getByText('Read-only review. No acknowledgement is saved',{exact:false})).toBeVisible();
  expect(await page.locator('script[src],script:not([src])').evaluateAll(
    nodes=>nodes.some(x=>x.textContent?.includes('window.__unapproved = true')))).toBe(false);
  await expect(page.getByRole('button',{name:'Grant consent unavailable'})).toBeDisabled();
  expect(writes).toEqual([]);
});

test('KB-06E mismatched or absent registered policy is not fabricated',async({page})=>{
  await page.route('**/api/knowledge/discovery/policy',async route=>{
    await route.fulfill({contentType:'application/json',body:JSON.stringify({
      ok:true,reviewEnabled:true,available:false,
    })});
  });
  await page.route('**/api/knowledge/discovery/consent',async route=>{
    await route.fulfill({contentType:'application/json',body:JSON.stringify({
      ok:true,readEnabled:false,managementEnabled:false,records:[],audit:[],
    })});
  });
  await page.goto('/settings/knowledge/discovery/consent');
  await expect(page.getByText('No digest-matched policy document is registered for review.',{exact:false})).toBeVisible();
  await expect(page.getByRole('region',{name:'Exact registered policy text'})).toHaveCount(0);
});

test('KB-06E API denial is not an empty policy approval',async({page})=>{
  await page.route('**/api/knowledge/discovery/policy',async route=>{
    await route.fulfill({status:403,contentType:'application/json',body:JSON.stringify({
      ok:false,error:'Unauthorized',
    })});
  });
  await page.route('**/api/knowledge/discovery/consent',async route=>{
    await route.fulfill({contentType:'application/json',body:JSON.stringify({
      ok:true,readEnabled:false,managementEnabled:false,records:[],audit:[],
    })});
  });
  await page.goto('/settings/knowledge/discovery/consent');
  await expect(page.getByRole('region',{name:'Policy document review'}).getByRole('alert')).toBeVisible();
  await expect(page.getByRole('region',{name:'Exact registered policy text'})).toHaveCount(0);
});

test('KB-06E policy review has no mobile overflow or submission',async({page})=>{
  const methods:string[]=[];
  await page.route('**/api/knowledge/discovery/policy',async route=>{
    methods.push(route.request().method());
    await route.fulfill({contentType:'application/json',body:JSON.stringify(doc)});
  });
  await page.route('**/api/knowledge/discovery/consent',async route=>{
    await route.fulfill({contentType:'application/json',body:JSON.stringify({
      ok:true,readEnabled:false,managementEnabled:false,records:[],audit:[],
    })});
  });
  await page.setViewportSize({width:375,height:800});
  await page.goto('/settings/knowledge/discovery/consent');
  await expect(page.getByRole('region',{name:'Exact registered policy text'})).toBeVisible();
  await expect.poll(()=>page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(375);
  expect(methods).toEqual(['GET']);
});
