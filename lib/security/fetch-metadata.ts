export function isExplicitCrossSiteRequest(request: Request) {
  return request.headers.get('sec-fetch-site')?.trim().toLowerCase() === 'cross-site';
}
