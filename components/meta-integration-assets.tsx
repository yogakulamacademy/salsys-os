import {
  AlertTriangle,
  CheckCircle2,
  CircleDashed,
  RefreshCw,
} from 'lucide-react';

import {
  discoverMetaCustomAudiencesAction,
} from '@/app/settings/integrations/meta-audience-actions';
import type {
  IntegrationAsset,
} from '@/lib/integrations/types';
import {
  createClient,
} from '@/lib/supabase/server';

import {
  discoverMetaAssetsAction,
  selectMetaAssetAction,
} from '@/app/settings/integrations/actions';

type CachedCustomAudience = {
  id: string;
  name: string;
  subtype: string | null;
};

function objectMetadata(
  value: unknown,
): Record<string, unknown> {
  return value &&
    typeof value === 'object' &&
    !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function cachedCustomAudiences(
  value: unknown,
) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .slice(0, 500)
    .flatMap(
      (item) => {
        if (
          !item ||
          typeof item !== 'object' ||
          Array.isArray(item)
        ) {
          return [];
        }

        const record =
          item as Record<string, unknown>;

        const id =
          typeof record.id === 'string'
            ? record.id.trim()
            : '';

        const name =
          typeof record.name === 'string'
            ? record.name.trim()
            : '';

        const subtype =
          typeof record.subtype === 'string' &&
          record.subtype.trim()
            ? record.subtype.trim()
            : null;

        if (
          !/^\d+$/.test(id) ||
          !name
        ) {
          return [];
        }

        return [
          {
            id,
            name,
            subtype,
          } satisfies CachedCustomAudience,
        ];
      },
    );
}

function formatDiscoveredAt(
  value: unknown,
) {
  if (
    typeof value !== 'string' ||
    !value.trim()
  ) {
    return null;
  }

  const date =
    new Date(value);

  if (
    Number.isNaN(
      date.getTime(),
    )
  ) {
    return null;
  }

  return new Intl.DateTimeFormat(
    'en-IN',
    {
      dateStyle: 'medium',
      timeStyle: 'short',
    },
  ).format(date);
}

