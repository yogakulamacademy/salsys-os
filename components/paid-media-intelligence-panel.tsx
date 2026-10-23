import { AlertTriangle, CheckCircle2, Megaphone, ShieldCheck } from "lucide-react";

import type {
  GoogleAdsBusinessData,
  MetaAdsBusinessData,
} from "@/lib/funnel-data";

type UnknownRecord = Record<string, unknown>;

type ProviderSummary = {
  provider: string;
  currency: string;
  spend: number;
  leads: number;
  qualified: number;
  enrolled: number;
  revenueInr: number;
  revenueUsd: number;
  cpl: number | null;
  cac: number | null;
  roas: number | null;
  coverage: number | null;
  coverageLabel: string;
  issues: string[];
};

export function PaidMediaIntelligencePanel({
  google,
  meta,
}: {
  google: GoogleAdsBusinessData;
  meta: MetaAdsBusinessData;
}) {
  const providers = [summarizeGoogle(google), summarizeMeta(meta)].filter(
    (provider) =>
      provider.spend > 0 ||
      provider.leads > 0 ||
      provider.revenueInr !== 0 ||
      provider.revenueUsd !== 0,
  );

  if (providers.length === 0) {
    return (
      <section className="ui-panel mt-4 p-5">
        <div className="flex items-start gap-3.5">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[var(--app-brand-50)] text-[var(--app-brand-700)]">
            <Megaphone size={18} />
          </span>
          <div>
            <div className="ui-page-kicker">Paid media intelligence</div>
            <div className="mt-1 text-[16px] font-semibold text-[var(--app-text-strong)]">
              No connected paid-media evidence
            </div>
            <p className="mt-2 text-[14px] leading-6 text-[var(--app-text-muted)]">
              Google Ads and Meta Ads stay outside commercial recommendations until connected provider data is available. SalsysOS does not invent spend, CPL, CAC or ROAS when evidence is missing.
            </p>
          </div>
        </div>
      </section>
    );
  }

  const issueCount = providers.reduce(
    (sum, provider) => sum + provider.issues.length,
    0,
  );

  return (
    <section className="ui-panel mt-4 p-5">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div className="ui-page-kicker">Paid media intelligence</div>
          <div className="mt-1 text-[16px] font-semibold text-[var(--app-text-strong)]">
            Spend → CRM → Revenue quality
          </div>
          <p className="mt-2 max-w-3xl text-[14px] leading-6 text-[var(--app-text-muted)]">
            Provider spend is evaluated against CRM leads, qualification,
            enrollment and recorded revenue. Attribution coverage stays visible
            beside efficiency so incomplete lineage is not mistaken for poor performance.
          </p>
        </div>

        <div
          className={`rounded-full px-3 py-1.5 text-[12px] font-semibold ${
            issueCount === 0
              ? "bg-emerald-50 text-emerald-700"
              : "bg-amber-50 text-amber-700"
          }`}
        >
          {issueCount === 0
            ? "No diagnostic warnings"
            : `${issueCount} diagnostic ${issueCount === 1 ? "warning" : "warnings"}`}
        </div>
      </div>

      <div className="mt-5 grid gap-4 xl:grid-cols-2">
        {providers.map((provider) => (
          <article
            key={provider.provider}
            className="rounded-2xl border border-[var(--app-border)] bg-[var(--app-surface-soft)] p-4"
          >
            <div className="flex items-center justify-between gap-3">
              <div className="text-[14px] font-semibold text-[var(--app-text-strong)]">
                {provider.provider}
              </div>
              <span className="text-[12px] font-semibold text-[var(--app-text-subtle)]">
                {provider.currency}
              </span>
            </div>

            <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Metric label="Spend" value={formatMoney(provider.spend, provider.currency)} />
              <Metric label="CRM leads" value={formatInteger(provider.leads)} />
              <Metric label="Qualified" value={formatInteger(provider.qualified)} />
              <Metric label="Enrolled" value={formatInteger(provider.enrolled)} />
              <Metric
                label="CPL"
                value={
                  provider.cpl == null
                    ? "—"
                    : formatMoney(provider.cpl, provider.currency)
                }
              />
              <Metric
                label="CAC"
                value={
                  provider.cac == null
                    ? "—"
                    : formatMoney(provider.cac, provider.currency)
                }
              />
              <Metric
                label="ROAS"
                value={provider.roas == null ? "—" : `${provider.roas.toFixed(2)}×`}
              />
              <Metric
                label="Attribution coverage"
                value={
                  provider.coverage == null
                    ? "—"
                    : `${Math.round(provider.coverage * 100)}%`
                }
              />
            </div>

            <div className="mt-4 rounded-xl border border-[var(--app-border)] bg-[var(--app-surface)] p-3">
              <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--app-text-subtle)]">
                Recorded CRM revenue
              </div>
              <div className="mt-1 text-[14px] font-semibold text-[var(--app-text-strong)]">
                {formatRevenue(provider.revenueInr, provider.revenueUsd)}
              </div>
              <div className="mt-1 text-[12px] leading-5 text-[var(--app-text-muted)]">
                {provider.coverageLabel}
              </div>
            </div>

            {provider.issues.length > 0 ? (
              <div className="mt-4 space-y-2">
                {provider.issues.map((issue) => (
                  <div
                    key={issue}
                    className="flex items-start gap-2 rounded-lg bg-amber-50 px-3 py-2 text-[12px] leading-5 text-amber-800"
                  >
                    <AlertTriangle size={14} className="mt-0.5 shrink-0" />
                    {issue}
                  </div>
                ))}
              </div>
            ) : (
              <div className="mt-4 flex items-start gap-2 rounded-lg bg-emerald-50 px-3 py-2 text-[12px] leading-5 text-emerald-800">
                <CheckCircle2 size={14} className="mt-0.5 shrink-0" />
                Current provider evidence has no basic spend/outcome/coverage warning.
              </div>
            )}
          </article>
        ))}
      </div>

      <div className="mt-4 flex items-start gap-2 border-t border-[var(--app-border)] pt-3 text-[12px] leading-5 text-[var(--app-text-subtle)]">
        <ShieldCheck size={14} className="mt-0.5 shrink-0" />
        <span>
          SalsysOS does not automatically move advertising budget from these
          diagnostics. Spend changes should use verified attribution coverage,
          sample size, lead quality, refunds and real revenue together.
        </span>
      </div>
    </section>
  );
}

