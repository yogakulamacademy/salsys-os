import { expect, test } from '@playwright/test';

test.beforeEach(async({context})=>{
  const user={
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

test('admin can plan review of source quotes but cannot approve or publish',async({page})=>{
  const writes:string[]=[];
  page.on('request',req=>{
    if(req.method()!=='GET' && /\/(?:api\/knowledge|rest\/v1\/knowledge_)/.test(req.url())){
      writes.push(req.method()+' '+req.url());
    }
  });
  await page.goto('/settings/knowledge/evidence-preview');
  await expect(page.getByRole('heading',{name:'Evidence review'})).toBeVisible();
  await expect(page.getByText('Preview only — no evidence is saved')).toBeVisible();
  await expect(page.getByText('Introduction workshop: 2 days.')).toBeVisible();
  await expect(page.getByText('Introduction workshop | $150')).toBeVisible();
  await expect(page.getByText('Can I reschedule?')).toBeVisible();

  const counts=page.getByRole('region',{name:'Evidence review counts'});
  await expect(counts.getByText('For later review')).toBeVisible();
  await expect(counts.getByText('10',{exact:true})).toHaveCount(2);
  const first=page.getByRole('article').filter({hasText:'Introduction workshop: 2 days.'});
  await first.getByRole('button',{name:'For later review'}).click();
  await expect(first.locator('span').filter({hasText:'For later review'})).toHaveCount(1);
  const fee=page.getByRole('article').filter({hasText:'Introduction workshop | $150'});
  await fee.getByRole('button',{name:'Exclude'}).click();
  await expect(fee.locator('span').filter({hasText:'Excluded'})).toHaveCount(1);

  await page.getByRole('group',{name:'Filter evidence'}).getByRole('button',{name:'For later review'}).click();
  await expect(page.getByRole('article')).toHaveCount(1);
  await expect(page.getByRole('button',{name:'Publish knowledge (disabled)'})).toBeDisabled();
  expect(writes).toEqual([]);
});

test('filters and reset are local to the tab and cannot silently persist',async({page})=>{
  await page.goto('/settings/knowledge/evidence-preview');
  const article=page.getByRole('article').filter({hasText:'Advanced workshop: 5 days.'});
  await article.getByRole('button',{name:'For later review'}).click();
  await page.getByRole('group',{name:'Filter evidence'}).getByRole('button',{name:'For later review'}).click();
  await expect(page.getByRole('article')).toHaveCount(1);
  await page.getByRole('button',{name:'Reset preview'}).click();
  await expect(page.getByRole('article')).toHaveCount(10);
  await page.reload();
  await expect(page.getByRole('article')).toHaveCount(10);
  await expect(page.getByText('All evidence',{exact:true})).toBeVisible();
});

test('review preview remains readable without horizontal overflow on mobile',async({page})=>{
  await page.setViewportSize({width:390,height:844});
  await page.goto('/settings/knowledge/evidence-preview');
  await expect(page.getByRole('heading',{name:'Evidence review'})).toBeVisible();
  await expect.poll(()=>page.evaluate(()=>document.documentElement.scrollWidth))
    .toBeLessThanOrEqual(390);
});
