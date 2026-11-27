import Script from 'next/script';
import { AuthMessage, AuthShell, authStyles as styles } from '@/components/auth/auth-shell';
import { EmailField, SignupFields, SignupSteps } from '@/components/auth/account-fields';
import { SubmitButton } from '@/components/auth/auth-controls';
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
  const captcha = <div className={styles.captcha}><Script src="https://challenges.cloudflare.com/turnstile/v0/api.js" strategy="afterInteractive" /><div className="cf-turnstile" data-sitekey={siteKey} data-action="signup" data-size="flexible" /></div>;
  return (
    <AuthShell kind="signup">
      {enabled && !resend && <SignupSteps />}
      <p className={styles.formKicker}>{resend ? 'ONE MORE STEP' : 'LET’S GET YOU STARTED'}</p>
      <h1 className={styles.title}>{resend ? 'Check your inbox.' : 'Create your account.'}</h1>
      <p className={styles.description}>{resend ? 'Need a new verification link? We can help.' : 'Your business. One connected workspace.'}</p>
      {params.error && <AuthMessage error>{params.error}</AuthMessage>}
      {params.notice && <AuthMessage>{params.notice}</AuthMessage>}
      {enabled && isSignupPilotMode() && <p className={styles.pilotNote}>Registration is limited to designated pilot accounts.</p>}
      {enabled && resend ? (
        <>
          <p className={styles.description}>Use the email you registered with. Open the link in the original signup browser. Already verified? Sign in below.</p>
          <form action={resendSignupVerificationAction} className={styles.form}>
            <EmailField />{captcha}
            <SubmitButton pendingText="Requesting link…">Resend verification email</SubmitButton>
          </form>
          <p className={styles.resendLink}><a className={styles.inlineLink} href="/signup">Back to registration</a></p>
        </>
      ) : enabled ? (
        <>
          <form action={signupAction} className={styles.form}>
            <SignupFields />{captcha}
            <SubmitButton pendingText="Creating account…">Create account</SubmitButton>
          </form>
          <p className={styles.planNote}>Free forever, with 30 days of Pro trial access. No automatic charges. After your trial, continue on Free.</p>
          <p className={styles.resendLink}><a className={styles.inlineLink} href="/signup?mode=resend">Resend verification email</a></p>
        </>
      ) : (
        <div className={styles.closed}><h2>Registration isn’t open yet.</h2><p>Have an account? You can still sign in. For access enquiries, contact the SalsysOS team.</p><a href="https://salsysos.com/contact">Contact us</a></div>
      )}
      <p className={styles.switch}>Already have an account? <a href="/login">Sign in</a></p>
    </AuthShell>
  );
}
