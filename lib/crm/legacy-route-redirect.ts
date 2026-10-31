export type LegacySearchParams = Record<
  string,
  string | string[] | undefined
>;

type OverrideValue = string | string[] | null | undefined;

export function buildCrmCompatibilityUrl(
  pathname: string,
  params: LegacySearchParams,
  overrides: Record<string, OverrideValue> = {},
) {
  const search = new URLSearchParams();

  for (const [key, value] of Object.entries(params)) {
    if (value == null) continue;
    const values = Array.isArray(value) ? value : [value];
    for (const item of values) {
      if (item !== '') search.append(key, item);
    }
  }

  for (const [key, value] of Object.entries(overrides)) {
    search.delete(key);
    if (value == null) continue;
    const values = Array.isArray(value) ? value : [value];
    for (const item of values) {
      if (item !== '') search.append(key, item);
    }
  }

  const query = search.toString();
  return query ? `${pathname}?${query}` : pathname;
}

export function firstParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] ?? '' : value ?? '';
}