function summarizeGoogle(data: GoogleAdsBusinessData): ProviderSummary {
  const overview = asRecord(data.overview);
  const coverage = asRecord(data.coverage);
  const campaigns = data.campaigns.map(asRecord);
  const currency = textValue(campaigns[0]?.currency_code) || "INR";
  const paidLeads = numberValue(coverage.google_paid_leads);
  const matchedLeads = numberValue(coverage.leads_matching_ads_campaign);
  const coverageRate = paidLeads > 0 ? ratio(matchedLeads, paidLeads) : null;
  const spend = numberValue(overview.spend);
  const leads = numberValue(overview.crm_leads);
  const enrolled = numberValue(overview.enrolled_leads);
  const issues: string[] = [];

  if (spend > 0 && leads === 0) {
    issues.push(
      "Spend is recorded but no CRM leads are attributed. Check campaign-ID/click-ID capture before treating this as zero performance.",
    );
  }
  if (leads > 0 && enrolled === 0) {
    issues.push(
      "Attributed CRM leads exist but no enrollments are recorded in this provider view. Review lead quality and downstream sales outcomes.",
    );
  }
  if (coverageRate != null && coverageRate < 0.8) {
    issues.push(
      `Only ${Math.round(coverageRate * 100)}% of Google-paid CRM leads match a synced Ads campaign. Repair lineage before strong ROI conclusions.`,
    );
  }
  if (data.unmatchedCount > 0) {
    issues.push(
      `${data.unmatchedCount} captured Google campaign ${data.unmatchedCount === 1 ? "ID is" : "IDs are"} currently unmatched to synced Ads data.`,
    );
  }

  return {
    provider: "Google Ads",
    currency,
    spend,
    leads,
    qualified: numberValue(overview.qualified_leads),
    enrolled,
    revenueInr: numberValue(overview.crm_revenue_inr),
    revenueUsd: numberValue(overview.crm_revenue_usd),
    cpl: nullableNumber(overview.cpl),
    cac: nullableNumber(overview.cac),
    roas: nullableNumber(overview.roas_inr),
    coverage: coverageRate,
    coverageLabel:
      coverageRate == null
        ? "Campaign match coverage has no paid-lead denominator yet."
        : `${Math.round(coverageRate * 100)}% of Google-paid CRM leads match synced campaign IDs.`,
    issues,
  };
}