export async function MetaIntegrationAssets({
  connectionId,
  assets,
}: {
  connectionId: string;
  assets: IntegrationAsset[];
}) {
  const supabase =
    await createClient();

  const {
    data: connection,
  } =
    await supabase
      .from(
        'integration_connections',
      )
      .select(
        'scopes',
      )
      .eq(
        'id',
        connectionId,
      )
      .eq(
        'provider',
        'meta',
      )
      .maybeSingle();

  const scopes =
    Array.isArray(
      connection?.scopes,
    )
      ? connection.scopes
      : [];

  const normalizedScopes =
    new Set(
      scopes
        .filter(
          (scope): scope is string =>
            typeof scope ===
            'string',
        )
        .map((scope) =>
          scope.trim().toLowerCase(),
        )
        .filter(Boolean),
    );

  const hasAdsRead =
    normalizedScopes.has(
      'ads_read',
    );

  const hasAdsManagement =
    normalizedScopes.has(
      'ads_management',
    );

  const canDiscoverAds =
    hasAdsRead ||
    hasAdsManagement;

  const activationReady =
    hasAdsManagement;

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

  const selectedMetadata =
    objectMetadata(
      selected?.metadata,
    );

  const tosRaw =
    selectedMetadata[
      'custom_audience_tos_accepted'
    ];

  const customAudienceTosAccepted =
    tosRaw === true
      ? true
      : tosRaw === false
        ? false
        : null;

  const audiences =
    cachedCustomAudiences(
      selectedMetadata[
        'custom_audiences'
      ],
    );

  const audienceDiscoveryAt =
    formatDiscoveredAt(
      selectedMetadata[
        'custom_audiences_discovered_at'
      ],
    );

  const audienceDiscoveryTruncated =
    selectedMetadata[
      'custom_audiences_truncated'
    ] === true;

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
            disabled={
              !canDiscoverAds
            }
            title={
              canDiscoverAds
                ? undefined
                : 'Reconnect Meta after granting ads_read or ads_management.'
            }
            className={`btn-secondary ${
              canDiscoverAds
                ? ''
                : 'cursor-not-allowed opacity-50'
            }`}
          >
            <RefreshCw
              size={14}
            />
            Discover ad accounts
          </button>
        </form>
      </div>

      {activationReady ? (
        <div className="mt-5 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3">
          <div className="flex items-start gap-3">
            <CheckCircle2
              size={18}
              className="mt-0.5 shrink-0 text-emerald-600"
            />

            <div>
              <div className="text-sm font-semibold text-emerald-800">
                Meta Ads management permission is ready
              </div>

              <p className="mt-1 text-xs leading-5 text-emerald-700">
                This connection includes ads_management, so SalsysOS can discover
                ad accounts and can pass the permission gate required for Custom
                Audience activation. Live audience transport remains controlled by
                the separate activation kill switch and canary safeguards.
              </p>
            </div>
          </div>
        </div>
      ) : (
        <div className="mt-5 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
          <div className="flex items-start gap-3">
            <AlertTriangle
              size={18}
              className="mt-0.5 shrink-0 text-amber-600"
            />

            <div>
              <div className="text-sm font-semibold text-amber-900">
                Meta is connected, but Ads activation is not authorized
              </div>

              <p className="mt-1 text-xs leading-5 text-amber-800">
                {canDiscoverAds
                  ? 'This connection can read Meta Ads assets, but it is missing ads_management. Update the Meta Login for Business configuration to include ads_management, then reconnect Meta in SalsysOS before enabling Custom Audience activation.'
                  : 'This connection currently has Page/lead permissions only. Update the Meta Login for Business configuration to include ads_read and ads_management, assign the required ad account to the Meta system user/business integration, then reconnect Meta in SalsysOS.'}
              </p>

              <div className="mt-3 flex flex-wrap gap-2">
                <span
                  className={`rounded-full border px-2.5 py-1 text-[10px] font-semibold ${
                    hasAdsRead
                      ? 'border-emerald-200 bg-white text-emerald-700'
                      : 'border-amber-300 bg-white text-amber-800'
                  }`}
                >
                  ads_read: {hasAdsRead ? 'granted' : 'missing'}
                </span>

                <span className="rounded-full border border-amber-300 bg-white px-2.5 py-1 text-[10px] font-semibold text-amber-800">
                  ads_management: missing
                </span>
              </div>
            </div>
          </div>
        </div>
      )}

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
            {canDiscoverAds
              ? 'No Meta ad accounts discovered yet.'
              : 'Ad-account discovery is locked until Meta Ads permission is granted and the connection is reauthorized.'}
          </div>
        )}

        {selected ? (
          <div className="mt-5 border-t border-slate-200 pt-5">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <div className="text-sm font-semibold text-slate-900">
                  Custom Audience readiness
                </div>

                <p className="mt-1 max-w-2xl text-[11px] leading-5 text-slate-500">
                  SalsysOS only reads audience ID, name and subtype here. No audience
                  members, CRM identifiers or customer lists are downloaded or uploaded.
                </p>
              </div>

              <form
                action={
                  discoverMetaCustomAudiencesAction
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
                  disabled={
                    !hasAdsManagement
                  }
                  title={
                    hasAdsManagement
                      ? undefined
                      : 'Reconnect Meta with ads_management before discovering Custom Audiences.'
                  }
                  className={`btn-secondary ${
                    hasAdsManagement
                      ? ''
                      : 'cursor-not-allowed opacity-50'
                  }`}
                >
                  <RefreshCw
                    size={14}
                  />
                  Discover Custom Audiences
                </button>
              </form>
            </div>

            <div className="mt-3 flex flex-wrap gap-2">
              <span
                className={`rounded-full border px-2.5 py-1 text-[10px] font-semibold ${
                  customAudienceTosAccepted === true
                    ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                    : customAudienceTosAccepted === false
                      ? 'border-amber-300 bg-amber-50 text-amber-800'
                      : 'border-slate-200 bg-white text-slate-600'
                }`}
              >
                Custom Audience terms:{' '}
                {customAudienceTosAccepted === true
                  ? 'accepted'
                  : customAudienceTosAccepted === false
                    ? 'not accepted'
                    : 'not verified'}
              </span>

              <span
                className={`rounded-full border px-2.5 py-1 text-[10px] font-semibold ${
                  hasAdsManagement
                    ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                    : 'border-amber-300 bg-amber-50 text-amber-800'
                }`}
              >
                ads_management:{' '}
                {hasAdsManagement
                  ? 'granted'
                  : 'missing'}
              </span>
            </div>

            {audienceDiscoveryAt ? (
              <div className="mt-3 text-[10px] text-slate-500">
                Last safe metadata discovery: {audienceDiscoveryAt}
                {audienceDiscoveryTruncated
                  ? ' · result capped at 500 audiences'
                  : ''}
              </div>
            ) : null}

            {audiences.length ? (
              <div className="mt-4 space-y-2">
                {audiences
                  .slice(0, 20)
                  .map(
                    (audience) => (
                      <div
                        key={
                          audience.id
                        }
                        className="rounded-lg border border-slate-200 bg-white px-3 py-2"
                      >
                        <div className="text-xs font-semibold text-slate-800">
                          {audience.name}
                        </div>
                        <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-[10px] text-slate-500">
                          <span>
                            ID: {audience.id}
                          </span>
                          {audience.subtype ? (
                            <span>
                              Type: {audience.subtype}
                            </span>
                          ) : null}
                        </div>
                      </div>
                    ),
                  )}

                {audiences.length > 20 ? (
                  <div className="text-[10px] text-slate-500">
                    Showing 20 of {audiences.length} discovered Custom Audiences.
                  </div>
                ) : null}
              </div>
            ) : audienceDiscoveryAt ? (
              <div className="mt-4 rounded-lg border border-dashed border-slate-300 bg-white px-3 py-4 text-center text-[11px] leading-5 text-slate-500">
                No accessible Meta Custom Audiences were returned for this ad account.
              </div>
            ) : (
              <div className="mt-4 rounded-lg border border-dashed border-slate-300 bg-white px-3 py-4 text-center text-[11px] leading-5 text-slate-500">
                {hasAdsManagement
                  ? 'Run read-only Custom Audience discovery to choose the future canary destination.'
                  : 'Custom Audience discovery stays locked until Meta is reauthorized with ads_management.'}
              </div>
            )}
          </div>
        ) : null}
      </div>
    </section>
  );
}