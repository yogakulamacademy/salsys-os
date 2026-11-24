'use server';
import { redirect } from 'next/navigation';
import { acceptContractQuote } from '@/lib/commercial/contract-quotes';
const route='/settings/subscription/changes/quotes';
export async function acceptQuoteAction(form:FormData){
  try{
    const id=form.get('id'),digest=form.get('digest');
    if(typeof id!=='string'||typeof digest!=='string'||form.get('confirm')!=='review_only')throw Error('Confirmation required.');
    await acceptContractQuote(id,digest);
  }catch{redirect(route+'?result=error');}
  redirect(route+'?result=accepted');
}
