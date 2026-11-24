import { NextRequest, NextResponse } from 'next/server';
import { bearerMatchesAnySecret } from '@/lib/security/machine-bearer-auth';
import { createAdminClient } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret || !bearerMatchesAnySecret(request.headers.get('authorization'), [secret])) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  }
  // Separate from signup: existing trials must still expire if signup is paused.
  const trialsEnabled=process.env.SALSYS_TRIAL_RECONCILIATION_ENABLED==='true';
  const manualEnabled=process.env.SALSYS_MANUAL_RECONCILIATION_ENABLED==='true';
  if (!trialsEnabled&&!manualEnabled) {
    return NextResponse.json({ ok: true, skipped: 'Trial reconciliation disabled' });
  }
  try {
    const admin=createAdminClient();
    const reconcile=async(name:string,limit:number)=>{
      const {data,error}=await admin.rpc(name,{p_limit:limit});
      if(error||!data||typeof data!=='object'||
        ![data.checked,data.converted,data.failed].every(n=>Number.isInteger(n)&&n>=0)||
        data.checked>limit||data.converted+data.failed>data.checked)throw Error('Reconciliation unavailable');
      return {checked:data.checked as number,converted:data.converted as number,failed:data.failed as number};
    };
    const results=await Promise.allSettled([
      trialsEnabled?reconcile('reconcile_expired_signup_trials_v1',100):Promise.resolve({checked:0,converted:0,failed:0}),
      manualEnabled?reconcile('reconcile_expired_manual_contracts_v1',10):Promise.resolve({checked:0,converted:0,failed:0}),
    ]);
    const [trial,manual]=results;
    const unavailable=trial.status==='rejected'||manual.status==='rejected';
    const summary=results.reduce((acc,result)=>{
      if(result.status==='fulfilled'){acc.checked+=result.value.checked;acc.converted+=result.value.converted;acc.failed+=result.value.failed;}
      return acc;
    },{checked:0,converted:0,failed:0});
    console.info('commercial_reconciliation',{...summary,unavailable});
    const ok=!unavailable&&summary.failed===0;
    return NextResponse.json({ok,...summary,...(unavailable?{error:'Commercial reconciliation unavailable'}:{})},{status:ok?200:503});

  } catch {
    return NextResponse.json({ ok: false, error: 'Trial reconciliation unavailable' }, { status: 503 });
  }
}
