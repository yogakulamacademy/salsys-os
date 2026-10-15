import {
  CheckCircle2,
  CircleDashed,
  RefreshCw,
} from 'lucide-react';

import type {
  IntegrationAsset,
} from '@/lib/integrations/types';

import {
  discoverMetaAssetsAction,
  selectMetaAssetAction,
} from '@/app/settings/integrations/actions';

export function MetaIntegrationAssets({
  connectionId,
  assets,
}: {
  connectionId: string;
  assets: IntegrationAsset[];
}) {
  const metaAssets =
    assets.filter(
      (asset) =>
        asset.asset_type ===
        'meta_ad_account',
    );

  const selected =
    metaAssets.find(
      (asset) =>
        asset.is_selected,
    );

  return (
    <section className="card-pad mt-4 rounded-2xl border border-slate-200 bg-white">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="eyebrow">
            Meta Ads assets
          </div>

          <div className="section-title mt-1">
            Select the ad account used for paid-media reporting
          </div>

          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-500">
            Discover ad accounts available to the connected Meta business integration.
            If exactly one account is available, SalsysOS selects it automatically.
            Multiple accounts require an explicit selection.
          </p>
        </div>

        <form
          action={
            discoverMetaAssetsAction
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
            Discover ad accounts
          </button>
        </form>
      </div>

      <div className="mt-5 rounded-xl border border-slate-200 bg-slate-50/70 p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-sm font-semibold text-slate-900">
              Meta Ads
            </div>

            <p className="mt-1 text-[11px] leading-5 text-slate-500">
              The selected account is the only Meta Ads asset the tenant-scoped sync is allowed to use.
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

        {metaAssets.length ? (
          <div className="mt-4 space-y-2">
            {metaAssets.map(
              (asset) => (
                <form
                  key={
                    asset.id
                  }
                  action={
                    selectMetaAssetAction
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
                        act_{asset.external_id}
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
            No Meta ad accounts discovered yet.
          </div>
        )}
      </div>
    </section>
  );
}