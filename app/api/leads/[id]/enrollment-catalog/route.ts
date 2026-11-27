import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getEnrollmentCatalog } from '@/lib/enrollment-panel-data';

export const dynamic = 'force-dynamic';
const headers = { 'Cache-Control': 'private, no-store' };

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(id)) return NextResponse.json({ error: 'Invalid lead.' }, { status: 400, headers });
  try {
    const client = await createClient();
    const { data: { user }, error } = await client.auth.getUser();
    if (error || !user) return NextResponse.json({ error: 'Sign in to continue.' }, { status: 401, headers });
    const catalog = await getEnrollmentCatalog(client, id, user.id);
    if (!catalog) return NextResponse.json({ error: 'Enrollment access is unavailable for this lead.' }, { status: 403, headers });
    return NextResponse.json(catalog, { headers });
  } catch {
    return NextResponse.json({ error: 'Enrollment choices could not be loaded. Please try again.' }, { status: 503, headers });
  }
}
