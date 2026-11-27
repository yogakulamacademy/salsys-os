import 'server-only';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { encodeErrorFeedback, errorCookieName, ERROR_FEEDBACK_TTL } from '@/lib/error-feedback';

/** Confirmed action outcomes travel in a short-lived cookie, never in the address. */
export async function redirectWithNotice(destination: string, message: string): Promise<never> {
  const path = new URL(destination, 'https://crm.local').pathname;
  const secure = process.env.NODE_ENV === 'production';
  (await cookies()).set(errorCookieName(path, secure), encodeErrorFeedback(path, [['notice', message]]), {
    httpOnly: true, secure, sameSite: 'lax', path: '/', maxAge: ERROR_FEEDBACK_TTL,
  });
  redirect(destination);
}
