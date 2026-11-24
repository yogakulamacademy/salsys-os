import Link from 'next/link';
import Script from 'next/script';
import { BrandIdentity, BrandMark } from '@/components/brand';
import { SALSYSOS_VERSION_LABEL } from '@/lib/product-version';
import { isSignupPilotMode } from '@/lib/signup/admission';
import { isPublicSignupAvailable } from '@/lib/signup/availability';
import { signupAction, resendSignupVerificationAction } from './actions';

export const dynamic = 'force-dynamic';

export default async function SignupPage({ searchParams }: {
  searchParams: Promise<{ error?: string; notice?: string; mode?: string }>;
}) {
  const params = await searchParams;
  const siteKey = process.env.SALSYS_SIGNUP_TURNSTILE_SITE_KEY?.trim();
  const enabled = await isPublicSignupAvailable();
  const resend = params.mode === 'resend';
  return (
    <main className="grid min-h-screen place-items-center bg-mist px-4 py-10">
      <section className="w-full max-w-md rounded-[20px] border border-line bg-surface p-7 shadow-panel sm:p-9">
        <div className="mb-7 flex items-center gap-3">
          <BrandMark size="large" /><BrandIdentity version={SALSYSOS_VERSION_LABEL} />
        </div>
        <div className="ui-page-kicker">Step 1 · Account registration</div>
        <h1 className="mt-2 text-[26px] font-semibold text-copy-strong">Create your SalsysOS account</h1>
        <p className="mt-3 text-sm leading-6 text-copy-muted">Create an account, verify your email and set up your business workspace.</p>
        {params.error && <p role="alert" className="mt-4 text-sm text-red-700">{params.error}</p>}
        {params.notice && <p role="status" className="mt-4 text-sm text-emerald-700">{params.notice}</p>}
        {enabled && isSignupPilotMode() && <p className="mt-3 text-sm text-copy-muted">Registration is limited to designated pilot accounts.</p>}
        {enabled && <p className="mt-3 text-sm text-copy-muted">Free forever, with 14 days of Pro trial access. No automatic charges. After your trial, continue on Free.</p>}
        {enabled && resend ? (
          <form action={resendSignupVerificationAction} className="mt-6 space-y-4">
            <h2 className="text-lg font-semibold">Resend verification email</h2>
            <p className="text-sm text-copy-muted">Use the email you registered with. Open the link in the original signup browser. If you have already verified, sign in instead.</p>
            <label className="block"><span className="field-label block">Email</span><input className="input w-full" name="email" type="email" autoComplete="email" required maxLength={254} /></label>
            <Script src="https://challenges.cloudflare.com/turnstile/v0/api.js" strategy="afterInteractive" />
            <div className="cf-turnstile" data-sitekey={siteKey} data-action="signup" data-size="flexible" />
            <button className="btn-primary w-full" type="submit">Resend verification email</button>
            <Link href="/signup" className="text-sm font-semibold">Back to registration</Link>
          </form>
        ) : enabled ? (
          <form action={signupAction} className="mt-6 space-y-4">
            <label className="block"><span className="field-label block">Full name</span><input className="input w-full" name="full_name" autoComplete="name" required minLength={2} maxLength={180} /></label>
            <label className="block"><span className="field-label block">Business name</span><input className="input w-full" name="business_name" autoComplete="organization" required minLength={2} maxLength={180} /></label>
            <label className="block"><span className="field-label block">Email</span><input className="input w-full" name="email" type="email" autoComplete="email" required maxLength={254} /></label>
            <label className="block"><span className="field-label block">Password</span><input className="input w-full" name="password" type="password" autoComplete="new-password" required minLength={12} maxLength={128} /><span className="text-xs text-copy-muted">At least 12 characters.</span></label>
            <Script src="https://challenges.cloudflare.com/turnstile/v0/api.js" strategy="afterInteractive" />
            <div className="cf-turnstile" data-sitekey={siteKey} data-action="signup" data-size="flexible" />
            <button className="btn-primary w-full" type="submit">Create account</button>
          </form>
        ) : <p className="mt-5 text-sm text-copy-muted">Self-service registration is not open yet.</p>}
        {enabled && !resend && <p className="mt-4 text-sm"><Link href="/signup?mode=resend" className="font-semibold text-brand-700 hover:underline">Resend verification email</Link></p>}
        <p className="mt-6 text-sm text-copy-muted">Already have an account? <Link href="/login" className="font-semibold text-brand-700 hover:underline">Sign in</Link></p>
      </section>
    </main>
  );
}
