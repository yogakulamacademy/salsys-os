'use server';
import { redirect } from 'next/navigation';
import { approveManualPilot, activateApprovedPilot } from '@/lib/commercial/manual-pilot';
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
