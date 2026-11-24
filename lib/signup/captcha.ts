import 'server-only';

export async function verifySignupCaptcha(token: string): Promise<boolean> {
  const secret = process.env.SALSYS_SIGNUP_TURNSTILE_SECRET?.trim();
  if (!secret || !token || token.length > 2048) return false;
  try {
    const response = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      body: new URLSearchParams({ secret, response: token }),
      cache: 'no-store',
      signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) return false;
    const result = await response.json();
    return result.success === true &&
      result.hostname === 'salsysos.com' &&
      result.action === 'signup';
  } catch {
    return false;
  }
}
