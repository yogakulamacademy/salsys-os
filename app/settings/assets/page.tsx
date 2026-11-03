import {
  Ban,
  Bot,
  CheckCircle2,
  FileImage,
  LockKeyhole,
  ShieldCheck,
  Upload,
} from 'lucide-react';

import {
  approveSalesAssetAction,
  createSalesAssetAction,
  revokeSalesAssetAction,
} from '@/app/settings/assets/actions';
import { PageHeader } from '@/components/ui';
import { getSupabasePublicConfig, useMockData } from '@/lib/config';
import { createClient } from '@/lib/supabase/server';
import { getCurrentWorkspaceContext } from '@/lib/workspace';

type SalesAsset = {
  id: string;
  title: string;
  description: string | null;
  asset_kind: 'image' | 'video' | 'pdf' | 'audio' | 'document' | 'other';
  storage_bucket: string;
  storage_path: string;
  mime_type: string;
  size_bytes: number;
  version: number;
  state: 'draft' | 'approved' | 'revoked' | 'archived';
  course_scope: string[];
  location_scope: string[];
  language_scope: string[];
  channel_scope: string[];
  rights_status: 'pending' | 'cleared' | 'restricted' | 'expired';
  rights_owner: string | null;
  rights_reference: string | null;
  rights_valid_until: string | null;
  valid_from: string | null;
  valid_until: string | null;
  auto_send_allowed: boolean;
  accessibility_alt_text: string | null;
  accessibility_caption: string | null;
  approved_at: string | null;
  revoked_at: string | null;
  revoked_reason: string | null;
  created_at: string;
  updated_at: string;
};

const channels = [
  ['whatsapp', 'WhatsApp'],
  ['instagram', 'Instagram'],
  ['email', 'Email'],
  ['webchat', 'Web chat'],
  ['sms', 'SMS'],
  ['other', 'Other'],
] as const;

