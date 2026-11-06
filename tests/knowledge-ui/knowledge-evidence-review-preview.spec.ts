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
  // The exact quote also appears in the read-only candidate section;
  // scope assertions to the original evidence list to avoid ambiguity.
  const evidenceList=page.getByRole('region',{name:'Evidence entries'});
  await expect(evidenceList.getByText('Introduction workshop: 2 days.')).toBeVisible();
  await expect(evidenceList.getByText('Introduction workshop | $150')).toBeVisible();
  await expect(evidenceList.getByText('Can I reschedule?')).toBeVisible();

  const counts=page.getByRole('region',{name:'Evidence review counts'});
  await expect(counts.getByText('For later review')).toBeVisible();
  await expect(counts.getByText('10',{exact:true})).toHaveCount(2);
  const first=page.getByRole('region',{name:'Evidence entries'}).getByRole('article').filter({hasText:'Introduction workshop: 2 days.'});
  await first.getByRole('button',{name:'For later review'}).click();
  await expect(first.locator('span').filter({hasText:'For later review'})).toHaveCount(1);
  const fee=page.getByRole('region',{name:'Evidence entries'}).getByRole('article').filter({hasText:'Introduction workshop | $150'});
  await fee.getByRole('button',{name:'Exclude'}).click();
  await expect(fee.locator('span').filter({hasText:'Excluded'})).toHaveCount(1);

  await page.getByRole('group',{name:'Filter evidence'}).getByRole('button',{name:'For later review'}).click();
  await expect(page.getByRole('region',{name:'Evidence entries'}).getByRole('article')).toHaveCount(1);
  await expect(page.getByRole('button',{name:'Publish knowledge (disabled)'})).toBeDisabled();
  expect(writes).toEqual([]);
});

test('filters and reset are local to the tab and cannot silently persist',async({page})=>{
  await page.goto('/settings/knowledge/evidence-preview');
  const article=page.getByRole('region',{name:'Evidence entries'}).getByRole('article').filter({hasText:'Advanced workshop: 5 days.'});
  await article.getByRole('button',{name:'For later review'}).click();
  await page.getByRole('group',{name:'Filter evidence'}).getByRole('button',{name:'For later review'}).click();
  await expect(page.getByRole('region',{name:'Evidence entries'}).getByRole('article')).toHaveCount(1);
  await page.getByRole('button',{name:'Reset preview'}).click();
  await expect(page.getByRole('region',{name:'Evidence entries'}).getByRole('article')).toHaveCount(10);
  await page.reload();
  await expect(page.getByRole('region',{name:'Evidence entries'}).getByRole('article')).toHaveCount(10);
  await expect(page.getByText('All evidence',{exact:true})).toBeVisible();
});

test('review preview names consent and deletion safeguards without enabling storage',async({page})=>{
  await page.goto('/settings/knowledge/evidence-preview');
  const readiness=page.getByRole('region',{name:'Evidence lifecycle readiness'});
  await expect(readiness.getByText('Consent and retention readiness')).toBeVisible();
  await expect(readiness.getByText('No storage controls have been verified here.',{exact:false})).toBeVisible();
  await readiness.getByText('Review 9 required storage safeguards').click();
  await expect(readiness.getByText('Explicit tenant extraction consent')).toBeVisible();
  await expect(readiness.getByText('Approved quotation retention')).toBeVisible();
  await expect(readiness.getByText('Deletion and consent withdrawal tested')).toBeVisible();
  await expect(readiness.getByText('Isolated staging database acceptance')).toBeVisible();
  await expect(page.getByRole('button',{name:'Publish knowledge (disabled)'})).toBeDisabled();
});

