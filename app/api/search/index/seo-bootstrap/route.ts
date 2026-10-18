import { NextRequest, NextResponse } from 'next/server';

import { ensureSeoOpenSearchMapping } from '@/lib/search/seo';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 30;

function expectedSecret() {
  return process.env.SEARCH_INDEX_WORKER_SECRET?.trim() || process.env.CRON_SECRET?.trim() || null;
}

function authorized(request: NextRequest) {
  const secret = expectedSecret();
  if (!secret) return false;
  const authorization = request.headers.get('authorization') || '';
  return authorization === `Bearer ${secret}`;
}

export async function POST(request: NextRequest) {
  if (!authorized(request)) {
    return NextResponse.json(
      { ok: false, error: 'Unauthorized.' },
      { status: 401, headers: { 'Cache-Control': 'no-store' } },
    );
  }

  try {
    const result = await ensureSeoOpenSearchMapping();
    return NextResponse.json(result, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : 'Unable to bootstrap SEO search mapping.',
      },
      { status: 503, headers: { 'Cache-Control': 'no-store' } },
    );
  }
}
