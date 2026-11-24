'use server';
import { redirect } from 'next/navigation';
import {requestPlanChange,withdrawPlanChange} from '@/lib/commercial/plan-change';
const route='/settings/subscription/changes';
function field(form:FormData,key:string,max=128){
  const v=form.get(key);if(typeof v!=='string'||v.length>max)throw Error('Invalid input.');return v;
}
export async function requestChangeAction(form:FormData){
  try{
    if(field(form,'confirm')!=='request_only')throw Error('Confirmation required.');
    await requestPlanChange(field(form,'key'),field(form,'target'),Number(field(form,'version')),field(form,'digest'),field(form,'revision'));
  }catch{redirect(route+'?result=error');}
  redirect(route+'?result=requested');
}
export async function withdrawChangeAction(form:FormData){
  try{await withdrawPlanChange(field(form,'id'));}catch{redirect(route+'?result=error');}
  redirect(route+'?result=withdrawn');
}
