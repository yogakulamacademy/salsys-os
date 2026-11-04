import {expect,test} from '@playwright/test';

test.beforeEach(async({context})=>{
  const user={id:'00000000-0000-4000-8000-000000000001',aud:'authenticated',
    role:'authenticated',email:'reviewer@example.test',app_metadata:{provider:'email'},user_metadata:{}};
  const b64=(value:unknown)=>Buffer.from(JSON.stringify(value)).toString('base64url');
  const expires=Math.floor(Date.now()/1000)+3600;
  const token=b64({alg:'HS256',typ:'JWT'})+'.'
    +b64({sub:user.id,role:'authenticated',aud:'authenticated',exp:expires})
    +'.synthetic-local-fixture';
  await context.addCookies([{name:'sb-127-auth-token',
    value:'base64-'+b64({access_token:token,refresh_token:'synthetic-local-refresh',
      expires_at:expires,expires_in:3600,token_type:'bearer',user}),
    domain:'127.0.0.1',path:'/',sameSite:'Lax'}]);
});

test('Inbox V2 retains an unselected opening with live filters and empty results',async({page})=>{
  await page.goto('/conversations');
  await expect(page.getByRole('heading',{name:'Inbox',exact:true,includeHidden:true})).toBeAttached();
  await expect(page.getByText('Select a conversation',{exact:true})).toBeVisible();
  const tabs=page.getByRole('tablist',{name:'Conversation filters'});
  await expect(tabs.getByRole('tab',{name:/Needs reply/})).toBeVisible();
  await expect(tabs.getByRole('tab',{name:/Unread/})).toBeVisible();
  await expect(tabs.getByRole('tab',{name:/Snoozed/})).toBeVisible();
  await page.getByRole('textbox',{name:'Search conversations'}).fill('this-contact-does-not-exist');
  await expect(page.getByText('No matching conversations',{exact:true})).toBeVisible();
  await expect(page.getByRole('button',{name:'Reset inbox filters'})).toBeVisible();
  await page.screenshot({animations:'disabled',path:'test-results/inbox-v2-empty-desktop.png'});
  for(const width of [390,768,1024,1440]){
    await page.setViewportSize({width,height:900});
    await expect.poll(()=>page.evaluate(()=>document.documentElement.scrollWidth),
      {message:'Inbox V2 horizontal overflow at '+width}).toBeLessThanOrEqual(width);
  }
  await page.screenshot({animations:'disabled',path:'test-results/inbox-v2-empty-mobile.png'});
});

test('Selected Inbox thread exposes real Notes, Activity and customer context',async({page})=>{
  await page.setViewportSize({width:1440,height:980});
  await page.goto('/conversations');
  const first=page.locator('.conversation-sidebar a[href^="/conversations?lead="]').first();
  await expect(first).toBeVisible();
  await first.click();
  await expect(page.getByRole('tab',{name:'Conversation',exact:true})).toBeVisible();
  await expect(page.getByRole('tab',{name:/Activity/})).toBeVisible();
  await page.getByRole('tab',{name:/Notes/}).click();
  await expect(page.getByRole('heading',{name:'Private team notes'})).toBeVisible();
  await expect(page.getByRole('button',{name:/Next step/})).toBeVisible();
  await expect(page.getByRole('button',{name:'Mark done'})).toBeDisabled();
  await expect(page.getByRole('heading',{name:'Lead overview'})).toBeVisible();
  await expect(page.getByRole('combobox',{name:'Lead stage'})).toBeDisabled();
  await expect(page.getByRole('link',{name:'Open customer profile'})).toBeVisible();
  await expect(page.locator('.ibx-v2-context')).toBeVisible();
  await page.getByRole('button',{name:'Hide customer context'}).click();
  await expect(page.locator('.inbox-desktop-context')).toHaveCount(0);
  await page.screenshot({animations:'disabled',path:'test-results/inbox-v2-selected-desktop.png'});
  await page.setViewportSize({width:768,height:900});
  await page.getByRole('button',{name:'Open customer context'}).click();
  await expect(page.getByRole('dialog',{name:'Customer context'})).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog',{name:'Customer context'})).toHaveCount(0);
});
