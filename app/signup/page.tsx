import Link from 'next/link';
import { BrandIdentity, BrandMark } from '@/components/brand';
import { SALSYSOS_VERSION_LABEL } from '@/lib/product-version';

export const dynamic = 'force-dynamic';

export default function SignupPage() {
  return (
    <main className="grid min-h-screen place-items-center bg-mist px-4 py-10">
      <section className="w-full max-w-md rounded-[20px] border border-line bg-surface p-7 shadow-panel sm:p-9">
        <div className="mb-7 flex items-center gap-3">
          <BrandMark size="large" /><BrandIdentity version={SALSYSOS_VERSION_LABEL} />
        </div>
        <div className="ui-page-kicker">Get started</div>
        <h1 className="mt-2 text-[26px] font-semibold text-copy-strong">Create your SalsysOS account</h1>
        <p className="mt-3 text-sm leading-6 text-copy-muted">
          Self-service registration is not open yet. Account creation will be followed by email verification and guided business onboarding.
        </p>
        <p className="mt-6 text-sm text-copy-muted">
          Already have an account? <Link href="/login" className="font-semibold text-brand-700 hover:underline">Sign in</Link>
        </p>
      </section>
    </main>
  );
}
