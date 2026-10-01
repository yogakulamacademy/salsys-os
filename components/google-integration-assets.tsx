import {
  CheckCircle2,
  CircleDashed,
  RefreshCw,
} from 'lucide-react';

import type {
  IntegrationAsset,
} from '@/lib/integrations/types';

import {
  discoverGoogleAssetsAction,
  selectGoogleAssetAction,
} from '@/app/settings/integrations/actions';

const GROUPS = [
  {
    type:
      'ga4_property',
    title:
      'Google Analytics 4',
    description:
      'Choose the GA4 property the CRM should use for analytics reporting.',
  },
  {
    type:
      'search_console_site',
    title:
      'Search Console',
    description:
      'Choose the Search Console property used by the SEO workspace.',
  },
  {
    type:
      'google_ads_customer',
    title:
      'Google Ads',
    description:
      'Choose the Google Ads customer account used by paid-media reporting.',
  },
] as const;

export function GoogleIntegrationAssets({
  connectionId,
  assets,
}: {
  connectionId: string;
  assets:
    IntegrationAsset[];
}) {
  const googleAssets =
    assets.filter(
      (asset) =>
        [
          'ga4_property',
          'search_console_site',
          'google_ads_customer',
        ].includes(
          asset.asset_type,
        ),
    );

  return (
    <section className="card-pad mt-4 rounded-2xl border border-slate-200 bg-white">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="eyebrow">
            Google assets
          </div>

          <div className="section-title mt-1">
            Select what the CRM should use
          </div>

          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-500">
            Discover the GA4 properties, Search Console sites and Google Ads accounts available to the connected Google account. Selecting an asset does not switch the existing production sync yet.
          </p>
        </div>

        <form
          action={
            discoverGoogleAssetsAction
          }
        >
          <input
            type="hidden"
            name="connection_id"
            value={
              connectionId
            }
          />

          <button
            type="submit"
            className="btn-secondary"
          >
            <RefreshCw
              size={14}
            />
            Discover assets
          </button>
        </form>
      </div>

      <div className="mt-5 grid gap-4 xl:grid-cols-3">
        {GROUPS.map(
          (group) => {
            const groupAssets =
              googleAssets.filter(
                (asset) =>
                  asset.asset_type ===
                  group.type,
              );

            const selected =
              groupAssets.find(
                (asset) =>
                  asset.is_selected,
              );

            return (
              <div
                key={
                  group.type
                }
                className="rounded-xl border border-slate-200 bg-slate-50/70 p-4"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-sm font-semibold text-slate-900">
                      {
                        group.title
                      }
                    </div>

                    <p className="mt-1 text-[11px] leading-5 text-slate-500">
                      {
                        group.description
                      }
                    </p>
                  </div>

                  {selected ? (
                    <CheckCircle2
                      size={17}
                      className="shrink-0 text-emerald-600"
                    />
                  ) : (
                    <CircleDashed
                      size={17}
                      className="shrink-0 text-slate-400"
                    />
                  )}
                </div>

                {groupAssets.length ? (
                  <div className="mt-4 space-y-2">
                    {groupAssets.map(
                      (asset) => (
                        <form
                          key={
                            asset.id
                          }
                          action={
                            selectGoogleAssetAction
                          }
                          className={`rounded-lg border p-3 ${
                            asset.is_selected
                              ? 'border-violet-300 bg-violet-50/70'
                              : 'border-slate-200 bg-white'
                          }`}
                        >
                          <input
                            type="hidden"
                            name="connection_id"
                            value={
                              connectionId
                            }
                          />

                          <input
                            type="hidden"
                            name="asset_id"
                            value={
                              asset.id
                            }
                          />

                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <div className="truncate text-xs font-semibold text-slate-800">
                                {asset.name ??
                                  asset.external_id}
                              </div>

                              <div className="mt-1 break-all text-[10px] text-slate-500">
                                {
                                  asset.external_id
                                }
                              </div>
                            </div>

                            <button
                              type="submit"
                              disabled={
                                asset.is_selected
                              }
                              className={`shrink-0 rounded-md px-2.5 py-1.5 text-[10px] font-semibold ${
                                asset.is_selected
                                  ? 'cursor-default bg-emerald-100 text-emerald-700'
                                  : 'bg-violet-600 text-white hover:bg-violet-700'
                              }`}
                            >
                              {asset.is_selected
                                ? 'Selected'
                                : 'Use'}
                            </button>
                          </div>
                        </form>
                      ),
                    )}
                  </div>
                ) : (
                  <div className="mt-4 rounded-lg border border-dashed border-slate-300 bg-white px-3 py-4 text-center text-[11px] leading-5 text-slate-500">
                    No assets discovered yet.
                  </div>
                )}
              </div>
            );
          },
        )}
      </div>
    </section>
  );
}
