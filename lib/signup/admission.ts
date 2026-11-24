import 'server-only';

type Admission = { mode: 'closed' } | { mode: 'public' } | { mode: 'pilot'; emails: Set<string> };
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Admission is a workspace provisioning restriction, not a substitute for
// CAPTCHA, verified Auth identity, durable intent or tenant authorization.
function admission(): Admission {
  if (process.env.SALSYS_PUBLIC_SIGNUP_ENABLED !== 'true') return { mode: 'closed' };
  const mode = process.env.SALSYS_SIGNUP_ADMISSION_MODE;
  if (mode === 'public') return { mode };
  if (mode !== 'pilot') return { mode: 'closed' };
  const raw = process.env.SALSYS_SIGNUP_PILOT_EMAILS ?? '';
  if (raw.length > 2550) return { mode: 'closed' };
  const emails = raw.split(',').map(value => value.trim().toLowerCase());
  if (emails.length > 10 || emails.some(value => value.length > 254 || !emailPattern.test(value) || value.includes('*'))) {
    return { mode: 'closed' };
  }
  return { mode, emails: new Set(emails) };
}

export function isSignupAdmissionConfigured(): boolean {
  return admission().mode !== 'closed';
}

export function isSignupPilotMode(): boolean {
  return admission().mode === 'pilot';
}

export function isSignupEmailAdmitted(value: unknown): boolean {
  if (typeof value !== 'string') return false;
  const email = value.trim().toLowerCase();
  if (email.length > 254 || !emailPattern.test(email)) return false;
  const policy = admission();
  return policy.mode === 'public' || (policy.mode === 'pilot' && policy.emails.has(email));
}
