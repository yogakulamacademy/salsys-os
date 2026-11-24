'use server';
import { redirect } from 'next/navigation';
import { PLAN_CODES, createPlanProposal, transitionPlanProposal, publishInitialPlan, type PlanCode, type PlanSnapshot } from '@/lib/commercial/plan-admin';

const ROUTE='/settings/commercial-plans';
function value(form:FormData,key:string,max=2048) {
  const v=form.get(key);
  if(typeof v!=='string'||v.length>max) throw Error('Invalid field.');
  return v.trim();
}
function integer(form:FormData,key:string,max:number) {
  const v=value(form,key,12);
  if(!/^\d{1,10}$/.test(v)) throw Error('Invalid number.');
  const n=Number(v);
  if(!Number.isSafeInteger(n)||n>max) throw Error('Invalid number.');
  return n;
}
function list(form:FormData,key:string) {
  return [...new Set(value(form,key,256).split(',').map(s=>s.trim()).filter(Boolean))];
}
export async function createPlanAction(form:FormData) {
  try {
    const code=value(form,'code',16) as PlanCode;
    if(!PLAN_CODES.includes(code)) throw Error('Invalid tier.');
    const tax=value(form,'tax_treatment',16);
    if(tax!=='exclusive'&&tax!=='inclusive') throw Error('Invalid tax.');
    const optional=value(form,'setup_optional',8);
    if(optional!=='true'&&optional!=='false') throw Error('Invalid setup policy.');
    const snapshot:PlanSnapshot={
      display_name:value(form,'display_name',160),amount_minor:integer(form,'amount_minor',1000000000),
      setup_min_minor:integer(form,'setup_min_minor',1000000000),setup_max_minor:integer(form,'setup_max_minor',1000000000),
      setup_optional:optional==='true',tax_treatment:tax,named_users:integer(form,'named_users',1000000),
      lead_records:integer(form,'lead_records',100000000),workspace_codes:list(form,'workspace_codes'),
      integration_codes:list(form,'integration_codes'),
    };
    await createPlanProposal(code,integer(form,'expected_version',2147483647),snapshot,value(form,'rationale'));
  } catch { redirect(ROUTE+'?result=error'); }
  redirect(ROUTE+'?result=created');
}
export async function transitionPlanAction(form:FormData) {
  try {
    const action=value(form,'action',16);
    if(action!=='submit'&&action!=='review'&&action!=='reject') throw Error('Invalid action.');
    await transitionPlanProposal(value(form,'id',36),integer(form,'revision',2),value(form,'digest',64),action,value(form,'reason'));
  } catch { redirect(ROUTE+'?result=error'); }
  redirect(ROUTE+'?result=review_saved');
}

export async function publishInitialPlanAction(form:FormData) {
  try {
    if(value(form,'confirmation',64)!=='PUBLISH INITIAL PLAN') throw Error('Explicit confirmation required.');
    await publishInitialPlan(value(form,'id',36),integer(form,'revision',3),value(form,'digest',64));
  } catch { redirect(ROUTE+'?result=error'); }
  redirect(ROUTE+'?result=published');
}
