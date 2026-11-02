import { BadgePercent, FileCheck2, History, ShieldCheck } from 'lucide-react';
import { randomUUID } from 'node:crypto';

import { applyEnrollmentContractAdjustmentAction } from '@/app/actions/enrollments';
import { EmptyState } from '@/components/ui';
import { useMockData } from '@/lib/config';
import { createClient } from '@/lib/supabase/server';
import { getCurrentWorkspaceContext } from '@/lib/workspace';

type EnrollmentRow = {
  id: string;
  total_value: number | string | null;
  currency: string | null;
  status: string;
  created_at: string;
};

type AdjustmentRow = {
  id: string;
  adjustment_type: string;
  previous_total_value: number | string;
  new_total_value: number | string;
  amount_delta: number | string;
  currency: string;
  reason: string;
  actor_user_id: string;
  created_at: string;
};

export async function ContractValueCard({ leadId }: { leadId: string }) {
  const supabase = await createClient();
  const [enrollmentResult, adjustmentsResult] = await Promise.all([
    supabase
      .from('enrollments')
      .select('id, total_value, currency, status, created_at')
      .eq('lead_id', leadId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from('enrollment_contract_adjustments')
      .select(
        'id, adjustment_type, previous_total_value, new_total_value, amount_delta, currency, reason, actor_user_id, created_at',
      )
      .eq('lead_id', leadId)
      .order('created_at', { ascending: false })
      .limit(20),
  ]);

  const enrollment = (enrollmentResult.data ?? null) as EnrollmentRow | null;
  const adjustments = (adjustmentsResult.data ?? []) as AdjustmentRow[];
  const contractUnavailable = Boolean(adjustmentsResult.error);

  let canAdjust = useMockData;
  if (!useMockData) {
    try {
      const workspace = await getCurrentWorkspaceContext();
      const role = workspace.activeWorkspace?.role ?? '';
      canAdjust = role === 'owner' || role === 'admin';
    } catch {
      canAdjust = false;
    }
  }

  const action = applyEnrollmentContractAdjustmentAction.bind(null, leadId);
  const currentValue = numberOrNull(enrollment?.total_value);
  const currency = enrollment?.currency?.toUpperCase() ?? null;
  const baselineReady = currentValue !== null && Boolean(currency);

  return (
    <section id="contract-value" className="card-pad scroll-mt-24">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="eyebrow">Commercial agreement</div>
          <div className="section-title mt-1">Contract value</div>
          <p className="mt-1 max-w-2xl text-xs leading-5 text-copy-muted">
            The agreed enrollment value after confirmation. Scholarships, discounts and approved price changes are audited here and never create or refund cash.
          </p>
        </div>
        <FileCheck2 size={20} className="text-copy-subtle" />
      </div>

      {!enrollment ? (
        <div className="mt-5">
          <EmptyState
            title="No canonical enrollment yet"
            description="Lead potential value remains forecast-only until an enrollment exists. Contract adjustments become available after the canonical enrollment has a baseline value and currency."
            icon={<FileCheck2 size={24} />}
          />
        </div>
      ) : (
        <>
          <div className="mt-5 grid gap-3 sm:grid-cols-3">
            <ContractMetric
              label="Current agreed value"
              value={baselineReady && currency ? money(currentValue, currency) : 'Not set'}
            />
            <ContractMetric label="Currency" value={currency ?? 'Not set'} />
            <ContractMetric label="Enrollment status" value={pretty(enrollment.status)} />
          </div>

          {contractUnavailable ? (
            <div className="mt-5 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs leading-5 text-amber-800">
              Contract adjustment history is not available in this environment yet. No contract value can be changed from this card until the governed financial migration is present.
            </div>
          ) : null}

          <div className="mt-6 border-t border-line pt-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-sm font-semibold text-copy-strong">Adjustment history</div>
                <div className="mt-1 text-xs text-copy-subtle">
                  {adjustments.length} approved adjustment{adjustments.length === 1 ? '' : 's'}
                </div>
              </div>
              <History size={18} className="text-copy-subtle" />
            </div>

            <div className="mt-4 space-y-3">
              {adjustments.length === 0 ? (
                <div className="rounded-xl border border-line bg-surface-soft px-4 py-3 text-xs leading-5 text-copy-muted">
                  No approved contract adjustments have been recorded. The current enrollment value remains the baseline agreement.
                </div>
              ) : null}

              {adjustments.map((adjustment) => {
                const previous = numberOrNull(adjustment.previous_total_value) ?? 0;
                const next = numberOrNull(adjustment.new_total_value) ?? 0;
                const delta = numberOrNull(adjustment.amount_delta) ?? next - previous;
                return (
                  <div
                    key={adjustment.id}
                    className="rounded-xl border border-line p-4"
                  >
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                      <div>
                        <div className="text-sm font-semibold text-copy-strong">
                          {pretty(adjustment.adjustment_type)}
                        </div>
                        <div className="mt-1 text-xs leading-5 text-copy-muted">
                          {adjustment.reason}
                        </div>
                        <div className="mt-1 text-[11px] text-copy-subtle">
                          {dateTime(adjustment.created_at)}
                        </div>
                      </div>
                      <div className="sm:text-right">
                        <div className="text-sm font-semibold text-copy-strong">
                          {money(previous, adjustment.currency)} → {money(next, adjustment.currency)}
                        </div>
                        <div className={`mt-1 text-xs font-semibold ${delta < 0 ? 'text-emerald-700' : 'text-copy-muted'}`}>
                          {delta > 0 ? '+' : ''}{money(delta, adjustment.currency)}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="mt-6 border-t border-line pt-5">
            <div className="flex items-start gap-3 rounded-xl border border-violet-100 bg-violet-50/60 px-4 py-3">
              <ShieldCheck size={18} className="mt-0.5 shrink-0 text-violet-600" />
              <div className="text-xs leading-5 text-violet-900">
                <span className="font-semibold">Human approval boundary.</span>{' '}
                This changes the agreed enrollment value only. It does not edit a payment, issue a refund, or move money. If the new value creates an overpayment, SalsysOS flags it for separate review.
              </div>
            </div>

            {canAdjust && baselineReady && !contractUnavailable ? (
              <form action={action} className="mt-4 space-y-3">
                <input type="hidden" name="enrollment_id" value={enrollment.id} />
                <input
                  type="hidden"
                  name="idempotency_key"
                  value={`contract-adjustment:${leadId}:${randomUUID()}`}
                />

                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="block">
                    <span className="field-label">Adjustment type</span>
                    <select className="input" name="adjustment_type" defaultValue="discount" required>
                      <option value="discount">Discount</option>
                      <option value="scholarship">Scholarship</option>
                      <option value="fee_waiver">Fee waiver</option>
                      <option value="price_change">Approved price change</option>
                      <option value="contract_correction">Contract correction</option>
                      <option value="other">Other</option>
                    </select>
                  </label>

                  <label className="block">
                    <span className="field-label">New agreed total · {currency}</span>
                    <input
                      className="input"
                      name="new_total_value"
                      type="number"
                      min="0"
                      step="0.01"
                      defaultValue={currentValue ?? undefined}
                      required
                    />
                  </label>
                </div>

                <label className="block">
                  <span className="field-label">Approval reason</span>
                  <textarea
                    className="input min-h-24 resize-y"
                    name="reason"
                    maxLength={1000}
                    required
                    placeholder="Why is this agreed value changing?"
                  />
                </label>

                <button className="btn-primary w-full" type="submit">
                  <BadgePercent size={15} />
                  Approve contract adjustment
                </button>
              </form>
            ) : (
              <div className="mt-4 rounded-xl border border-line bg-surface-soft px-4 py-3 text-xs leading-5 text-copy-muted">
                {!baselineReady
                  ? 'Set the canonical enrollment value and currency first.'
                  : canAdjust
                    ? 'Contract adjustment controls are unavailable until the governed migration is present.'
                    : 'Only organization owners or admins can approve a contract value adjustment.'}
              </div>
            )}
          </div>
        </>
      )}
    </section>
  );
}

function ContractMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-surface-soft p-4">
      <div className="text-xs font-semibold text-copy-subtle">{label}</div>
      <div className="mt-2 text-sm font-semibold text-copy-strong">{value}</div>
    </div>
  );
}

function numberOrNull(value: number | string | null | undefined) {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function money(value: number, currency: string) {
  try {
    return new Intl.NumberFormat(currency === 'INR' ? 'en-IN' : 'en-US', {
      style: 'currency',
      currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(value);
  } catch {
    return `${currency} ${value.toFixed(2)}`;
  }
}

function pretty(value: string) {
  return value
    .replaceAll('_', ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function dateTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(date);
}
