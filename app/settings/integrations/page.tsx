import Link from 'next/link';

import type {
  ReactNode,
} from 'react';

import {
  redirect,
} from 'next/navigation';

import {
  ArrowLeft,
  BadgeCheck,
  CheckCircle2,
  CircleDashed,
  Facebook,
  Globe2,
  KeyRound,
  Link2,
  MessageCircle,
  RefreshCw,
  ShieldCheck,
  Unplug,
} from 'lucide-react';

import {
  PageHeader,
} from '@/components/ui';

import {
  IntegrationConnectButton,
} from '@/components/integration-connect-button';

import {
  GoogleIntegrationAssets,
} from '@/components/google-integration-assets';

import {
  createClient,
} from '@/lib/supabase/server';

import {
  createAdminClient,
} from '@/lib/supabase/admin';

import type {
  IntegrationAsset,
  IntegrationConnection,
  IntegrationProvider,
} from '@/lib/integrations/types';

import {
  disconnectIntegrationAction,
} from './actions';

type ProviderDefinition = {
  provider: IntegrationProvider;
  title: string;
  description: string;
  icon:
    ReactNode;
  futureAction: string;
};

const PROVIDERS:
  ProviderDefinition[] = [
    {
      provider:
        'google',
      title:
        'Google',
      description:
        'Analytics, Search Console and Google Ads under one authorized account connection.',
      icon:
        <Globe2 size={18} />,
      futureAction:
        'Google OAuth ready',
    },
    {
      provider:
        'meta',
      title:
        'Meta',
      description:
        'Business Portfolio, Facebook Pages, Instagram accounts and Meta Ads assets.',
      icon:
        <Facebook size={18} />,
      futureAction:
        'Meta authorization',
    },
    {
      provider:
        'whatsapp',
      title:
        'WhatsApp',
      description:
        'WhatsApp Business Account, phone number, templates and Cloud API messaging.',
      icon:
        <MessageCircle size={18} />,
      futureAction:
        'Meta / WhatsApp connection',
    },
  ];

function formatDate(
  value:
    | string
    | null
    | undefined,
) {
  if (!value) {
    return 'â€”';
  }

  const date =
    new Date(value);

  if (
    Number.isNaN(
      date.getTime(),
    )
  ) {
    return 'â€”';
  }

  return new Intl.DateTimeFormat(
    'en-IN',
    {
      dateStyle:
        'medium',
      timeStyle:
        'short',
    },
  ).format(date);
}

function providerConnection(
  connections:
    IntegrationConnection[],
  provider:
    IntegrationProvider,
) {
  return (
    connections.find(
      (connection) =>
        connection.provider ===
          provider &&
        connection.status ===
          'connected',
    ) ??
    connections.find(
      (connection) =>
        connection.provider ===
        provider,
    ) ??
    null
  );
}

function assetsForConnection(
  assets:
    IntegrationAsset[],
  connectionId:
    string | undefined,
) {
  if (!connectionId) {
    return [];
  }

  return assets.filter(
    (asset) =>
      asset.connection_id ===
      connectionId,
  );
}

function statusTone(
  status:
    string | null,
) {
  if (
    status ===
    'connected'
  ) {
    return 'border-emerald-200 bg-emerald-50 text-emerald-700';
  }

  if (
    status ===
      'error' ||
    status ===
      'expired' ||
    status ===
      'revoked'
  ) {
    return 'border-rose-200 bg-rose-50 text-rose-700';
  }

  return 'border-slate-200 bg-slate-50 text-slate-600';
}

function legacyConfiguration(
  provider:
    IntegrationProvider,
) {
  if (
    provider ===
    'google'
  ) {
    return Boolean(
      process.env
        .GCP_SERVICE_ACCOUNT_EMAIL ||
      process.env
        .GA4_PROPERTY_ID ||
      process.env
        .GSC_SITE_URL ||
      process.env
        .GOOGLE_ADS_CUSTOMER_ID,
    );
  }

  if (
    provider ===
    'meta'
  ) {
    return Boolean(
      process.env
        .META_ACCESS_TOKEN &&
      process.env
        .META_AD_ACCOUNT_ID,
    );
  }

  return Boolean(
    process.env
      .WA_ACCESS_TOKEN &&
    process.env
      .WA_PHONE_NUMBER_ID,
  );
}

