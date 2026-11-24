'use server';
import { redirect } from 'next/navigation';
import { prepareContractQuote } from '@/lib/commercial/contract-quotes';
const route='/settings/commercial-plans/quotes';
function field(form:FormData,key:string,max=2048){
  const v=form.get(key);if(typeof v!=='string'||v.length>max)throw Error('Invalid field.');return v.trim();
}
function minor(form:FormData,key:string){
  const v=field(form,key,10);if(!/^\d{1,10}$/.test(v))throw Error('Invalid amount.');return Number(v);
}
export async function prepareQuoteAction(form:FormData){
  try {
    await prepareContractQuote(field(form,'request',36),minor(form,'setup_minor'),minor(form,'tax_minor'),field(form,'reason'));
  }catch{redirect(route+'?result=error');}
  redirect(route+'?result=prepared');
}
