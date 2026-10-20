import { NextResponse } from 'next/server';

import { createClient } from '@/lib/supabase/server';
import { requireCurrentOrganizationId } from '@/lib/workspace';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json(
      { ok: false, error: 'Unauthorized.' },
      { status: 401, headers: { 'Cache-Control': 'no-store' } },
    );
  }

  try {
    const organizationId = await requireCurrentOrganizationId(supabase, user.id);
    const { data, error } = await supabase
      .from('whatsapp_quick_replies')
      .select('id,title,shortcut,body,category')
      .eq('organization_id', organizationId)
      .eq('active', true)
      .order('category', { ascending: true, nullsFirst: false })
      .order('title', { ascending: true })
      .limit(100);

    if (error) {
      console.error('WHATSAPP_QUICK_REPLIES_READ_FAILED', error);
      return NextResponse.json(
        { ok: false, error: 'Quick replies could not be loaded.' },
        { status: 503, headers: { 'Cache-Control': 'no-store' } },
      );
    }

    return NextResponse.json(
      {
        ok: true,
        quickReplies: (data ?? []).map((row) => ({
          id: String(row.id),
          title: String(row.title),
          shortcut: String(row.shortcut),
          body: String(row.body),
          category: row.category ? String(row.category) : null,
        })),
      },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (error) {
    console.error('WHATSAPP_QUICK_REPLIES_ROUTE_FAILED', error);
    return NextResponse.json(
      { ok: false, error: 'Quick replies are unavailable.' },
      { status: 503, headers: { 'Cache-Control': 'no-store' } },
    );
  }
}
