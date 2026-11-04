import { expect, test } from '@playwright/test';
const source = 'http://127.0.0.1:3168';

test.beforeEach(async ({ context, request }) => {
  await request.get(source + '/__knowledge_scenario?state=empty');
  const user = { id:'00000000-0000-4000-8000-000000000001', aud:'authenticated',
    role:'authenticated', email:'reviewer@example.test',
    app_metadata:{provider:'email'}, user_metadata:{} };
  const b64=(value:unknown)=>Buffer.from(JSON.stringify(value)).toString('base64url');
  const expires=Math.floor(Date.now()/1000)+3600;
  const token=b64({alg:'HS256',typ:'JWT'})+'.'+b64({sub:user.id,role:'authenticated',aud:'authenticated',exp:expires})+'.synthetic-local-fixture';
  await context.addCookies([{name:'sb-127-auth-token',
    value:'base64-'+b64({access_token:token,refresh_token:'synthetic-local-refresh',
      expires_at:expires,expires_in:3600,token_type:'bearer',user}),
    domain:'127.0.0.1',path:'/',sameSite:'Lax'}]);
});
test('new Organization Knowledge empty state and approval guard are responsive',async({page})=>{
  await page.goto('/settings/knowledge');
  await expect(page.getByRole('heading',{name:'Organization Knowledge'})).toBeVisible();
  await expect(page.getByRole('heading',{name:'Co-Pilot Readiness'})).toBeVisible();
  await expect(page.getByRole('heading',{name:'Knowledge Library'})).toBeVisible();
  await expect(page.getByRole('heading',{name:'No knowledge added yet'})).toBeVisible();
  await expect(page.getByText('Build your approved business knowledge')).toBeVisible();
  await expect(page.getByRole('heading',{name:'Test your knowledge'})).toBeVisible();
  await expect(page.getByRole('button',{name:'Save as Draft'})).toBeVisible();
  await expect(page.getByRole('button',{name:'Save & Approve'})).toBeVisible();
  await expect(page.getByText('92%',{exact:true})).toHaveCount(0);
  await page.screenshot({animations:'disabled',path:'test-results/knowledge-redesign-desktop.png'});
  for (const width of [1280,768,390]) {
    await page.setViewportSize({width,height:900});
    await expect.poll(()=>page.evaluate(()=>document.documentElement.scrollWidth),
      {message:'Knowledge page should not overflow at '+width+'px'}).toBeLessThanOrEqual(width);
  }
  await page.screenshot({animations:'disabled',path:'test-results/knowledge-redesign-mobile.png'});
});
test('knowledge templates prefill navigation but do not create unapproved factual claims',async({page})=>{
  await page.goto('/settings/knowledge');
  await page.getByRole('link',{name:'Policy',exact:true}).click();
  await expect(page).toHaveURL(/template=policy/);
  await expect(page.getByRole('textbox',{name:'Title'})).toHaveValue('Refund policy');
  await expect(page.getByRole('textbox',{name:'Approved answer \/ policy'})).toBeEmpty();
  await expect(page.getByRole('textbox',{name:/Source name/})).toBeEmpty();
  await page.getByText(/Source details & validity/).click();
  await expect(page.getByRole('combobox',{name:'Source type'})).toBeVisible();
  await expect(page.getByRole('textbox',{name:/Source reference URL/})).toBeVisible();
  await expect(page.getByText(/SalsysOS does not fetch this URL/)).toBeVisible();
});