export default async function IntegrationsPage({
  searchParams,
}: {
  searchParams:
    Promise<{
      notice?: string;
      error?: string;
      organization_id?: string;
    }>;
}) {
  const query =
    await searchParams;

  const supabase =
    await createClient();

  const {
    data: {
      user,
    },
    error: authError,
  } =
    await supabase.auth.getUser();

  if (
    authError ||
    !user
  ) {
    redirect('/login');
  }

  const {
    data: profile,
    error: profileError,
  } =
    await supabase
      .from('profiles')
      .select(
        'id, active',
      )
      .eq(
        'id',
        user.id,
      )
      .maybeSingle();

  if (
    profileError ||
    !profile ||
    profile.active !== true
  ) {
    redirect('/dashboard');
  }

  const admin =
    createAdminClient();

  const requestedOrganizationId =
    query.organization_id?.trim() ||
    null;

  let membershipQuery =
    admin
      .from(
        'organization_members',
      )
      .select(
        'organization_id, role',
      )
      .eq(
        'user_id',
        user.id,
      )
      .eq(
        'active',
        true,
      )
      .in(
        'role',
        [
          'owner',
          'admin',
        ],
      );

  if (
    requestedOrganizationId
  ) {
    membershipQuery =
      membershipQuery.eq(
        'organization_id',
        requestedOrganizationId,
      );
  }

  const {
    data:
      rawMemberships,
    error:
      membershipError,
  } =
    await membershipQuery;

  const memberships =
    (
      rawMemberships ??
      []
    ) as Array<{
      organization_id:
        string;
      role:
        string;
    }>;

  if (
    membershipError ||
    memberships.length ===
      0
  ) {
    redirect('/dashboard');
  }

  /*
   * Today the account has one manageable workspace.
   * When the SalsysOS workspace switcher is added it will pass
   * organization_id explicitly. Until then, the first manageable
   * workspace is used only when no workspace was supplied.
   */
  const organizationId =
    requestedOrganizationId ??
    memberships[0]
      .organization_id;

  const {
    data:
      organization,
    error:
      organizationError,
  } =
    await admin
      .from(
        'organizations',
      )
      .select(
        'id, name, status',
      )
      .eq(
        'id',
        organizationId,
      )
      .eq(
        'status',
        'active',
      )
      .maybeSingle();

  if (
    organizationError ||
    !organization
  ) {
    redirect('/dashboard');
  }

  const [
    connectionsResult,
    assetsResult,
  ] =
    await Promise.all([
      admin
        .from(
          'integration_connections',
        )
        .select('*')
        .eq(
          'organization_id',
          organizationId,
        )
        .order(
          'created_at',
          {
            ascending: true,
          },
        ),

      admin
        .from(
          'integration_assets',
        )
        .select('*')
        .eq(
          'organization_id',
          organizationId,
        )
        .order(
          'asset_type',
          {
            ascending: true,
          },
        ),
    ]);

  const foundationMissing =
    connectionsResult.error
      ?.code === '42P01' ||
    assetsResult.error
      ?.code === '42P01';

  const workspace = {
    installed:
      !foundationMissing,
    error:
      foundationMissing
        ? null
        : connectionsResult.error
            ?.message ??
          assetsResult.error
            ?.message ??
          null,
    connections:
      (
        connectionsResult.data ??
        []
      ) as unknown as
        IntegrationConnection[],
    assets:
      (
        assetsResult.data ??
        []
      ) as unknown as
        IntegrationAsset[],
  };

  const encryptionConfigured =
    Boolean(
      process.env
        .INTEGRATION_ENCRYPTION_KEY,
    );

  return (
    <div className="settings-integrations-page">
      <PageHeader
        eyebrow="Settings"
        title="Account integrations"
        description="Connect external accounts once, select the assets the CRM should use, and keep provider credentials server-side."
        actions={
          <Link
            href="/settings"
            className="btn-secondary"
          >
            <ArrowLeft
              size={15}
            />
            Back to Settings
          </Link>
        }
      />

      {query.notice ? (
        <div className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
          {query.notice}
        </div>
      ) : null}

      {query.error ? (
        <div className="mb-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {query.error}
        </div>
      ) : null}

      {!workspace.installed ? (
        <section className="card-pad rounded-2xl border border-amber-200 bg-amber-50/70">
          <div className="flex items-start gap-3">
            <CircleDashed
              size={19}
              className="mt-0.5 shrink-0 text-amber-600"
            />

            <div>
              <div className="text-sm font-semibold text-slate-900">
                Database foundation required
              </div>

              <p className="mt-1 text-sm leading-6 text-slate-600">
                Run the supplied integration foundation SQL in Supabase first. The current Google, Meta and WhatsApp integrations are not changed by that migration.
              </p>
            </div>
          </div>
        </section>
      ) : null}

      {workspace.error &&
      workspace.installed ? (
        <section className="card-pad rounded-2xl border border-rose-200 bg-rose-50/70">
          <div className="text-sm font-semibold text-rose-700">
            Unable to load integrations
          </div>

          <p className="mt-1 text-sm text-rose-600">
            {workspace.error}
          </p>
        </section>
      ) : null}

      <div className="mt-4 grid gap-4 xl:grid-cols-3">
        {PROVIDERS.map(
          (definition) => {
            const connection =
              providerConnection(
                workspace.connections,
                definition.provider,
              );

            const assets =
              assetsForConnection(
                workspace.assets,
                connection?.id,
              );

            const selectedAssets =
              assets.filter(
                (asset) =>
                  asset.is_selected,
              );

            const legacy =
              legacyConfiguration(
                definition.provider,
              );

            return (
              <section
                key={
                  definition.provider
                }
                className="card-pad rounded-2xl border border-slate-200 bg-white"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex min-w-0 items-start gap-3">
                    <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-violet-50 text-violet-600">
                      {
                        definition.icon
                      }
                    </span>

                    <div className="min-w-0">
                      <div className="text-base font-semibold text-slate-950">
                        {
                          definition.title
                        }
                      </div>

                      <p className="mt-1 text-xs leading-5 text-slate-500">
                        {
                          definition.description
                        }
                      </p>
                    </div>
                  </div>

                  <span
                    className={`shrink-0 rounded-full border px-2.5 py-1 text-[10px] font-semibold ${statusTone(
                      connection?.status ??
                        null,
                    )}`}
                  >
                    {connection?.status ===
                    'connected'
                      ? 'Connected'
                      : connection?.status
                        ? connection.status
                        : 'Not connected'}
                  </span>
                </div>

                <div className="mt-5 space-y-3">
                  <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-3">
                    <div className="flex items-center justify-between gap-3 text-xs">
                      <span className="text-slate-500">
                        Account
                      </span>

                      <span className="max-w-[65%] truncate text-right font-semibold text-slate-700">
                        {connection?.account_name ??
                          connection?.account_email ??
                          'â€”'}
                      </span>
                    </div>

                    <div className="mt-2 flex items-center justify-between gap-3 text-xs">
                      <span className="text-slate-500">
                        Auth mode
                      </span>

                      <span className="text-right font-medium text-slate-700">
                        {connection?.auth_mode ??
                          'â€”'}
                      </span>
                    </div>

                    <div className="mt-2 flex items-center justify-between gap-3 text-xs">
                      <span className="text-slate-500">
                        Selected assets
                      </span>

                      <span className="font-semibold text-slate-700">
                        {
                          selectedAssets.length
                        }
                      </span>
                    </div>

                    <div className="mt-2 flex items-center justify-between gap-3 text-xs">
                      <span className="text-slate-500">
                        Last verified
                      </span>

                      <span className="text-right text-slate-600">
                        {formatDate(
                          connection?.last_verified_at,
                        )}
                      </span>
                    </div>
                  </div>

                  {connection?.last_error ? (
                    <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs leading-5 text-rose-700">
                      {
                        connection.last_error
                      }
                    </div>
                  ) : null}

                  <div className="flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2.5">
                    {legacy ? (
                      <CheckCircle2
                        size={16}
                        className="shrink-0 text-emerald-600"
                      />
                    ) : (
                      <CircleDashed
                        size={16}
                        className="shrink-0 text-slate-400"
                      />
                    )}

                    <div className="min-w-0">
                      <div className="text-[11px] font-semibold text-slate-700">
                        Existing integration
                      </div>

                      <div className="mt-0.5 text-[10px] leading-4 text-slate-500">
                        {legacy
                          ? 'Legacy server configuration detected. It remains active during migration.'
                          : 'No legacy environment configuration detected by this page.'}
                      </div>
                    </div>
                  </div>
                </div>

                <div className="mt-5 flex flex-wrap items-center gap-2">
                  {connection?.status ===
                  'connected' ? (
                    <>
                      <span className="inline-flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-700">
                        <BadgeCheck
                          size={14}
                        />
                        Account connected
                      </span>

                      {definition.provider ===
                      'google' ? (
                        <IntegrationConnectButton
                          provider="google"
                          mode="reconnect"
                        />
                      ) : null}

                      <form
                        action={
                          disconnectIntegrationAction
                        }
                      >
                        <input
                          type="hidden"
                          name="connection_id"
                          value={
                            connection.id
                          }
                        />

                        <button
                          type="submit"
                          className="btn-secondary"
                        >
                          <Unplug
                            size={14}
                          />
                          Disconnect
                        </button>
                      </form>
                    </>
                  ) : definition.provider ===
                    'google' ? (
                    <IntegrationConnectButton
                      provider="google"
                    />
                  ) : (
                    <button
                      type="button"
                      disabled
                      title={`${definition.futureAction} is added in the next provider-specific step.`}
                      className="inline-flex cursor-not-allowed items-center gap-2 rounded-lg bg-violet-600 px-3 py-2 text-xs font-semibold text-white opacity-55"
                    >
                      <Link2
                        size={14}
                      />
                      Connect account
                    </button>
                  )}

                  <span className="text-[10px] text-slate-400">
                    {definition.provider ===
                    'google'
                      ? 'OAuth authorization ready'
                      : `${definition.futureAction} Â· next step`}
                  </span>
                </div>
              </section>
            );
          },
        )}
      </div>

      {(() => {
        const googleConnection =
          providerConnection(
            workspace.connections,
            'google',
          );

        if (
          !googleConnection ||
          googleConnection.status !==
            'connected'
        ) {
          return null;
        }

        return (
          <GoogleIntegrationAssets
            connectionId={
              googleConnection.id
            }
            assets={
              assetsForConnection(
                workspace.assets,
                googleConnection.id,
              )
            }
          />
        );
      })()}

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <section className="card-pad rounded-2xl border border-slate-200 bg-white">
          <div className="flex items-start gap-3">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-slate-100 text-slate-600">
              <ShieldCheck
                size={18}
              />
            </span>

            <div>
              <div className="eyebrow">
                Security
              </div>

              <div className="section-title mt-1">
                Credential storage
              </div>
            </div>
          </div>

          <div className="mt-5 space-y-3">
            <SecurityRow
              ready={
                encryptionConfigured
              }
              title="Encryption key"
              detail={
                encryptionConfigured
                  ? 'INTEGRATION_ENCRYPTION_KEY is configured server-side.'
                  : 'Add INTEGRATION_ENCRYPTION_KEY before storing OAuth or provider tokens.'
              }
            />

            <SecurityRow
              ready={
                workspace.installed
              }
              title="Protected integration tables"
              detail="Browser roles have no direct grants to connection, asset, OAuth-state or audit tables."
            />

            <SecurityRow
              ready
              title="Safe migration"
              detail="Existing sync routes keep using their current credentials until each provider is deliberately migrated."
            />
          </div>
        </section>

        <section className="card-pad rounded-2xl border border-slate-200 bg-white">
          <div className="flex items-start gap-3">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-violet-50 text-violet-600">
              <RefreshCw
                size={18}
              />
            </span>

            <div>
              <div className="eyebrow">
                Migration
              </div>

              <div className="section-title mt-1">
                What changes later
              </div>
            </div>
          </div>

          <div className="mt-5 space-y-3 text-sm leading-6 text-slate-600">
            <p>
              Account-specific access tokens, refresh tokens and discovered asset IDs move into the integration layer.
            </p>

            <p>
              Stable application credentials such as Google OAuth client credentials, Meta App credentials, webhook verification secrets and the integration encryption key remain server-only environment values.
            </p>

            <p>
              The CRM can then select GA4 properties, Search Console sites, Google Ads accounts, Meta ad accounts, Facebook Pages, Instagram accounts, WABAs and WhatsApp phone numbers without code changes.
            </p>
          </div>

          <div className="mt-5 rounded-xl border border-violet-200 bg-violet-50/70 p-3 text-xs leading-5 text-violet-800">
            Provider-specific OAuth is intentionally not enabled until this foundation is installed and verified. This prevents us from disturbing the working production integrations.
          </div>
        </section>
      </div>

      <section className="card-pad mt-4 rounded-2xl border border-slate-200 bg-white">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="eyebrow">
              Next
            </div>

            <div className="section-title mt-1">
              Google OAuth connection
            </div>

            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-500">
              Google account authorization is now enabled. After connecting, the next step will discover the GA4 properties, Search Console sites and Google Ads accounts available to that Google account so you can select the CRM assets without changing code.
            </p>
          </div>

          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-slate-100 text-slate-600">
            <KeyRound
              size={18}
            />
          </span>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          <span className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
            GA4 property selection
          </span>

          <span className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
            Search Console site selection
          </span>

          <span className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
            Google Ads account selection
          </span>
        </div>
      </section>
    </div>
  );
}

function SecurityRow({
  ready,
  title,
  detail,
}: {
  ready: boolean;
  title: string;
  detail: string;
}) {
  return (
    <div className="flex items-start gap-3 rounded-xl border border-slate-200 bg-slate-50/70 p-3">
      {ready ? (
        <CheckCircle2
          size={16}
          className="mt-0.5 shrink-0 text-emerald-600"
        />
      ) : (
        <CircleDashed
          size={16}
          className="mt-0.5 shrink-0 text-amber-600"
        />
      )}

      <div>
        <div className="text-xs font-semibold text-slate-700">
          {title}
        </div>

        <div className="mt-1 text-[11px] leading-5 text-slate-500">
          {detail}
        </div>
      </div>
    </div>
  );
}