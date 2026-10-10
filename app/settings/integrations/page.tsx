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
  WhatsAppEmbeddedSignupButton,
} from '@/components/whatsapp-embedded-signup-button';

import {
  GoogleIntegrationAssets,
} from '@/components/google-integration-assets';

import {
  createClient,
} from '@/lib/supabase/server';

import {
  getWorkspaceContextForUser,
} from '@/lib/workspace';

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
        'Google connection',
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
        'Meta connection',
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
        'WhatsApp connection',
    },
  ];

function formatDate(
  value:
    | string
    | null
    | undefined,
) {
  if (!value) {
    return '-';
  }

  const date =
    new Date(value);

  if (
    Number.isNaN(
      date.getTime(),
    )
  ) {
    return '-';
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

  const workspaceContext =
    await getWorkspaceContextForUser(
      supabase,
      user.id,
    );

  const activeWorkspace =
    workspaceContext.activeWorkspace;

  if (
    !activeWorkspace ||
    !['owner', 'admin'].includes(
      activeWorkspace.role,
    )
  ) {
    redirect('/dashboard');
  }

  const organizationId =
    activeWorkspace.organizationId;

  const admin =
    createAdminClient();

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

  const whatsappEmbeddedSignup = {
    appId:
      process.env.META_APP_ID?.trim() ?? '',
    configId:
      process.env.WHATSAPP_EMBEDDED_SIGNUP_CONFIG_ID?.trim() ?? '',
    graphVersion:
      /^v\d+\.\d+$/.test(
        process.env.META_API_VERSION?.trim() ?? '',
      )
        ? process.env.META_API_VERSION!.trim()
        : 'v26.0',
  };

  return (
    <div className="settings-integrations-page">
      <PageHeader
        eyebrow="Settings"
        title="Account integrations"
        description="Connect external accounts, choose the assets this workspace should use, and manage connection status securely."
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
                      : 'Not connected'}
                  </span>
                </div>

                <div className="mt-5 space-y-3">
                  <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-3">
                    <div className="flex items-center justify-between gap-3 text-xs">
                      <span className="text-slate-500">
                        {connection &&
                        connection.status !==
                          'connected'
                          ? 'Previous account'
                          : 'Account'}
                      </span>

                      <span className="max-w-[65%] truncate text-right font-semibold text-slate-700">
                        {connection?.account_name ??
                          connection?.account_email ??
                          '-'}
                      </span>
                    </div>


                    <div className="mt-2 flex items-center justify-between gap-3 text-xs">
                      <span className="text-slate-500">
                        {connection &&
                        connection.status !==
                          'connected'
                          ? 'Saved assets'
                          : 'Selected assets'}
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

                      {(
                        definition.provider === 'google' ||
                        definition.provider === 'meta'
                      ) ? (
                        <IntegrationConnectButton
                          provider={definition.provider}
                          mode="reconnect"
                        />
                      ) : definition.provider === 'whatsapp' ? (
                        <WhatsAppEmbeddedSignupButton
                          appId={whatsappEmbeddedSignup.appId}
                          configId={whatsappEmbeddedSignup.configId}
                          graphVersion={whatsappEmbeddedSignup.graphVersion}
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
                  ) : (
                    definition.provider === 'google' ||
                    definition.provider === 'meta'
                  ) ? (
                    <IntegrationConnectButton
                      provider={definition.provider}
                      mode={
                        connection
                          ? 'reconnect'
                          : 'connect'
                      }
                    />
                  ) : definition.provider === 'whatsapp' ? (
                    <div className="w-full rounded-xl border border-violet-100 bg-violet-50/40 p-3">
                      <div className="mb-3">
                        <div className="text-xs font-semibold text-slate-800">
                          Connect WhatsApp Business
                        </div>
                        <p className="mt-1 text-[11px] leading-5 text-slate-500">
                          Continue with Meta to choose this workspace&apos;s WhatsApp Business Account and phone number. SalsysOS encrypts the returned business credential and keeps it isolated to this workspace.
                        </p>
                      </div>

                      <WhatsAppEmbeddedSignupButton
                        appId={whatsappEmbeddedSignup.appId}
                        configId={whatsappEmbeddedSignup.configId}
                        graphVersion={whatsappEmbeddedSignup.graphVersion}
                        mode={connection ? 'reconnect' : 'connect'}
                      />

                      {!whatsappEmbeddedSignup.configId ? (
                        <div className="mt-2 text-[10px] leading-4 text-amber-600">
                          Add WHATSAPP_EMBEDDED_SIGNUP_CONFIG_ID on the server before testing this connection.
                        </div>
                      ) : null}
                    </div>
                  ) : (
                    <button
                      type="button"
                      disabled
                      title={`${definition.futureAction} setup is not available yet.`}
                      className="inline-flex cursor-not-allowed items-center gap-2 rounded-lg bg-violet-600 px-3 py-2 text-xs font-semibold text-white opacity-55"
                    >
                      <Link2
                        size={14}
                      />
                      Connect account
                    </button>
                  )}

                  {connection?.status !==
                  'connected' ? (
                    <span className="text-[10px] text-slate-400">
                      {definition.provider ===
                        'google' ||
                      definition.provider ===
                        'meta'
                        ? connection
                          ? 'Reconnect to resume data sync'
                          : 'Connect to start data sync'
                        : definition.provider === 'whatsapp'
                          ? 'Connect this workspace through Meta Embedded Signup'
                          : `${definition.futureAction} setup coming next`}
                    </span>
                  ) : null}
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

      <div className="mt-4 max-w-3xl">
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
                Connection security
              </div>
            </div>
          </div>

          <div className="mt-5 space-y-3">
            <SecurityRow
              ready={
                encryptionConfigured
              }
              title="Credential protection"
              detail={
                encryptionConfigured
                  ? 'Connection credentials are protected with server-side encryption.'
                  : 'Credential encryption must be configured before storing provider access.'
              }
            />

            <SecurityRow
              ready={
                workspace.installed
              }
              title="Private integration data"
              detail="Connection details and provider assets are protected from direct browser access."
            />

            <SecurityRow
              ready
              title="Workspace isolation"
              detail="Integration data is scoped to the active workspace so organizations stay separated."
            />
          </div>
        </section>
      </div>
      <section className="card-pad mt-4 rounded-2xl border border-slate-200 bg-white">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="eyebrow">
              Google
            </div>

            <div className="section-title mt-1">
              What Google connection includes
            </div>

            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-500">
              Connect or reconnect Google to authorize Analytics, Search Console and Google Ads for this workspace. After authorization, choose the properties, sites and ad accounts SalsysOS should use.
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