function summarizeMeta(data: MetaAdsBusinessData): ProviderSummary {
  const overview = asRecord(data.overview);
  const coverage = asRecord(data.coverage);
  const campaigns = data.campaigns.map(asRecord);
  const currency =
    textValue(overview.currency_code) ||
    textValue(campaigns[0]?.currency_code) ||
    "INR";
  const paidLeads = numberValue(coverage.meta_paid_leads);
  const campaignIdLeads = numberValue(coverage.leads_with_campaign_id);
  const coverageRate = paidLeads > 0 ? ratio(campaignIdLeads, paidLeads) : null;
  const captured = numberValue(coverage.captured_campaign_ids);
  const matched = numberValue(coverage.matched_campaign_ids);
  const matchRate = captured > 0 ? ratio(matched, captured) : null;
  const spend = numberValue(overview.spend);
  const leads = numberValue(overview.crm_leads);
  const enrolled = numberValue(overview.enrolled_leads);
  const issues: string[] = [];

  if (spend > 0 && leads === 0) {
    issues.push(
      "Spend is recorded but no CRM leads are attributed. Check Meta campaign/ad-set/ad ID capture before treating this as zero performance.",
    );
  }
  if (leads > 0 && enrolled === 0) {
    issues.push(
      "Attributed CRM leads exist but no enrollments are recorded in this provider view. Review lead quality and downstream sales outcomes.",
    );
  }
  if (coverageRate != null && coverageRate < 0.8) {
    issues.push(
      `Only ${Math.round(coverageRate * 100)}% of Meta-paid CRM leads contain a campaign ID. Repair first-party lineage before strong ROI conclusions.`,
    );
  }
  if (matchRate != null && matchRate < 0.8) {
    issues.push(
      `Only ${Math.round(matchRate * 100)}% of captured Meta campaign IDs match synced campaign data. Unmatched IDs stay unresolved rather than being guessed.`,
    );
  }

  return {
    provider: "Meta Ads",
    currency,
    spend,
    leads,
    qualified: numberValue(overview.qualified_leads),
    enrolled,
    revenueInr: numberValue(overview.crm_revenue_inr),
    revenueUsd: numberValue(overview.crm_revenue_usd),
    cpl: nullableNumber(overview.cpl),
    cac: nullableNumber(overview.cac),
    roas: nullableNumber(overview.roas),
    coverage: coverageRate,
    coverageLabel:
      coverageRate == null
        ? "Campaign-ID coverage has no paid-lead denominator yet."
        : `${Math.round(coverageRate * 100)}% of Meta-paid CRM leads carry a campaign ID.`,
    issues,
  };
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[11px] font-semibold uppercase tracking-[0.06em] text-[var(--app-text-subtle)]">
        {label}
      </div>
      <div className="mt-1 text-[14px] font-semibold text-[var(--app-text-strong)]">{value}</div>
    </div>
  );
}

function asRecord(value: unknown): UnknownRecord {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as UnknownRecord)
    : {};
}

function numberValue(value: unknown): number {
  const number = Number(value ?? 0);
  return Number.isFinite(number) ? number : 0;
}

function nullableNumber(value: unknown): number | null {
  if (value == null || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function textValue(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function ratio(numerator: number, denominator: number) {
  if (denominator <= 0) return 0;
  return Math.max(0, Math.min(1, numerator / denominator));
}

function formatInteger(value: number) {
  return Math.round(value).toLocaleString("en-IN");
}

function formatMoney(value: number, currency: string) {
  if (currency.toUpperCase() === "INR") {
    return `₹${value.toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;
  }
  if (currency.toUpperCase() === "USD") {
    return `$${value.toLocaleString("en-US", { maximumFractionDigits: 2 })}`;
  }
  return `${currency} ${value.toLocaleString("en-US", { maximumFractionDigits: 2 })}`;
}

function formatRevenue(inr: number, usd: number) {
  const values: string[] = [];
  if (inr !== 0) values.push(formatMoney(inr, "INR"));
  if (usd !== 0) values.push(formatMoney(usd, "USD"));
  return values.length > 0 ? values.join(" + ") : "No recorded provider-attributed revenue";
}
