import { NextRequest, NextResponse } from 'next/server';
import { decodeErrorFeedback, encodeErrorFeedback, errorCookieName, ERROR_FEEDBACK_TTL, isFeedbackPage, splitErrorFeedback } from '@/lib/error-feedback';

function privateFeedback(response: NextResponse) {
  response.headers.set('Cache-Control', 'private, no-store, max-age=0');
  response.headers.set('Referrer-Policy', 'no-referrer');
  const vary = response.headers.get('Vary');
  response.headers.set('Vary', vary ? `${vary}, Cookie` : 'Cookie');
  return response;
}

function attachFeedback(response: NextResponse, url: URL, entries: [string, string][], secure: boolean) {
  response.cookies.set(errorCookieName(url.pathname, secure), encodeErrorFeedback(url.pathname, entries), {
    httpOnly: true, secure, sameSite: 'lax', path: '/', maxAge: ERROR_FEEDBACK_TTL,
  });
  return privateFeedback(response);
}

/** Keep existing page rendering and every auth check; only change UI error transport. */
export async function withScreenOnlyErrors(request: NextRequest, run: (request: NextRequest) => Promise<NextResponse>) {
  if (request.method !== 'GET' || !isFeedbackPage(request.nextUrl.pathname)) return run(request);
  // A speculative prefetch must not consume another tab's pending feedback.
  if (request.headers.has('next-router-prefetch') || request.headers.get('purpose') === 'prefetch' || request.headers.get('sec-purpose')?.includes('prefetch')) return run(request);
  const secure = process.env.NODE_ENV === 'production';
  const incoming = splitErrorFeedback(new URL(request.url));
  if (incoming.entries.length) {
    const response = NextResponse.redirect(incoming.url, 303);
    // Hosting adapters require an absolute Location even when redirecting on the same host.
    return attachFeedback(response, incoming.url, incoming.entries, secure);
  }
  const response = await run(request);
  const location = response.headers.get('Location');
  if (location) {
    const destination = new URL(location, request.url);
    if (destination.origin === request.nextUrl.origin) {
      const clean = splitErrorFeedback(destination);
      if (clean.entries.length) {
        response.headers.set('Location', clean.url.href);
        return attachFeedback(response, clean.url, clean.entries, secure);
      }
    }
    return response;
  }
  const name = errorCookieName(request.nextUrl.pathname, secure);
  const raw = request.cookies.get(name)?.value;
  const feedback = decodeErrorFeedback(raw, request.nextUrl.pathname);
  if (feedback && response.headers.get('x-middleware-next') === '1') {
    const internal = request.nextUrl.clone();
    for (const [key, value] of feedback.entries) internal.searchParams.append(key, value);
    if (!internal.searchParams.get('error')) {
      const detail = internal.searchParams.get('error_description') || internal.searchParams.get('error_message');
      if (detail) internal.searchParams.set('error', detail);
    }
    const headers = new Headers(response.headers);
    headers.delete('x-middleware-next');
    // The browser keeps the clean URL. Existing server pages still receive their error props.
    const rewritten = NextResponse.rewrite(internal, { headers, request: { headers: request.headers } });
    rewritten.cookies.set(name, '', { httpOnly: true, secure, sameSite: 'lax', path: '/', maxAge: 0 });
    return privateFeedback(rewritten);
  }
  if (raw) {
    response.cookies.set(name, '', { httpOnly: true, secure, sameSite: 'lax', path: '/', maxAge: 0 });
    privateFeedback(response);
  }
  return response;
}