test('read-only source candidate preview pairs actual FAQ quotations without auto-approval',async({page})=>{
  const writes:string[]=[];
  page.on('request',request=>{
    if(request.method()!=='GET' &&
      /\/(?:api\/knowledge|rest\/v1\/knowledge_)/.test(request.url())) {
      writes.push(request.method()+' '+request.url());
    }
  });
  await page.goto('/settings/knowledge/evidence-preview');
  const candidates=page.getByRole('region',{name:'Source-backed draft candidates'});
  await expect(candidates.getByText('Exact quotations and adjacent FAQ pairs',{exact:false})).toBeVisible();
  await expect(candidates.getByText('Can I reschedule?',{exact:true})).toBeVisible();
  await expect(candidates.getByText(
    'Rescheduling requests must be submitted before the event.',{exact:true})).toBeVisible();
  await expect(candidates.getByText('Introduction workshop | $150',{exact:true})).toBeVisible();
  await expect(candidates.getByText('Human review required').first()).toBeVisible();
  await expect(candidates.getByText(
    'No AI-generated content, storage, approval, or publishing is enabled by this preview.')).toBeVisible();
  await expect(page.getByRole('button',{name:'Publish knowledge (disabled)'})).toBeDisabled();
  expect(writes).toEqual([]);
});

test('synthetic price and source age signals retain quotations but never declare a current truth',async({page})=>{
  const writes:string[]=[];
  page.on('request',request=>{
    if(request.method()!=='GET' &&
      /\/(?:api\/knowledge|rest\/v1\/knowledge_)/.test(request.url())){
      writes.push(request.method()+' '+request.url());
    }
  });
  await page.goto('/settings/knowledge/evidence-preview');
  const diff=page.getByRole('region',{name:'Source difference review'});
  await expect(diff.getByRole('heading',{name:'Potential source differences'})).toBeVisible();
  await expect(diff.getByText('Price variation to review')).toBeVisible();
  await expect(diff.getByText('Source age to review')).toBeVisible();
  await expect(diff.getByText('Introduction workshop | $150',{exact:true})).toBeVisible();
  await expect(diff.getByText('Introduction workshop: $175',{exact:true}).first()).toBeVisible();
  await expect(diff.getByText('sample.example.com/archived-workshop-fees',{exact:false}).first()).toBeVisible();
  await expect(diff.getByText('Neither source has been verified as the current truth.',{exact:false})).toBeVisible();
  await expect(page.getByRole('button',{name:'Publish knowledge (disabled)'})).toBeDisabled();
  expect(writes).toEqual([]);
});

test('synthetic AI contract preview displays exact cited answers without AI/storage/publishing actions',async({page})=>{
  const writes:string[]=[];
  page.on('request',request=>{
    if(request.method()!=='GET' &&
      /\/(?:api\/knowledge|rest\/v1\/knowledge_)/.test(request.url())){
      writes.push(request.method()+' '+request.url());
    }
  });
  await page.goto('/settings/knowledge/evidence-preview');
  const ai=page.getByRole('region',{name:'Synthetic AI proposal review'});
  await expect(ai.getByRole('heading',{name:'AI drafting contract preview'})).toBeVisible();
  await expect(ai.getByText('Simulated model output only',{exact:false})).toBeVisible();
  await expect(ai.getByText('2 simulated proposals')).toBeVisible();
  await expect(ai.getByText('What is the fee for the introduction workshop?')).toBeVisible();
  await expect(ai.getByText('Introduction workshop | $150',{exact:true})).toBeVisible();
  await expect(ai.getByText('Can I reschedule?',{exact:true})).toBeVisible();
  await expect(ai.getByText(
    'Rescheduling requests must be submitted before the event.',{exact:true})).toBeVisible();
  await expect(ai.getByText('Not approved',{exact:true})).toHaveCount(2);
  await expect(ai.getByText('Question wording was simulated',{exact:false})).toBeVisible();
  await expect(ai.getByText('semantic grounding was not verified',{exact:false})).toBeVisible();
  await expect(ai.getByText('Citation:',{exact:false}).first()).toBeVisible();
  await expect(page.getByRole('button',{name:'Publish knowledge (disabled)'})).toBeDisabled();
  expect(writes).toEqual([]);
});

