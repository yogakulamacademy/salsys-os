import { redirect } from 'next/navigation';

export default async function LegacyTenantResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const query = await searchParams;
  const params = new URLSearchParams();

  if (query.error) params.set('error', query.error);

  const suffix = params.toString();
  redirect(suffix ? `/reset-password?${suffix}` : '/reset-password');
}
