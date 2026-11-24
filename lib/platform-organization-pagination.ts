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

export function organizationPageHref(page: number) {
  organizationPageRange(page);
  return '/settings/organizations?page=' + page;
}
