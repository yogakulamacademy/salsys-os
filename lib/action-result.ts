import 'server-only';

import { revalidatePath } from 'next/cache';

import { noticeFor } from '@/lib/inbox-notices';

/**
 * Submits without page reloads (owner request, 25 Nov 2026).
 *
 * Many CRM actions end in redirect(".../page?notice=…|error=…"), which makes
 * the browser navigate and the page reload. asResult runs such an action,
 * reads the redirect instead of following it, refreshes the given pages in
 * place, and returns { ok, message } for a toast. Actions that already return
 * a result ({ ok, message } or { ok: false, error }) pass straight through.
 */
export type ActionResult = { ok: boolean; message: string };

function redirectTarget(error: unknown): string | null {
  const digest = (error as { digest?: unknown } | null)?.digest;
  if (typeof digest !== 'string' || !digest.startsWith('NEXT_REDIRECT')) return null;
  return digest.split(';')[2] ?? '';
}

/** Plain words for a redirect's notice code; unknown codes fall back to the caller's message. */
function messageFor(notice: string | null, fallback: string): string {
  if (!notice) return fallback;
  // Some actions redirect with a full sentence ("Asha was created as an Employee.").
  if (/\s/.test(notice) && notice.length <= 200) return notice;
  const inbox = noticeFor(notice);
  if (inbox && inbox !== 'Interaction logged.') return inbox;
  return fallback;
}

export async function asResult(run: () => Promise<unknown>, fallback: string, paths: string[] = []): Promise<ActionResult> {
  const refresh = () => { for (const p of paths) revalidatePath(p); };
  try {
    const returned = await run();
    if (returned && typeof returned === 'object' && 'ok' in returned) {
      const r = returned as { ok: unknown; message?: unknown; error?: unknown };
      if (r.ok === false) return { ok: false, message: String(r.error ?? r.message ?? 'That did not go through. Please try again.') };
      refresh();
      return { ok: true, message: typeof r.message === 'string' && r.message ? r.message : fallback };
    }
    refresh();
    return { ok: true, message: fallback };
  } catch (error) {
    const target = redirectTarget(error);
    if (target === null) {
      console.error('[action] failed', error instanceof Error ? error.message : error);
      return { ok: false, message: 'That did not go through. Please try again.' };
    }
    const url = new URL(target, 'https://crm.local');
    const failure = url.searchParams.get('error');
    if (failure) return { ok: false, message: failure };
    if (url.pathname === '/login') return { ok: false, message: 'Your session has expired. Please sign in again.' };
    refresh();
    return { ok: true, message: messageFor(url.searchParams.get('notice'), fallback) };
  }
}
