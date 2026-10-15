import { redirect } from 'next/navigation';

export default async function LegacyTenantLoginPage({
  searchParams,
}: {
  searchParams: Promise<{
    error?: string;
    notice?: string;
    next?: string;
  }>;
}) {
  const query = await searchParams;
  const params = new URLSearchParams();

  if (query.error) {
    params.set('error', query.error);
  }

  if (query.notice) {
    params.set('notice', query.notice);
  }

  if (query.next) {
    params.set('next', query.next);
  }

  const suffix = params.toString();

  redirect(suffix ? `/login?${suffix}` : '/login');
}