function pretty(value: string) {
  return value.replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function statusClass(state: SalesAsset['state']) {
  if (state === 'approved') return 'bg-emerald-50 text-emerald-700 ring-emerald-200';
  if (state === 'revoked') return 'bg-rose-50 text-rose-700 ring-rose-200';
  if (state === 'draft') return 'bg-amber-50 text-amber-700 ring-amber-200';
  return 'bg-slate-100 text-slate-600 ring-slate-200';
}

function scopeLabel(scope: string[]) {
  return scope.length ? scope.join(', ') : 'Any';
}

function bytesLabel(bytes: number) {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  if (bytes >= 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${bytes} B`;
}

function timeLabel(value: string | null) {
  if (!value) return 'No expiry';
  return `${new Date(value).toLocaleString('en-IN', { timeZone: 'UTC' })} UTC`;
}

export default async function SalesAssetsSettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ notice?: string; error?: string }>;
}) {
  const query = await searchParams;
  const { configured } = getSupabasePublicConfig();
  const live = !useMockData && configured;

  let assets: SalesAsset[] = [];
  let canManage = false;
  let organizationName = 'Current organization';
  let loadError: string | null = null;
  let partial = false;

  if (!live) {
    loadError = useMockData
      ? 'Demo mode: live sales assets have not been loaded.'
      : 'Configure a live workspace before loading sales assets.';
  }

  if (live) {
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (!user) {
      loadError = authError
        ? 'Unable to verify your session. Sign in again.'
        : 'Sign in before loading sales assets.';
    } else {
      try {
        const workspace = await getCurrentWorkspaceContext(supabase);
        const organizationId = workspace.activeOrganizationId;
        organizationName = workspace.activeWorkspace?.organizationName || organizationName;

        if (!organizationId) {
          loadError = 'Select an active workspace before loading sales assets.';
        } else {
          const [{ data: manageData }, { data: rows, error }] = await Promise.all([
            supabase.rpc('can_manage_organization', { p_organization_id: organizationId }),
            supabase
              .from('sales_assets')
              .select(
                'id,title,description,asset_kind,storage_bucket,storage_path,mime_type,size_bytes,version,state,course_scope,location_scope,language_scope,channel_scope,rights_status,rights_owner,rights_reference,rights_valid_until,valid_from,valid_until,auto_send_allowed,accessibility_alt_text,accessibility_caption,approved_at,revoked_at,revoked_reason,created_at,updated_at',
              )
              .eq('organization_id', organizationId)
              .order('updated_at', { ascending: false })
              .limit(201),
          ]);

          canManage = manageData === true;
          if (error) {
            loadError = error.message || 'Unable to load sales assets.';
          } else {
            partial = (rows ?? []).length > 200;
            assets = (rows ?? []).slice(0, 200) as SalesAsset[];
          }
        }
      } catch (error) {
        loadError = error instanceof Error ? error.message : 'Unable to load sales assets.';
      }
    }
  }

  const approved = assets.filter((asset) => asset.state === 'approved').length;
  const autoSend = assets.filter(
    (asset) => asset.state === 'approved' && asset.auto_send_allowed,
  ).length;
  const drafts = assets.filter((asset) => asset.state === 'draft').length;
  const revoked = assets.filter((asset) => asset.state === 'revoked').length;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="AI Intelligence"
        title="Sales Asset Library"
        description={`Private, governed media for ${organizationName}. Approval, rights, validity and delivery scope are checked separately; queued automatic sends must revalidate the asset at dispatch time.`}
      />

      {query.notice ? (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-800">
          {query.notice}
        </div>
      ) : null}

      {query.error || loadError ? (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-800">
          {query.error || loadError}
        </div>
      ) : null}

      <section className="rounded-xl border border-line bg-surface px-4 py-4">
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Summary label="Approved" value={approved} note="Human-approved assets" />
          <Summary label="Auto-send eligible" value={autoSend} note="Still revalidated at dispatch" />
          <Summary label="Drafts" value={drafts} note="Not eligible for delivery" />
          <Summary label="Revoked" value={revoked} note="Fail closed immediately" />
        </div>
        <div className="mt-4 flex items-start gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-xs leading-5 text-slate-600">
          <LockKeyhole size={15} className="mt-0.5 shrink-0 text-slate-700" />
          <span>
            Files live in a private tenant-scoped bucket. SalsysOS stores a bucket/path reference, not a public or arbitrary external URL. This foundation does not send media to any provider.
          </span>
        </div>
      </section>

      {partial ? (
        <p className="text-sm text-copy-muted">Showing the 200 most recently updated assets.</p>
      ) : null}

      <div className="grid gap-6 xl:grid-cols-[minmax(0,0.95fr)_minmax(0,1.55fr)]">
        <section className="card-pad" id="asset-upload">
          <div className="flex items-start gap-3">
            <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-brand-50 text-brand-700">
              <Upload size={18} />
            </div>
            <div>
              <h2 className="text-base font-bold text-copy-strong">Upload a governed asset</h2>
              <p className="mt-1 text-sm leading-6 text-copy-muted">
                Upload privately, record rights and scope, then approve separately. Maximum file size: 50 MB.
              </p>
            </div>
          </div>

          {canManage ? (
            <form action={createSalesAssetAction} className="mt-5 space-y-4">
              <label className="block">
                <span className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-copy-muted">Title</span>
                <input name="title" required maxLength={180} className="w-full rounded-xl border border-line bg-surface px-3 py-2.5 text-sm text-copy-strong outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100" placeholder="Example: Mysore campus twin room" />
              </label>

              <label className="block">
                <span className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-copy-muted">Private file</span>
                <input name="asset_file" type="file" required accept="image/jpeg,image/png,image/webp,application/pdf,video/mp4,video/quicktime,audio/mpeg,audio/mp4,audio/wav" className="block w-full rounded-xl border border-line bg-surface px-3 py-2.5 text-sm text-copy" />
                <span className="mt-1 block text-xs leading-5 text-copy-muted">JPG, PNG, WebP, PDF, MP4, MOV, MP3, M4A or WAV.</span>
              </label>

              <label className="block">
                <span className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-copy-muted">Description <span className="font-medium normal-case tracking-normal">(optional)</span></span>
                <textarea name="description" rows={3} maxLength={1000} className="w-full resize-y rounded-xl border border-line bg-surface px-3 py-2.5 text-sm text-copy-strong outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100" />
              </label>

              <div className="grid gap-4 sm:grid-cols-2">
                <label className="block">
                  <span className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-copy-muted">Rights owner</span>
                  <input name="rights_owner" required maxLength={240} placeholder="Organization / photographer" className="w-full rounded-xl border border-line bg-surface px-3 py-2.5 text-sm text-copy-strong outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100" />
                </label>
                <label className="block">
                  <span className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-copy-muted">Clearance reference</span>
                  <input name="rights_reference" required maxLength={500} placeholder="Owned media / consent / license ref" className="w-full rounded-xl border border-line bg-surface px-3 py-2.5 text-sm text-copy-strong outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100" />
                </label>
              </div>

              <label className="block">
                <span className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-copy-muted">Rights valid until <span className="font-medium normal-case tracking-normal">(UTC, optional)</span></span>
                <input name="rights_valid_until" type="datetime-local" step="60" className="w-full rounded-xl border border-line bg-surface px-3 py-2.5 text-sm text-copy-strong outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100" />
              </label>

              <div className="grid gap-4 sm:grid-cols-2">
                <label className="block">
                  <span className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-copy-muted">Valid from <span className="font-medium normal-case tracking-normal">(UTC, optional)</span></span>
                  <input name="valid_from" type="datetime-local" step="60" className="w-full rounded-xl border border-line bg-surface px-3 py-2.5 text-sm text-copy-strong outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100" />
                </label>
                <label className="block">
                  <span className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-copy-muted">Valid until <span className="font-medium normal-case tracking-normal">(UTC, optional)</span></span>
                  <input name="valid_until" type="datetime-local" step="60" className="w-full rounded-xl border border-line bg-surface px-3 py-2.5 text-sm text-copy-strong outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100" />
                </label>
              </div>

              <div className="grid gap-4 sm:grid-cols-3">
                <ScopeInput name="course_scope" label="Course scope" placeholder="200h, prenatal" />
                <ScopeInput name="location_scope" label="Location scope" placeholder="mysore, online" />
                <ScopeInput name="language_scope" label="Language scope" placeholder="en, de" />
              </div>
              <p className="-mt-2 text-xs text-copy-muted">Comma-separated. Leave blank to allow any value for that dimension.</p>

              <fieldset>
                <legend className="mb-2 text-xs font-bold uppercase tracking-wide text-copy-muted">Supported channels</legend>
                <div className="grid gap-2 sm:grid-cols-2">
                  {channels.map(([value, label]) => (
                    <label key={value} className="flex items-center gap-2 rounded-xl border border-line bg-surface-soft px-3 py-2 text-sm text-copy">
                      <input type="checkbox" name="channel_scope" value={value} className="h-4 w-4 rounded border-slate-300" />
                      {label}
                    </label>
                  ))}
                </div>
                <p className="mt-1 text-xs text-copy-muted">At least one channel is required before auto-send can be approved.</p>
              </fieldset>

              <label className="block">
                <span className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-copy-muted">Image alt text <span className="font-medium normal-case tracking-normal">(required for images)</span></span>
                <input name="accessibility_alt_text" maxLength={500} placeholder="Describe the image for accessibility" className="w-full rounded-xl border border-line bg-surface px-3 py-2.5 text-sm text-copy-strong outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100" />
              </label>

              <label className="block">
                <span className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-copy-muted">Accessibility caption <span className="font-medium normal-case tracking-normal">(optional)</span></span>
                <textarea name="accessibility_caption" rows={2} maxLength={1000} className="w-full resize-y rounded-xl border border-line bg-surface px-3 py-2.5 text-sm text-copy-strong outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100" />
              </label>

              <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-3 text-xs leading-5 text-amber-800">
                Uploading creates a <strong>draft</strong>. It cannot be dispatched until an admin separately approves it. Auto-send is a second explicit permission.
              </div>

              <button type="submit" className="btn-primary w-full justify-center sm:w-auto">
                <Upload size={15} /> Upload private draft
              </button>
            </form>
          ) : (
            <p className="mt-5 rounded-xl border border-line bg-surface-soft px-4 py-3 text-sm text-copy-muted">
              Owner/Admin access is required to manage sales assets.
            </p>
          )}
        </section>

        <section className="card-pad">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="text-base font-bold text-copy-strong">Governed library</h2>
              <p className="mt-1 text-sm leading-6 text-copy-muted">
                Approval is not enough for automation: auto-send permission and dispatch-time scope checks must also pass.
              </p>
            </div>
            <FileImage size={20} className="shrink-0 text-copy-muted" />
          </div>

          {!loadError && assets.length === 0 ? (
            <div className="mt-5 rounded-2xl border border-dashed border-line bg-surface-soft px-5 py-8 text-center">
              <div className="mx-auto grid h-10 w-10 place-items-center rounded-xl bg-surface text-copy-muted shadow-sm"><FileImage size={18} /></div>
              <p className="mt-3 text-sm font-semibold text-copy-strong">No governed sales assets yet</p>
              <p className="mt-1 text-xs leading-5 text-copy-muted">Upload the first private draft, record its rights and scope, then approve it deliberately.</p>
            </div>
          ) : null}

          <div className="mt-5 space-y-4">
            {assets.map((asset) => (
              <article key={asset.id} className="rounded-2xl border border-line bg-surface p-4 shadow-sm">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="font-semibold text-copy-strong">{asset.title}</h3>
                      <span className={`rounded-full px-2 py-1 text-[10px] font-bold uppercase tracking-wide ring-1 ${statusClass(asset.state)}`}>
                        {asset.state}
                      </span>
                      {asset.auto_send_allowed ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-violet-50 px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-violet-700 ring-1 ring-violet-200">
                          <Bot size={11} /> Auto-send allowed
                        </span>
                      ) : null}
                    </div>
                    <p className="mt-1 text-xs text-copy-muted">
                      {pretty(asset.asset_kind)} · {asset.mime_type} · {bytesLabel(asset.size_bytes)} · v{asset.version}
                    </p>
                  </div>
                  <div className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700">
                    <ShieldCheck size={14} /> Rights {asset.rights_status}
                  </div>
                </div>

                {asset.description ? <p className="mt-3 text-sm leading-6 text-copy">{asset.description}</p> : null}

                <dl className="mt-4 grid gap-3 text-xs sm:grid-cols-2 xl:grid-cols-3">
                  <Meta label="Channels" value={scopeLabel(asset.channel_scope)} />
                  <Meta label="Courses" value={scopeLabel(asset.course_scope)} />
                  <Meta label="Locations" value={scopeLabel(asset.location_scope)} />
                  <Meta label="Languages" value={scopeLabel(asset.language_scope)} />
                  <Meta label="Asset validity" value={timeLabel(asset.valid_until)} />
                  <Meta label="Rights validity" value={timeLabel(asset.rights_valid_until)} />
                </dl>

                <div className="mt-3 rounded-xl border border-line bg-surface-soft px-3 py-2 text-xs text-copy-muted">
                  <strong className="text-copy">Private reference:</strong> {asset.storage_bucket}/{asset.storage_path}
                </div>

                {asset.accessibility_alt_text ? (
                  <p className="mt-2 text-xs leading-5 text-copy-muted"><strong className="text-copy">Alt:</strong> {asset.accessibility_alt_text}</p>
                ) : null}

                {asset.revoked_reason ? (
                  <div className="mt-3 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs leading-5 text-rose-800">
                    <strong>Revoked:</strong> {asset.revoked_reason}
                  </div>
                ) : null}

                {canManage && asset.state === 'draft' ? (
                  <div className="mt-4 flex flex-wrap gap-2 border-t border-line pt-4">
                    <form action={approveSalesAssetAction}>
                      <input type="hidden" name="asset_id" value={asset.id} />
                      <input type="hidden" name="auto_send_allowed" value="false" />
                      <button type="submit" className="btn-secondary">
                        <CheckCircle2 size={14} /> Approve manual use
                      </button>
                    </form>
                    <form action={approveSalesAssetAction}>
                      <input type="hidden" name="asset_id" value={asset.id} />
                      <input type="hidden" name="auto_send_allowed" value="true" />
                      <button type="submit" className="btn-primary" disabled={asset.channel_scope.length === 0} title={asset.channel_scope.length === 0 ? 'Add a supported channel before auto-send approval.' : undefined}>
                        <Bot size={14} /> Approve + auto-send
                      </button>
                    </form>
                  </div>
                ) : null}

                {canManage && asset.state !== 'revoked' && asset.state !== 'archived' ? (
                  <form action={revokeSalesAssetAction} className="mt-4 flex flex-col gap-2 border-t border-line pt-4 sm:flex-row">
                    <input type="hidden" name="asset_id" value={asset.id} />
                    <input name="reason" required maxLength={500} placeholder="Reason for revocation" className="min-w-0 flex-1 rounded-xl border border-line bg-surface px-3 py-2 text-sm text-copy-strong outline-none focus:border-rose-300 focus:ring-2 focus:ring-rose-100" />
                    <button type="submit" className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-700 transition hover:bg-rose-100">
                      <Ban size={14} /> Revoke
                    </button>
                  </form>
                ) : null}
              </article>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}

function Summary({ label, value, note }: { label: string; value: number; note: string }) {
  return (
    <div className="rounded-xl border border-line bg-surface-soft px-3 py-3">
      <div className="text-2xl font-bold text-copy-strong">{value}</div>
      <div className="mt-1 text-xs font-semibold text-copy">{label}</div>
      <div className="mt-0.5 text-[11px] text-copy-muted">{note}</div>
    </div>
  );
}

function ScopeInput({ name, label, placeholder }: { name: string; label: string; placeholder: string }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-copy-muted">{label}</span>
      <input name={name} placeholder={placeholder} className="w-full rounded-xl border border-line bg-surface px-3 py-2.5 text-sm text-copy-strong outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100" />
    </label>
  );
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="font-semibold uppercase tracking-wide text-copy-muted">{label}</dt>
      <dd className="mt-1 break-words text-copy">{value}</dd>
    </div>
  );
}
