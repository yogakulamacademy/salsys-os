import {test,expect} from '@playwright/test';
const source='http://127.0.0.1:3178';
const lead='/leads/80000000-0000-4000-8000-000000000001';
const original='90000000-0000-4000-8000-000000000001';
test.beforeEach(async({context,request})=>{
  await request.get(`${source}/__financial_scenario?state=paid`);
  const user={id:'00000000-0000-4000-8000-000000000001',aud:'authenticated',role:'authenticated',email:'reviewer@example.test',app_metadata:{provider:'email'},user_metadata:{}};
  const b64=(v:unknown)=>Buffer.from(JSON.stringify(v)).toString('base64url');
  const expires=Math.floor(Date.now()/1000)+3600;
  const token=`${b64({alg:'HS256',typ:'JWT'})}.${b64({sub:user.id,role:'authenticated',aud:'authenticated',exp:expires})}.synthetic-local-fixture`;
  await context.addCookies([{name:'sb-127-auth-token',value:`base64-${b64({access_token:token,refresh_token:'synthetic-local-refresh',expires_at:expires,expires_in:3600,token_type:'bearer',user})}`,domain:'127.0.0.1',path:'/',sameSite:'Lax'}]);
});
test('refund form shows linked remaining balance, locks currency and keeps cents',async({page})=>{
  await page.goto(lead);
  const card=page.locator('#payment-review');
  await card.locator('summary').filter({hasText:'Record refund'}).click();
  const form=card.locator('form').filter({has:page.locator('[name=refund_request_id]')});
  await expect(form.getByRole('button',{name:'Record refund',exact:true})).toBeDisabled();
  await expect(form.getByLabel('Original paid transaction')).toContainText('INR 20000.00 available');
  await form.getByLabel('Original paid transaction').selectOption(original);
  await expect(form.getByLabel('Refund amount')).toHaveAttribute('max','20000');
  await expect(form.getByLabel('Currency')).toHaveValue('INR');
  await expect(form.getByLabel('Currency')).toHaveAttribute('readonly','');
  await expect(card).toContainText('80,000.00');
  await form.getByLabel('Refund amount').fill('20000.01');
  expect(await form.getByLabel('Refund amount').evaluate((input:HTMLInputElement)=>input.validity.rangeOverflow)).toBe(true);
  await page.setViewportSize({width:390,height:900});
  await expect.poll(()=>card.evaluate(el=>el.scrollWidth<=el.clientWidth)).toBe(true);
  await form.screenshot({path:'test-results/refund-mobile.png',animations:'disabled'});
});
test('unlinked refunds require reconciliation; employee cannot see financial mutation controls',async({page,request})=>{
  await request.get(`${source}/__financial_scenario?state=unlinked`);await page.goto(lead);
  const card=page.locator('#payment-review');await card.locator('summary').filter({hasText:'Record refund'}).click();
  await expect(card.getByText(/Existing unlinked refunds need reconciliation/)).toBeVisible();
  await expect(card.getByRole('button',{name:'Record refund',exact:true})).toBeDisabled();
  await request.get(`${source}/__financial_scenario?state=employee`);await page.reload();
  await expect(card.getByText('Record refund',{exact:true})).toHaveCount(0);
  await expect(card.getByText('Verify received payment',{exact:true})).toHaveCount(0);
});
test('no payment records has an explanatory empty state and no zero-stat strip',async({page,request})=>{
  await request.get(`${source}/__financial_scenario?state=empty`);await page.goto(lead);
  const card=page.locator('#payment-review');
  await expect(card.getByText('No payments recorded yet',{exact:true})).toBeVisible();
  await expect(card.getByText('Verified net paid',{exact:true})).toHaveCount(0);
});
test('server rejection stays an error and uses one canonical refund command',async({page,request})=>{
  await request.get(`${source}/__financial_scenario?state=error`);await page.goto(lead);
  const card=page.locator('#payment-review');await card.locator('summary').filter({hasText:'Record refund'}).click();
  const form=card.locator('form').filter({has:page.locator('[name=refund_request_id]')});
  await form.getByLabel('Original paid transaction').selectOption(original);
  await form.getByLabel('Refund amount').fill('100.25');
  await form.getByLabel('Reason and verification evidence').fill('Synthetic bank confirmation checked');
  page.on('dialog',dialog=>dialog.accept());
  await form.getByRole('button',{name:'Record refund',exact:true}).click();
  await expect(page).toHaveURL(/error=Refund/);
  const calls=await(await request.get(`${source}/__refund_calls`)).json();
  expect(calls).toHaveLength(1);expect(calls[0].p_original_payment_id).toBe(original);
  expect(calls[0].p_amount).toBe(100.25);expect(calls[0].p_request_id).toMatch(/^[a-f0-9-]{36}$/);
});
