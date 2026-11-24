// Pure pagination helpers; no authority or tenant identity comes from the URL.
export const ORGANIZATION_PAGE_SIZE = 25;
export const MAX_ORGANIZATION_PAGE = 100000;

export function parseOrganizationPage(value: unknown): number {
  if (typeof value !== 'string' || !/^[1-9][0-9]{0,5}$/.test(value)) return 1;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed <= MAX_ORGANIZATION_PAGE ? parsed : 1;
}

export function organizationPageRange(page: number) {
  if (!Number.isSafeInteger(page) || page < 1 || page > MAX_ORGANIZATION_PAGE) throw Error('Invalid registry page.');
  const from = (page - 1) * ORGANIZATION_PAGE_SIZE;
  return { from, to: from + ORGANIZATION_PAGE_SIZE - 1 };
}

export const ORGANIZATION_STATUSES = ['active','suspended','archived'] as const;
export type OrganizationStatus = typeof ORGANIZATION_STATUSES[number];
export type OrganizationFilters = { search: string; status: OrganizationStatus | ''; invalidSearch: boolean };

export function parseOrganizationFilters(search: unknown, status: unknown): OrganizationFilters {
  const raw = typeof search === 'string' ? search.trim() : '';
  // Restrict the OR grammar to literal letters, numbers, spaces and hyphens.
  // No PostgREST syntax, wildcards, escaping, or unbounded search strings.
  const invalidSearch = (search !== undefined && typeof search !== 'string') ||
    raw.length > 80 || (raw !== '' && !/^[\p{L}\p{M}\p{N} -]+$/u.test(raw));
  const validStatus = ORGANIZATION_STATUSES.find(candidate => candidate === status) ?? '';
  return { search: invalidSearch ? '' : raw, status: validStatus, invalidSearch };
}

export function organizationSearchExpression(search: string): string {
  if (!search || search.length > 80 || !/^[\p{L}\p{M}\p{N} -]+$/u.test(search)) throw Error('Invalid organization search.');
  return 'name.ilike.*' + search + '*,slug.ilike.*' + search + '*';
}

export function organizationPageHref(page: number, filters?: Pick<OrganizationFilters,'search'|'status'>) {
  organizationPageRange(page);
  const params = new URLSearchParams({ page: String(page) });
  if (filters?.search) params.set('q', filters.search);
  if (filters?.status) params.set('status', filters.status);
  return '/settings/organizations?' + params.toString();
}