test('grounding evaluation holds synthetic fee answer with a conflicting older source',async({page})=>{
  const writes:string[]=[];
  page.on('request',request=>{
    if(request.method()!=='GET' &&
      /\/(?:api\/knowledge|rest\/v1\/knowledge_)/.test(request.url())){
      writes.push(request.method()+' '+request.url());
    }
  });
  await page.goto('/settings/knowledge/evidence-preview');
  const review=page.getByRole('region',{name:'AI grounding quality review'});
  await expect(review.getByRole('heading',{name:'Grounding and accuracy review'})).toBeVisible();
  await expect(review.getByText('1 held for resolution')).toBeVisible();
  await expect(review.getByText('Hold — source issue requires resolution')).toBeVisible();
  await expect(review.getByText('Introduction workshop | $150',{exact:true})).toBeVisible();
  await expect(review.getByText('unresolved source difference')).toBeVisible();
  await expect(review.getByText('Human verification required')).toBeVisible();
  await expect(review.getByText('Can I reschedule?')).toBeVisible();
  await expect(review.getByText('Source truth and question meaning remain unverified.',{exact:false})).toBeVisible();
  await expect(page.getByRole('button',{name:'Publish knowledge (disabled)'})).toBeDisabled();
  expect(writes).toEqual([]);
});

test('KB-03E synthetic acceptance blocks approval despite valid citations and review counts',async({page})=>{
  const writes:string[]=[];
  page.on('request',request=>{
    if(request.method()!=='GET' &&
      /\/(?:api\/knowledge|rest\/v1\/knowledge_)/.test(request.url())){
      writes.push(request.method()+' '+request.url());
    }
  });
  await page.goto('/settings/knowledge/evidence-preview');
  const acceptance=page.getByRole('region',{name:'End-to-end review acceptance'});
  await expect(acceptance.getByRole('heading',{name:'Review acceptance checkpoint'})).toBeVisible();
  await expect(acceptance.getByText('Preview only',{exact:true})).toBeVisible();
  await expect(acceptance.getByText('Proposals',{exact:true})).toBeVisible();
  await expect(acceptance.getByText('On hold',{exact:true})).toBeVisible();
  await expect(acceptance.getByText('Need human review',{exact:true})).toBeVisible();
  await expect(acceptance.getByText('2',{exact:true})).toHaveCount(2);
  await expect(acceptance.getByText('1',{exact:true})).toHaveCount(1);
  await acceptance.getByText('Review 7 release requirements still blocked').click();
  await expect(acceptance.getByText('Tenant consent, retention, and deletion approval')).toBeVisible();
  await expect(acceptance.getByText('Human semantic accuracy review')).toBeVisible();
  await expect(acceptance.getByText('Explicit approval to merge and deploy')).toBeVisible();
  await expect(acceptance.getByText('Existing knowledge approval pathway')).toBeVisible();
  await expect(acceptance.getByText('Storage, approval, and publishing remain disabled.')).toBeVisible();
  await expect(page.getByRole('button',{name:'Publish knowledge (disabled)'})).toBeDisabled();
  expect(writes).toEqual([]);
});

test('same-page synthetic snapshot comparison displays exact earlier/later quotes without auto-sync',async({page})=>{
  const writes:string[]=[];
  page.on('request',req=>{
    if(req.method()!=='GET' &&
      /\/(?:api\/knowledge|rest\/v1\/knowledge_)/.test(req.url())){
      writes.push(req.method()+' '+req.url());
    }
  });
  await page.goto('/settings/knowledge/evidence-preview');
  const section=page.getByRole('region',{name:'Website snapshot changes'});
  await expect(section.getByRole('heading',{name:'Website snapshot changes'})).toBeVisible();
  await expect(section.getByText('Two simulated versions of the same page.',{exact:false})).toBeVisible();
  await expect(section.getByText('Human verification required')).toBeVisible();
  await expect(section.getByText('Modified',{exact:true})).toBeVisible();
  await expect(section.getByText('Added',{exact:true})).toBeVisible();
  await expect(section.getByText('Removed',{exact:true})).toBeVisible();
  await expect(section.getByText('Unchanged',{exact:true})).toBeVisible();
  await expect(section.getByText('Modified source quotation')).toBeVisible();
  await expect(section.getByText('Introduction workshop | $175',{exact:true})).toBeVisible();
  await expect(section.getByText('Introduction workshop | $150',{exact:true})).toBeVisible();
  await expect(section.getByText('Source authenticity, browser visibility',{exact:false})).toBeVisible();
  await expect(page.getByRole('button',{name:'Publish knowledge (disabled)'})).toBeDisabled();
  expect(writes).toEqual([]);
});

