// Visitor location from request headers, wherever the app runs (Nov 2026).
// Vercel adds x-vercel-ip-*; behind Cloudflare (self-hosting) the same facts
// come as cf-ipcountry and, with Cloudflare's free "Add visitor location
// headers" managed transform, cf-region-code / cf-ipcity / cf-timezone.
// Pure: takes a Headers-like object so it runs in tests without Next.js.

type HeaderReader = { get(name: string): string | null };

function first(headers: HeaderReader, names: string[]): string | null {
  for (const name of names) {
    const value = headers.get(name)?.trim();
    if (value) return value;
  }
  return null;
}

function decode(value: string | null): string | null {
  if (!value) return null;
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

export type RequestGeo = { country: string | null; region: string | null; city: string | null; timezone: string | null };

export function requestGeoFromHeaders(headers: HeaderReader): RequestGeo {
  const country = first(headers, ['x-vercel-ip-country', 'cf-ipcountry', 'x-country-code']);
  return {
    // Cloudflare uses XX for unknown and T1 for Tor: neither is a country.
    country: country && !['XX', 'T1'].includes(country.toUpperCase()) ? country.toUpperCase() : null,
    region: first(headers, ['x-vercel-ip-country-region', 'cf-region-code', 'x-region-code']),
    city: decode(first(headers, ['x-vercel-ip-city', 'cf-ipcity', 'x-city'])),
    timezone: first(headers, ['x-vercel-ip-timezone', 'cf-timezone', 'x-timezone']),
  };
}
