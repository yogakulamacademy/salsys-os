'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

import { useMockData } from '@/lib/config';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';
import {
  MAX_SNAPSHOT_AGE_DAYS,
  extractPagePrices,
  locationMatches,
  matchCoursePage,
  snapshotAgeDays,
  suggestInr,
} from '@/lib/website-price-extract';
import { requireCurrentOrganizationId } from '@/lib/workspace';

function go(type: 'notice' | 'error', message: string): never {
  redirect(`/settings/website-prices?${type}=${encodeURIComponent(message)}`);
}

async function managerContext() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) go('error', 'Your session has expired. Sign in again.');
  const organizationId = await requireCurrentOrganizationId(supabase, user.id);
  const { data: canManage } = await supabase.rpc('can_manage_organization', { p_organization_id: organizationId });
  if (canManage !== true) go('error', 'Only organization managers can review website prices.');
  return { supabase, userId: user.id, organizationId };
}

type SnapshotRow = { final_url: string; readable_text: string | null; created_at: string };
type BatchRow = { id: string; start_date: string; location: string | null; price_private: number | null; price_shared: number | null; currency: string | null; courses: { code: string } | { code: string }[] | null };

/**
 * Reads course prices from website pages the SEO crawler already stored and
 * queues them as suggestions. Nothing changes on a batch until a manager approves.
 */
export async function checkWebsitePricesAction(formData: FormData) {
  if (useMockData) go('error', 'Demo mode does not read website prices.');
  const { userId, organizationId } = await managerContext();
  const rateRaw = String(formData.get('inr_rate') ?? '').trim();
  const inrRate = rateRaw ? Number(rateRaw) : null;
  if (inrRate !== null && (!Number.isFinite(inrRate) || inrRate < 50 || inrRate > 150)) {
    go('error', 'Enter today’s USD→INR rate (for example 84.40), or leave it empty to skip INR prices.');
  }

  const admin = createAdminClient();
  const { data: snaps, error: snapError } = await admin
    .from('seo_page_snapshots')
    .select('final_url, readable_text, created_at')
    .eq('organization_id', organizationId)
    .ilike('final_url', '%/courses/%')
    .order('created_at', { ascending: false })
    .limit(500);
  if (snapError) go('error', 'Saved website pages could not be read.');
  const latest = new Map<string, SnapshotRow>();
  for (const row of (snaps ?? []) as SnapshotRow[]) if (!latest.has(row.final_url)) latest.set(row.final_url, row);
  if (!latest.size) go('error', 'No saved course pages yet. Run a website crawl on the SEO page first.');

  const today = new Date().toISOString().slice(0, 10);
  const { data: batches, error: batchError } = await admin
    .from('course_batches')
    .select('id, start_date, location, price_private, price_shared, currency, courses!inner(code)')
    .eq('organization_id', organizationId)
    .gte('start_date', today);
  if (batchError) go('error', 'Batches could not be loaded.');
  const batchRows = (batches ?? []) as BatchRow[];
  const codeOf = (b: BatchRow) => (Array.isArray(b.courses) ? b.courses[0]?.code : b.courses?.code) ?? '';

  let queued = 0;
  let unchanged = 0;
  let unmatched = 0;
  let stalePages = 0;
  for (const snap of latest.values()) {
    const page = matchCoursePage(snap.final_url);
    if (!page || !snap.readable_text) continue;
    const prices = extractPagePrices(snap.readable_text);
    const age = snapshotAgeDays(snap.created_at);
    if (age > MAX_SNAPSHOT_AGE_DAYS) stalePages += 1;
    for (const web of prices.batches) {
      if (web.startDate < today) continue;
      const crm = batchRows.find((b) => codeOf(b) === page.courseCode && b.start_date === web.startDate && locationMatches(b.location, page.location));
      if (!crm) { unmatched += 1; continue; }
      if (Number(crm.price_private ?? 0) === Number(web.privatePrice ?? 0) && Number(crm.price_shared ?? 0) === Number(web.sharedPrice ?? 0) && crm.currency === 'USD') {
        unchanged += 1;
        continue;
      }
      const sameAsSummary = prices.summary && prices.summary.privateOffer === web.privatePrice && prices.summary.sharedOffer === web.sharedPrice;
      const flags = [...prices.flags];
      if (age > MAX_SNAPSHOT_AGE_DAYS) flags.push(`Page saved ${age} days ago: re-crawl before approving`);
      if (crm.price_private || crm.price_shared) flags.push('Changes an existing price');
      await admin.from('course_price_suggestions')
        .update({ status: 'superseded' })
        .eq('organization_id', organizationId).eq('batch_id', crm.id).eq('status', 'pending');
      const { error } = await admin.from('course_price_suggestions').insert({
        organization_id: organizationId,
        batch_id: crm.id,
        course_code: page.courseCode,
        page_url: snap.final_url,
        snapshot_fetched_at: snap.created_at,
        currency: 'USD',
        private_offer: web.privatePrice,
        shared_offer: web.sharedPrice,
        private_regular: sameAsSummary ? prices.summary?.privateRegular ?? null : null,
        shared_regular: sameAsSummary ? prices.summary?.sharedRegular ?? null : null,
        current_private: crm.price_private,
        current_shared: crm.price_shared,
        current_currency: crm.currency,
        inr_rate: inrRate,
        inr_private: inrRate ? suggestInr(web.privatePrice, inrRate) : null,
        inr_shared: inrRate ? suggestInr(web.sharedPrice, inrRate) : null,
        inr_status: inrRate ? 'pending' : 'none',
        flags,
        created_by: userId,
      });
      if (!error) queued += 1;
    }
  }

  revalidatePath('/settings/website-prices');
  go('notice', `${queued} price${queued === 1 ? '' : 's'} to review · ${unchanged} already up to date · ${unmatched} website batch${unmatched === 1 ? '' : 'es'} not in SalsysOS${stalePages ? ` · ${stalePages} page${stalePages === 1 ? '' : 's'} older than ${MAX_SNAPSHOT_AGE_DAYS} days` : ''}.`);
}

export async function decideWebsitePriceAction(formData: FormData) {
  if (useMockData) go('error', 'Demo mode does not change prices.');
  const { supabase, organizationId } = await managerContext();
  const id = String(formData.get('suggestion_id') ?? '');
  const decision = String(formData.get('decision') ?? '');
  if (!/^[0-9a-f-]{36}$/i.test(id)) go('error', 'Invalid suggestion.');
  if (decision === 'reject') {
    const { error } = await supabase.rpc('reject_course_price_suggestion_v1', { p_organization_id: organizationId, p_suggestion_id: id });
    if (error) go('error', error.message);
    revalidatePath('/settings/website-prices');
    go('notice', 'Price suggestion rejected. The batch was not changed.');
  }
  if (decision !== 'approve_usd' && decision !== 'approve_both') go('error', 'Choose approve or reject.');
  const { error } = await supabase.rpc('approve_course_price_suggestion_v1', {
    p_organization_id: organizationId,
    p_suggestion_id: id,
    p_approve_inr: decision === 'approve_both',
  });
  if (error) go('error', error.message);
  revalidatePath('/settings/website-prices');
  revalidatePath('/conversations');
  go('notice', decision === 'approve_both' ? 'USD and Indian price approved for this batch.' : 'USD price approved. The Indian price was not approved.');
}