test('review preview remains readable without horizontal overflow on mobile',async({page})=>{
  await page.setViewportSize({width:390,height:844});
  await page.goto('/settings/knowledge/evidence-preview');
  await expect(page.getByRole('heading',{name:'Evidence review'})).toBeVisible();
  await expect.poll(()=>page.evaluate(()=>document.documentElement.scrollWidth))
    .toBeLessThanOrEqual(390);
});


test('KB-04B synthetic refresh preflight cannot schedule, fetch or store evidence',async({page})=>{
  const writes:string[]=[];
  page.on('request',request=>{
    if(request.method()!=='GET' &&
      /\/(?:api\/knowledge|rest\/v1\/knowledge_|api\/website)/.test(request.url())){
      writes.push(request.method()+' '+request.url());
    }
  });
  await page.goto('/settings/knowledge/evidence-preview');
  const safety=page.getByRole('region',{name:'Website refresh safety preview'});
  await expect(safety.getByRole('heading',{name:'Website refresh safeguards'})).toBeVisible();
  await expect(safety.getByText('Refresh blocked')).toBeVisible();
  await expect(safety.getByText('No automated crawling is authorized')).toBeVisible();
  await safety.getByText('Inspect 7 refresh safety requirements').click();
  await expect(safety.getByText('Any kill switch',{exact:false})).toBeVisible();
  await expect(safety.getByText('Explicit unexpired monitoring-purpose consent',{exact:false})).toBeVisible();
  await expect(safety.getByText('No schedule or storage endpoint',{exact:false})).toBeVisible();
  await expect(page.getByRole('button',{name:'Publish knowledge (disabled)'})).toBeDisabled();
  expect(writes).toEqual([]);
});


test('KB-04C change-impact review reports at-risk citations without changing knowledge',async({page})=>{
  const writes:string[]=[];
  page.on('request',request=>{
    if(request.method()!=='GET' &&
      /\/(?:api\/knowledge|rest\/v1\/knowledge_|api\/website)/.test(request.url())){
      writes.push(request.method()+' '+request.url());
    }
  });
  await page.goto('/settings/knowledge/evidence-preview');
  const impact=page.getByRole('region',{name:'Knowledge change impact preview'});
  await expect(impact.getByRole('heading',{name:'Knowledge change impact'})).toBeVisible();
  await expect(impact.getByText('Human review required')).toBeVisible();
  await expect(impact.getByText('Published citations at risk')).toBeVisible();
  await expect(impact.getByText('Possible quotation modification')).toBeVisible();
  await expect(impact.getByText('Introduction workshop | $175',{exact:true})).toBeVisible();
  await expect(impact.getByText('Introduction workshop | $150',{exact:true})).toBeVisible();
  await expect(impact.getByText('simulated published knowledge version',{exact:false})).toBeVisible();
  await expect(impact.getByText('possible overlapping periods',{exact:false})).toBeVisible();
  await expect(impact.getByText('No automatic source replacement',{exact:false})).toBeVisible();
  await expect(page.getByRole('button',{name:'Publish knowledge (disabled)'})).toBeDisabled();
  expect(writes).toEqual([]);
});


test('KB-04D synthetic reviewer notes never invoke the real knowledge approval flow',async({page})=>{
  const writes:string[]=[];
  page.on('request',request=>{
    if(request.method()!=='GET'&&
      /\/(?:api\/knowledge|rest\/v1\/knowledge_|api\/website)/.test(request.url())){
      writes.push(request.method()+' '+request.url());
    }
  });
  await page.goto('/settings/knowledge/evidence-preview');
  const handoff=page.getByRole('region',{name:'Human review handoff preview'});
  await expect(handoff.getByRole('heading',{name:'Human review handoff'})).toBeVisible();
  await expect(handoff.getByText('Handoff not connected')).toBeVisible();
  await expect(handoff.getByText('Not approved')).toBeVisible();
  await expect(handoff.getByText('Simulated annotation:',{exact:false})).toBeVisible();
  await expect(handoff.getByText('No reviewer decision recorded.',{exact:false})).toBeVisible();
  await expect(handoff.getByText('Existing workflows remain createKnowledgeDocumentAction',{exact:false})).toBeVisible();
  await expect(page.getByRole('button',{name:'Publish knowledge (disabled)'})).toBeDisabled();
  expect(writes).toEqual([]);
});
