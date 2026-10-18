import { NextRequest, NextResponse } from 'next/server';
import crypto from 'node:crypto';

import { createAdminClient } from '@/lib/supabase/admin';
import { getCompetitorIntelligence } from '@/lib/seo/competitor-intelligence';
import { requireSingleActiveTenant } from '@/lib/tenant/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 30;

function csvCell(value: unknown) {
  const text = value === null || value === undefined ? '' : String(value);
  return `"${text.replace(/"/g, '""')}"`;
}

function buildCsv(context: Awaited<ReturnType<typeof getCompetitorIntelligence>>) {
  const header = ['surface','query','engine','device','position','url','answer_visibility','ai_cited','ai_provider','observed_at','competitors'];
  const rows = context.latest.map((row: any) => [
    row.surface, row.query, row.engine, row.device, row.own_position, row.own_url,
    row.answer_visibility, row.ai_cited, row.ai_provider, row.observed_at,
    Array.isArray(row.competitor_results) ? row.competitor_results.map((item: any) => item?.domain || item?.url || '').filter(Boolean).join(' | ') : '',
  ]);
  return [header, ...rows].map((row) => row.map(csvCell).join(',')).join('\n');
}

function escapeHtml(value: unknown) {
  return String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function buildHtml(context: Awaited<ReturnType<typeof getCompetitorIntelligence>>) {
  const analysis: any = context.analyses[0] || null;
  const rows = context.latest.map((row: any) => `<tr><td>${escapeHtml(row.surface)}</td><td>${escapeHtml(row.query)}</td><td>${escapeHtml(row.own_position ?? '—')}</td><td>${escapeHtml(row.answer_visibility ?? '—')}</td><td>${escapeHtml(row.ai_cited ?? '—')}</td><td>${escapeHtml(row.observed_at ?? '—')}</td></tr>`).join('');
  const recs = Array.isArray(analysis?.recommendations) ? analysis.recommendations.map((rec: any) => `<li><strong>${escapeHtml(rec.action || 'Recommendation')}</strong> — ${escapeHtml(rec.why || '')}</li>`).join('') : '<li>No analyzed recommendations yet.</li>';
  return `<!doctype html><html><head><meta charset="utf-8"><title>SalsysOS SEO Competitor Intelligence</title><style>body{font-family:Arial,sans-serif;margin:36px;color:#111827}h1{font-size:24px}table{border-collapse:collapse;width:100%;margin-top:20px}th,td{border:1px solid #d1d5db;padding:8px;text-align:left;font-size:12px}th{background:#f3f4f6}li{margin-bottom:8px}</style></head><body><h1>SalsysOS SEO / AEO / GEO Competitor Intelligence</h1><p>Competitors tracked: ${context.competitors.length} · Ranking targets: ${context.targets.length}</p><h2>Latest rankings</h2><table><thead><tr><th>Surface</th><th>Query</th><th>Position</th><th>Answer visibility</th><th>AI cited</th><th>Observed</th></tr></thead><tbody>${rows || '<tr><td colspan="6">No ranking observations yet.</td></tr>'}</tbody></table><h2>Recommended actions</h2><ul>${recs}</ul></body></html>`;
}

function buildMinimalPdf(text: string) {
  const clean = text.replace(/[^\x20-\x7E\n]/g, ' ').slice(0, 9000);
  const lines = clean.split('\n').flatMap((line) => {
    const parts: string[] = [];
    for (let i = 0; i < line.length; i += 90) parts.push(line.slice(i, i + 90));
    return parts.length ? parts : [''];
  }).slice(0, 48);
  const escapePdf = (s: string) => s.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
  const stream = ['BT','/F1 10 Tf','50 780 Td','12 TL', ...lines.map((line, index) => `${index ? 'T* ' : ''}(${escapePdf(line)}) Tj`), 'ET'].join('\n');
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>',
    `<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ];
  let pdf = '%PDF-1.4\n';
  const offsets = [0];
  objects.forEach((obj, i) => { offsets.push(Buffer.byteLength(pdf)); pdf += `${i + 1} 0 obj\n${obj}\nendobj\n`; });
  const xref = Buffer.byteLength(pdf);
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (let i = 1; i < offsets.length; i++) pdf += `${String(offsets[i]).padStart(10, '0')} 00000 n \n`;
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return Buffer.from(pdf, 'binary');
}

export async function GET(request: NextRequest) {
  try {
    const tenant = await requireSingleActiveTenant();
    const format = request.nextUrl.searchParams.get('format') || 'csv';
    if (!['csv','pdf','doc'].includes(format)) return NextResponse.json({ ok: false, error: 'Unsupported export format.' }, { status: 400 });
    const context = await getCompetitorIntelligence(tenant.organizationId);
    const admin = createAdminClient();
    const date = new Date().toISOString().slice(0, 10);

    let bytes: Buffer;
    let contentType: string;
    let extension: 'csv' | 'pdf' | 'doc';
    if (format === 'csv') {
      bytes = Buffer.from(buildCsv(context), 'utf8');
      contentType = 'text/csv; charset=utf-8';
      extension = 'csv';
    } else if (format === 'doc') {
      bytes = Buffer.from(buildHtml(context), 'utf8');
      contentType = 'application/msword; charset=utf-8';
      extension = 'doc';
    } else {
      const summary = [`SalsysOS SEO / AEO / GEO Competitor Intelligence`, `Competitors tracked: ${context.competitors.length}`, `Ranking targets: ${context.targets.length}`, '', ...context.latest.map((row: any) => `${String(row.surface).toUpperCase()} | ${row.query} | Position ${row.own_position ?? '-'} | AEO ${row.answer_visibility ?? '-'} | GEO cited ${row.ai_cited ?? '-'}`)];
      bytes = buildMinimalPdf(summary.join('\n'));
      contentType = 'application/pdf';
      extension = 'pdf';
    }

    const fileName = `salsysos-seo-competitor-intelligence-${date}.${extension}`;
    const hash = crypto.createHash('sha256').update(bytes).digest('hex');
    await admin.from('seo_intelligence_exports').insert({
      organization_id: tenant.organizationId,
      export_type: 'competitor_analysis',
      format: extension,
      status: 'completed',
      file_name: fileName,
      content_hash: hash,
      row_count: context.latest.length,
      requested_by: tenant.userId,
      completed_at: new Date().toISOString(),
      filters: { surface: 'all' },
    });

    return new NextResponse(new Uint8Array(bytes), {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Content-Disposition': `attachment; filename="${fileName}"`,
        'Cache-Control': 'private, no-store',
      },
    });
  } catch {
    return NextResponse.json({ ok: false, error: 'Unable to export competitor intelligence.' }, { status: 503 });
  }
}
