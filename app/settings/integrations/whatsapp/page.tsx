import Link from 'next/link';
import { redirect } from 'next/navigation';
import {
  ArrowLeft,
  BadgeCheck,
  MessageCircle,
  ShieldCheck,
  Smartphone,
} from 'lucide-react';

import { WhatsAppEmbeddedSignupButton } from '@/components/whatsapp-embedded-signup-button';
import { WhatsAppRemoveButton } from '@/components/whatsapp-remove-button';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';
import { getWorkspaceContextForUser } from '@/lib/workspace';

type ConnectionRow = {
  id: string;
  status: string;
  external_account_id: string | null;
  account_name: string | null;
  last_verified_at: string | null;
  provider_metadata: Record<string, unknown> | null;
};

type AccountRow = {
  id: string;
  connection_id: string | null;
  phone_number_id: string;
  display_phone_number: string | null;
  active: boolean;
  is_default: boolean;
};

function textMetadata(
  metadata: Record<string, unknown> | null,
  key: string,
) {
  const value = metadata?.[key];
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function boolMetadata(
  metadata: Record<string, unknown> | null,
  key: string,
) {
  return metadata?.[key] === true;
}

function formatDate(value: string | null) {
  if (!value) return 'Not verified yet';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Not verified yet';
  return new Intl.DateTimeFormat('en-IN', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
}

export default async function WhatsAppIntegrationPage() {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) redirect('/login');

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('id, active')
    .eq('id', user.id)
    .maybeSingle();

  if (profileError || !profile || profile.active !== true) {
    redirect('/dashboard');
  }

  const workspaceContext = await getWorkspaceContextForUser(supabase, user.id);
  const activeWorkspace = workspaceContext.activeWorkspace;

  if (
    !activeWorkspace ||
    !['owner', 'admin'].includes(activeWorkspace.role)
  ) {
    redirect('/dashboard');
  }

  const organizationId = activeWorkspace.organizationId;
  const admin = createAdminClient();

  const [connectionsResult, accountsResult] = await Promise.all([
    admin
      .from('integration_connections')
      .select(
        'id,status,external_account_id,account_name,last_verified_at,provider_metadata,updated_at',
      )
      .eq('organization_id', organizationId)
      .eq('provider', 'whatsapp')
      .order('updated_at', { ascending: false }),
    admin
      .from('whatsapp_accounts')
      .select(
        'id,connection_id,phone_number_id,display_phone_number,active,is_default',
      )
      .eq('organization_id', organizationId)
      .order('is_default', { ascending: false }),
  ]);

  const connections = (connectionsResult.data ?? []) as unknown as ConnectionRow[];
  const accounts = (accountsResult.data ?? []) as unknown as AccountRow[];
  const connected =
    connections.find((connection) => connection.status === 'connected') ?? null;
  const activeAccount = connected
    ? accounts.find(
        (account) =>
          account.connection_id === connected.id &&
          account.active &&
          account.is_default,
      ) ??
      accounts.find(
        (account) => account.connection_id === connected.id && account.active,
      ) ??
      null
    : null;

  const appId = process.env.META_APP_ID?.trim() ?? '';
  const configId = process.env.WHATSAPP_EMBEDDED_SIGNUP_CONFIG_ID?.trim() ?? '';
  const graphVersion = /^v\d+\.\d+$/.test(
    process.env.META_API_VERSION?.trim() ?? '',
  )
    ? process.env.META_API_VERSION!.trim()
    : 'v26.0';

  const metadata = connected?.provider_metadata ?? null;
  const coexistence =
    boolMetadata(metadata, 'is_on_biz_app') ||
    textMetadata(metadata, 'onboarding_mode') === 'coexistence';

  return (
    <div className="mx-auto max-w-5xl px-4 py-6 sm:px-6 lg:px-8">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#71847A]">
            Settings · Integrations
          </div>
          <h1 className="mt-2 text-2xl font-semibold text-[#18362D]">
            WhatsApp Business
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-[#596E64]">
            Connect one active WhatsApp sender to this workspace. An eligible
            WhatsApp Business app number can stay active on the phone and in
            SalsysOS through Meta Coexistence.
          </p>
        </div>

        <Link
          href="/settings/integrations"
          className="inline-flex items-center gap-2 rounded-lg border border-[#DCE4DF] bg-white px-3 py-2 text-xs font-semibold text-[#596E64] transition hover:bg-[#EDF3E6] hover:text-[#216551]"
        >
          <ArrowLeft size={14} /> All integrations
        </Link>
      </div>

      {connectionsResult.error || accountsResult.error ? (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          Unable to load the current WhatsApp connection.
        </div>
      ) : connected ? (
        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
          <section className="rounded-2xl border border-[#DCE4DF] bg-white p-5 shadow-sm">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="flex items-start gap-3">
                <span className="grid h-11 w-11 place-items-center rounded-xl bg-[#EDF3E6] text-[#216551]">
                  <MessageCircle size={20} />
                </span>
                <div>
                  <div className="text-base font-semibold text-[#18362D]">
                    {activeAccount?.display_phone_number ||
                      connected.account_name ||
                      'WhatsApp Business'}
                  </div>
                  <div className="mt-1 text-xs text-[#596E64]">
                    {coexistence
                      ? 'WhatsApp Business app + Cloud API coexistence'
                      : 'WhatsApp Cloud API connection'}
                  </div>
                </div>
              </div>

              <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[10px] font-semibold text-emerald-700">
                <BadgeCheck size={12} /> Connected
              </span>
            </div>

            <dl className="mt-5 grid gap-3 rounded-xl border border-[#E4EAE6] bg-[#F8FAF8] p-4 text-xs sm:grid-cols-2">
              <div>
                <dt className="text-[#71847A]">Phone number</dt>
                <dd className="mt-1 font-semibold text-[#18362D]">
                  {activeAccount?.display_phone_number || 'Available through Meta'}
                </dd>
              </div>
              <div>
                <dt className="text-[#71847A]">Phone Number ID</dt>
                <dd className="mt-1 break-all font-semibold text-[#18362D]">
                  {activeAccount?.phone_number_id || '—'}
                </dd>
              </div>
              <div>
                <dt className="text-[#71847A]">WhatsApp Business Account</dt>
                <dd className="mt-1 break-all font-semibold text-[#18362D]">
                  {connected.external_account_id || '—'}
                </dd>
              </div>
              <div>
                <dt className="text-[#71847A]">Last verified</dt>
                <dd className="mt-1 font-semibold text-[#18362D]">
                  {formatDate(connected.last_verified_at)}
                </dd>
              </div>
            </dl>

            <div className="mt-5 border-t border-[#E4EAE6] pt-5">
              <div className="text-sm font-semibold text-[#18362D]">
                Replace this number
              </div>
              <p className="mt-1 max-w-2xl text-xs leading-5 text-[#596E64]">
                Remove this sender from SalsysOS first. Historical leads,
                conversations and message evidence remain in the CRM. SalsysOS
                does not deregister or delete the WhatsApp Business app account.
              </p>
              <div className="mt-3">
                <WhatsAppRemoveButton
                  connectionId={connected.id}
                  displayPhoneNumber={activeAccount?.display_phone_number}
                />
              </div>
            </div>
          </section>

          <aside className="rounded-2xl border border-[#DCE4DF] bg-[#F8FAF8] p-5">
            <div className="flex items-center gap-2 text-sm font-semibold text-[#18362D]">
              <ShieldCheck size={16} className="text-[#216551]" /> Safe removal
            </div>
            <p className="mt-2 text-xs leading-5 text-[#596E64]">
              Removing disconnects SalsysOS from the sender, disables its CRM
              phone mapping and clears the stored authorization. It does not
              delete historical CRM records.
            </p>
            {coexistence ? (
              <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] leading-5 text-amber-800">
                For a full Coexistence offboarding from Meta, also use WhatsApp
                Business app → Settings → Account → Business Platform →
                Disconnect Account when required.
              </p>
            ) : null}
          </aside>
        </div>
      ) : (
        <div className="grid gap-5 lg:grid-cols-2">
          <section className="rounded-2xl border border-[#BFD6C6] bg-white p-5 shadow-sm">
            <div className="flex items-start gap-3">
              <span className="grid h-11 w-11 place-items-center rounded-xl bg-[#EDF3E6] text-[#216551]">
                <Smartphone size={20} />
              </span>
              <div>
                <div className="text-base font-semibold text-[#18362D]">
                  Keep using your WhatsApp Business app
                </div>
                <p className="mt-1 text-xs leading-5 text-[#596E64]">
                  Recommended for an eligible number already active in the
                  WhatsApp Business mobile app. The same number remains usable
                  on the phone while SalsysOS connects through Cloud API.
                </p>
              </div>
            </div>

            <div className="mt-5">
              <WhatsAppEmbeddedSignupButton
                appId={appId}
                configId={configId}
                graphVersion={graphVersion}
                onboardingMode="coexistence"
              />
            </div>
          </section>

          <section className="rounded-2xl border border-[#DCE4DF] bg-white p-5 shadow-sm">
            <div className="text-base font-semibold text-[#18362D]">
              Connect a Cloud API number
            </div>
            <p className="mt-1 text-xs leading-5 text-[#596E64]">
              Use this for a number intended for the WhatsApp Business Platform
              rather than an existing WhatsApp Business app coexistence setup.
            </p>
            <div className="mt-5">
              <WhatsAppEmbeddedSignupButton
                appId={appId}
                configId={configId}
                graphVersion={graphVersion}
                onboardingMode="cloud_api"
              />
            </div>
          </section>
        </div>
      )}

      <div className="mt-5 rounded-xl border border-[#DCE4DF] bg-[#F8FAF8] px-4 py-3 text-[11px] leading-5 text-[#596E64]">
        SalsysOS intentionally keeps one active/default WhatsApp sender per
        workspace today. Removing a sender frees the workspace to connect a
        different number without deleting historical CRM data.
      </div>
    </div>
  );
}
