import 'server-only';
import { requirePlatformAdminAccess } from '@/lib/platform-admin-access';
import { createClient } from '@/lib/supabase/server';
import { parseLifecyclePreview, type LifecycleView } from '@/lib/platform-lifecycle-view';
import { parseEffectiveQuotaPreview, type EffectiveQuotaView } from '@/lib/platform-effective-quota-view';

const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
type Views={lifecycle:LifecycleView;quota:EffectiveQuotaView};
const unavailable=():Views=>({lifecycle:{state:'unavailable'},quota:{state:'unavailable'}});

// Used by the profile only after the dedicated read API feature is enabled.
// Independent opt-in, no registry fallback and no privileged service client.
export async function loadPlatformLifecycleAndQuota(target:string):Promise<Views|null>{
  if(process.env.SALSYS_PLATFORM_ADMIN_ENABLED!=='true'||process.env.SALSYS_PLATFORM_READ_API_ENABLED!=='true')return null;
  if(typeof target!=='string'||!uuid.test(target))return null;
  const platform=process.env.SALSYS_COMMERCIAL_PLATFORM_ORG_ID?.trim().toLowerCase();
  const id=target.toLowerCase();
  if(!platform||!uuid.test(platform)||id===platform)return null;
  // Preserve access redirects. Do not turn a failed access check into a read.
  const {user,activeWorkspace}=await requirePlatformAdminAccess();
  if(!user||user.is_anonymous===true||activeWorkspace.organizationId!==platform||
      activeWorkspace.organizationSlug!=='salsysos'||!['owner','admin'].includes(activeWorkspace.role))return null;
  const result=unavailable();
  try{
    const supabase=await createClient();
    const auth=await supabase.auth.getUser();
    if(auth.error||auth.data.user?.id!==user.id||auth.data.user.is_anonymous===true)return result;
    const params={p_platform:platform,p_target:id};
    // Independent reader grants: one denied read must not erase the other.
    const [lifecycle,quota]=await Promise.allSettled([
      supabase.rpc('platform_lifecycle_read_v1',params),
      supabase.rpc('platform_effective_quota_read_v1',params),
    ]);
    if(lifecycle.status==='fulfilled'&&!lifecycle.value.error)
      result.lifecycle=parseLifecyclePreview(lifecycle.value.data,id,platform);
    if(quota.status==='fulfilled'&&!quota.value.error)
      result.quota=parseEffectiveQuotaPreview(quota.value.data);
    return result;
  }catch{return result;}
}
