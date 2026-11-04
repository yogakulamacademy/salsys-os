import { expect, test } from '@playwright/test';

test.beforeEach(async ({ context }) => {
  const user = {
    id:'00000000-0000-4000-8000-000000000001',
    aud:'authenticated', role:'authenticated', email:'reviewer@example.test',
    app_metadata:{provider:'email'}, user_metadata:{},
  };
  const b64 = (value:unknown) => Buffer.from(JSON.stringify(value)).toString('base64url');
  const expires = Math.floor(Date.now()/1000) + 3600;
  const token = b64({alg:'HS256',typ:'JWT'})+'.'+
    b64({sub:user.id,role:'authenticated',aud:'authenticated',exp:expires})+
    '.synthetic-local-fixture';
  const session = {
    access_token:token, refresh_token:'synthetic-local-refresh',
    expires_at:expires, expires_in:3600, token_type:'bearer', user,
  };
  await context.addCookies([{
    name:'sb-127-auth-token', value:'base64-'+b64(session),
    domain:'127.0.0.1', path:'/', sameSite:'Lax',
  }]);
});

test('CRM Rules shows real configuration categories and evidence-safe mock state',async({page})=>{
  await page.goto('/settings');
  await expect(page.getByRole('heading',{name:'CRM Rules',exact:true})).toBeVisible();
  await expect(page.getByRole('heading',{name:'Pipeline Configuration'})).toBeVisible();
  await expect(page.getByRole('heading',{name:'Operational Connections'})).toBeVisible();
  await expect(page.getByRole('heading',{name:'Security & Governance'})).toBeVisible();
  await expect(page.getByRole('heading',{name:'Recent Changes / Audit'})).toBeVisible();
  await expect(page.getByText('Reference defaults only · not tenant data')).toBeVisible();
  await expect(page.getByRole('button',{name:'Save Changes'})).toBeDisabled();
  await expect(page.getByRole('button',{name:'Reset unsaved pipeline changes'})).toBeDisabled();
  await expect(page.getByText('92%',{exact:true})).toHaveCount(0);
  await page.screenshot({animations:'disabled',path:'test-results/crm-rules-desktop.png'});
});

test('CRM Rules reveals additional stages without horizontal overflow on responsive sizes',async({page})=>{
  await page.goto('/settings');
  await expect(page.getByRole('button',{name:/Show all 12 stages/})).toBeVisible();
  await page.getByRole('button',{name:/Show all 12 stages/}).click();
  await expect(page.getByRole('button',{name:/Show fewer stages/})).toBeVisible();
  await expect(page.getByRole('spinbutton',{name:'Duplicate forecast probability'})).toBeVisible();
  for (const width of [1440,1024,768,390]){
    await page.setViewportSize({width,height:900});
    await expect.poll(()=>page.evaluate(()=>document.documentElement.scrollWidth),
      {message:'CRM Rules must not cause document overflow at '+width+'px'}).toBeLessThanOrEqual(width);
  }
  await page.screenshot({animations:'disabled',path:'test-results/crm-rules-mobile.png'});
});
