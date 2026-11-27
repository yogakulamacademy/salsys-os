import { PageFeedback } from '@/components/page-feedback';
import { ShieldCheck } from 'lucide-react';
import { signInAction } from '@/app/actions/auth';
import { AuthMessage, AuthShell, authStyles as styles } from '@/components/auth/auth-shell';
import { LoginFields } from '@/components/auth/account-fields';
import { SubmitButton } from '@/components/auth/auth-controls';
import { useMockData } from '@/lib/config';
import { isPublicSignupAvailable } from '@/lib/signup/availability';

export default async function LoginPage({ searchParams }: {
  searchParams: Promise<{ error?: string; notice?: string; next?: string }>;
}) {
  const params = await searchParams;
  const signupAvailable = await isPublicSignupAvailable();
  return (<><PageFeedback error={params.error} notice={params.notice} />{(
    <AuthShell kind="login">
      <p className={styles.formKicker}>YOUR WORKSPACE AWAITS</p>
      <h1 className={styles.title}>Welcome back.</h1>
      <p className={styles.description}>Sign in to your SalsysOS workspace.</p>
      {params.notice && <AuthMessage>{params.notice}</AuthMessage>}
      {params.error && <AuthMessage error>{params.error}</AuthMessage>}
      {useMockData && <p role="status" className={`${styles.message} ${styles.mockNote}`}>Demo data mode is active. Sign-in opens a sample workspace.</p>}
      <form action={signInAction} className={styles.form}>
        <input type="hidden" name="next" value={params.next ?? '/dashboard'} />
        <LoginFields />
        <SubmitButton pendingText="Signing in…">Sign in</SubmitButton>
      </form>
      {signupAvailable && <p className={styles.switch}>New to SalsysOS? <a href="/signup">Create an account</a></p>}
      <p className={styles.secureNote}><ShieldCheck size={15} />Your account connects you to your organization.</p>
    </AuthShell>
  )}</>);
}
