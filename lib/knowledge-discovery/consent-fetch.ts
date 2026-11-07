import { WebsiteFetchError } from './public-fetch';
import type { DiscoveryFetcher } from './run-core';

/**
 * Every future outbound discovery fetch requires a freshly checked tenant/
 * host consent. Redirect validation is repeated before following the redirect,
 * in addition to the worker's first pre-claim check and atomic SQL commit.
 *
 * No consent may be granted here; source content stays in memory only.
 */
export function withDiscoveryConsent(
  fetchPage: DiscoveryFetcher,
  checkConsent: (hostname: string) => Promise<boolean>,
): DiscoveryFetcher {
  return async(seed,page,kind,authorizeRedirect)=>{
    if(!await checkConsent(seed.hostname))
      throw new WebsiteFetchError('consent_not_active');
    return fetchPage(seed,page,kind,async next=>{
      if(!await checkConsent(seed.hostname))
        throw new WebsiteFetchError('consent_not_active');
      if(authorizeRedirect)await authorizeRedirect(next);
    });
  };
}
