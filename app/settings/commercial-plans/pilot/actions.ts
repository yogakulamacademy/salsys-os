'use server';
import { redirect } from 'next/navigation';
import { approveManualPilot, activateApprovedPilot, assignManualPlan, enablePilotRequests } from '@/lib/commercial/manual-pilot';
const route='/settings/commercial-plans/pilot';
function field(form:FormData,key:string,max=2048){
  const v=form.get(key);if(typeof v!=='string'||v.length>max)throw Error('Invalid input.');return v.trim();
}
export async function approvePilotAction(form:FormData){
  let result:'activated'|'approved';
  try{
    if(field(form,'confirmation')!=='APPROVE PILOT')throw Error('Confirmation required.');
    const mode=field(form,'mode',32);
    if(mode!=='free'&&mode!=='offline_confirmation'&&mode!=='complimentary')throw Error('Invalid mode.');
    const end=field(form,'ends_at',32);
    if(end&&!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(end))throw Error('Invalid UTC expiry.');
    result=await approveManualPilot({request:field(form,'request',36),digest:field(form,'digest',64),mode,
      reference:field(form,'reference',256)||null,reason:field(form,'reason'),endsAt:end?end+':00Z':null});
  }catch{redirect(route+'?result=error');}
  redirect(route+'?result='+result);
}

export async function activatePilotAction(form:FormData){
  try{
    if(field(form,'confirmation')!=='ACTIVATE PILOT')throw Error('Confirmation required.');
    await activateApprovedPilot(field(form,'request',36),field(form,'digest',64));
  }catch{redirect(route+'?result=error');}
  redirect(route+'?result=activated');
}

export async function assignPlanAction(form:FormData){
  try{
    if(field(form,'confirmation')!=='ASSIGN PLAN')throw Error('Confirmation required.');
    const [plan,version,digest]=field(form,'offer',128).split('|');
    const mode=field(form,'mode',32);
    if(mode!=='free'&&mode!=='complimentary'&&mode!=='offline_confirmation')throw Error('Invalid mode.');
    const end=field(form,'ends_at',32);
    if(end&&!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(end))throw Error('Invalid UTC expiry.');
    await assignManualPlan({org:field(form,'org',36),revision:field(form,'revision',64),plan,version:Number(version),digest,key:field(form,'key',36),mode,reference:field(form,'reference',256)||null,reason:field(form,'reason'),endsAt:end?end+':00Z':null});
  }catch{redirect(route+'?result=error');}
  redirect(route+'?result=activated');
}

export async function enablePilotAction(form:FormData){
  try{
    await enablePilotRequests(field(form,'org',36),field(form,'reason',512));
  }catch{redirect(route+'?result=error');}
  redirect(route+'?result=enrolled');
}
