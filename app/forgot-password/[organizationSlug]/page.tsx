import { redirect } from 'next/navigation';

export default async function LegacyTenantForgotPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; notice?: string }>;
}) {
  const query = await searchParams;
  const params = new URLSearchParams();

  if (query.error) params.set('error', query.error);
  if (query.notice) params.set('notice', query.notice);

  const suffix = params.toString();
  redirect(suffix ? `/forgot-password?${suffix}` : '/forgot-password');
}
