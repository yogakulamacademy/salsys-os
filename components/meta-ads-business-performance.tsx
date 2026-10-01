import type { ReactNode } from "react";

import {
  BadgeIndianRupee,
  CircleDollarSign,
  Coins,
  Link2,
  MousePointerClick,
  ReceiptIndianRupee,
  Target,
  TrendingUp,
  Users,
} from "lucide-react";

import type { MetaAdsBusinessData } from "@/lib/funnel-data";

type MetaOverviewRow = {
  start_date: string | null;

  end_date: string | null;

  currency_code: string | null;

  spend: number | string | null;

  impressions: number | string | null;

  clicks: number | string | null;

  inline_link_clicks: number | string | null;

  crm_leads: number | string | null;

  qualified_leads: number | string | null;

  high_intent_leads: number | string | null;

  payment_pending_leads: number | string | null;

  paid_leads: number | string | null;

  enrolled_leads: number | string | null;

  crm_revenue_inr: number | string | null;

  crm_revenue_usd: number | string | null;

  avg_cpc: number | string | null;

  cpl: number | string | null;

  cost_per_qualified_lead: number | string | null;

  cost_per_paid_lead: number | string | null;

  cac: number | string | null;

  roas: number | string | null;

  click_to_lead_rate: number | string | null;

  lead_to_enrollment_rate: number | string | null;
};

type CoverageRow = {
  meta_paid_touchpoints: number | string | null;

  touchpoints_with_fbclid: number | string | null;

  touchpoints_with_campaign_id: number | string | null;

  touchpoints_with_adset_id: number | string | null;

  touchpoints_with_ad_id: number | string | null;

  meta_paid_leads: number | string | null;

  leads_with_campaign_id: number | string | null;

  leads_with_adset_id: number | string | null;

  leads_with_ad_id: number | string | null;

  captured_campaign_ids: number | string | null;

  captured_adset_ids: number | string | null;

  captured_ad_ids: number | string | null;

  matched_campaign_ids: number | string | null;

  matched_adset_ids: number | string | null;

  matched_ad_ids: number | string | null;
};

type CampaignRow = {
  ad_account_id: string;

  campaign_id: string;

  campaign_name: string | null;

  objective: string | null;

  currency_code: string | null;

  start_date: string | null;

  end_date: string | null;

  spend: number | string | null;

  impressions: number | string | null;

  clicks: number | string | null;

  inline_link_clicks: number | string | null;

  ctr: number | string | null;

  avg_cpc: number | string | null;

  crm_leads: number | string | null;

  qualified_leads: number | string | null;

  high_intent_leads: number | string | null;

  payment_pending_leads: number | string | null;

  paid_leads: number | string | null;

  enrolled_leads: number | string | null;

  crm_revenue_inr: number | string | null;

  crm_revenue_usd: number | string | null;

  cpl: number | string | null;

  cost_per_qualified_lead: number | string | null;

  cost_per_paid_lead: number | string | null;

  cac: number | string | null;

  roas: number | string | null;

  click_to_lead_rate: number | string | null;

  lead_to_enrollment_rate: number | string | null;
};

type AdsetRow = {
  ad_account_id: string;

  campaign_id: string;

  campaign_name: string | null;

  adset_id: string;

  adset_name: string | null;

  currency_code: string | null;

  spend: number | string | null;

  impressions: number | string | null;

  clicks: number | string | null;

  inline_link_clicks: number | string | null;

  crm_leads: number | string | null;

  qualified_leads: number | string | null;

  paid_leads: number | string | null;

  enrolled_leads: number | string | null;

  crm_revenue_inr: number | string | null;

  crm_revenue_usd: number | string | null;

  cpl: number | string | null;

  cost_per_qualified_lead: number | string | null;

  cac: number | string | null;

  roas: number | string | null;
};

type AdRow = {
  ad_account_id: string;

  campaign_id: string;

  campaign_name: string | null;

  adset_id: string;

  adset_name: string | null;

  ad_id: string;

  ad_name: string | null;

  currency_code: string | null;

  spend: number | string | null;

  impressions: number | string | null;

  clicks: number | string | null;

  inline_link_clicks: number | string | null;

  crm_leads: number | string | null;

  qualified_leads: number | string | null;

  paid_leads: number | string | null;

  enrolled_leads: number | string | null;

  crm_revenue_inr: number | string | null;

  crm_revenue_usd: number | string | null;

  cpl: number | string | null;

  cost_per_qualified_lead: number | string | null;

  cac: number | string | null;

  roas: number | string | null;
};

export function MetaAdsBusinessPerformance({
  data,
}: {
  data: MetaAdsBusinessData;
}) {
  const overview = (data.overview ?? {}) as MetaOverviewRow;

  const coverage = (data.coverage ?? {}) as CoverageRow;

  const campaigns = (data.campaigns ?? []) as CampaignRow[];

  const adsets = (data.adsets ?? []) as AdsetRow[];

  const ads = (data.ads ?? []) as AdRow[];

  const adsCurrency =
    overview.currency_code || campaigns[0]?.currency_code || "INR";

  const leadIdCoverage = percentOf(
    coverage.leads_with_campaign_id,

    coverage.meta_paid_leads,
  );

  const campaignMatchCoverage = percentOf(
    coverage.matched_campaign_ids,

    coverage.captured_campaign_ids,
  );

  return (
    <section className="funnel-paid-card funnel-meta-card card-pad mt-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="eyebrow">Paid media business attribution</div>

          <div className="section-title mt-1">Meta Ads → CRM → Revenue</div>

          <p className="mt-2 max-w-3xl text-xs leading-5 text-slate-400">
            Facebook and Instagram ad spend is joined to CRM leads using the
            exact campaign, ad-set and ad IDs captured by first-party website
            tracking. Test IDs stay unmatched instead of being guessed into real
            Meta campaigns.
          </p>
        </div>

        <div className="funnel-paid-range rounded-full bg-slate-100 px-3 py-1.5 text-xs font-semibold text-slate-600">
          {formatDate(overview.start_date)}

          {" → "}

          {formatDate(overview.end_date)}
        </div>
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          icon={<BadgeIndianRupee size={17} />}
          label="Meta ad spend"
          value={formatCurrency(overview.spend, adsCurrency)}
          sub={`${formatNumber(overview.clicks)} clicks · ${formatNumber(
            overview.inline_link_clicks,
          )} link clicks`}
        />

        <MetricCard
          icon={<Users size={17} />}
          label="CRM leads"
          value={formatNumber(overview.crm_leads)}
          sub={`${formatNumber(overview.high_intent_leads)} high intent`}
        />

        <MetricCard
          icon={<Target size={17} />}
          label="Qualified"
          value={formatNumber(overview.qualified_leads)}
          sub={
            overview.cost_per_qualified_lead == null
              ? "Cost / qualified unavailable"
              : `${formatCurrency(
                  overview.cost_per_qualified_lead,

                  adsCurrency,
                )} / qualified`
          }
        />

        <MetricCard
          icon={<Coins size={17} />}
          label="Paid leads"
          value={formatNumber(overview.paid_leads)}
          sub={`${formatNumber(overview.enrolled_leads)} enrolled`}
        />

        <MetricCard
          icon={<ReceiptIndianRupee size={17} />}
          label="CRM revenue · INR"
          value={formatCurrency(overview.crm_revenue_inr, "INR")}
          sub="Net recorded CRM payments"
        />

        <MetricCard
          icon={<CircleDollarSign size={17} />}
          label="CRM revenue · USD"
          value={formatCurrency(overview.crm_revenue_usd, "USD")}
          sub="Kept separate from INR"
        />

        <MetricCard
          icon={<MousePointerClick size={17} />}
          label="CRM CPL"
          value={
            overview.cpl == null
              ? "—"
              : formatCurrency(overview.cpl, adsCurrency)
          }
          sub="Spend ÷ attributed CRM leads"
        />

        <MetricCard
          icon={<TrendingUp size={17} />}
          label="CRM ROAS"
          value={
            overview.roas == null ? "—" : `${formatDecimal(overview.roas, 2)}×`
          }
          sub={
            overview.cac == null
              ? "CAC unavailable"
              : `CAC ${formatCurrency(overview.cac, adsCurrency)}`
          }
        />
      </div>

      <div className="mt-5 grid gap-4 xl:grid-cols-[.75fr_1.25fr]">
        <div className="funnel-paid-coverage rounded-xl border border-slate-100 bg-slate-50 p-4">
          <div className="flex items-center gap-2">
            <Link2 size={16} className="text-slate-400" />

            <div className="text-sm font-semibold text-slate-800">
              Attribution coverage
            </div>
          </div>

          <div className="mt-4 space-y-2">
            <CoverageLine
              label="Meta paid touchpoints"
              value={coverage.meta_paid_touchpoints}
            />

            <CoverageLine
              label="Touchpoints with FBCLID"
              value={coverage.touchpoints_with_fbclid}
            />

            <CoverageLine
              label="Touchpoints with campaign ID"
              value={coverage.touchpoints_with_campaign_id}
            />

            <CoverageLine
              label="Meta paid leads"
              value={coverage.meta_paid_leads}
            />

            <CoverageLine
              label="Leads with campaign ID"
              value={coverage.leads_with_campaign_id}
            />

            <CoverageLine
              label="Leads with ad-set ID"
              value={coverage.leads_with_adset_id}
            />

            <CoverageLine
              label="Leads with ad ID"
              value={coverage.leads_with_ad_id}
            />
          </div>

          <div className="mt-4 rounded-lg bg-white px-3 py-2.5 text-xs leading-5 text-slate-500">
            Paid-lead campaign-ID coverage:{" "}
            <strong className="font-semibold text-slate-700">
              {leadIdCoverage}
            </strong>
            . Real campaign-ID match coverage:{" "}
            <strong className="font-semibold text-slate-700">
              {campaignMatchCoverage}
            </strong>
            .
          </div>
        </div>

        <div className="funnel-paid-match rounded-xl border border-slate-100 bg-white p-4">
          <div className="text-sm font-semibold text-slate-800">
            Captured ID matching
          </div>

          <p className="mt-1 text-xs leading-5 text-slate-400">
            Test campaign IDs will remain unmatched. New real Meta clicks should
            begin matching automatically after the URL parameters you configured
            start receiving traffic.
          </p>

          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            <MatchCard
              label="Campaign IDs"
              captured={coverage.captured_campaign_ids}
              matched={coverage.matched_campaign_ids}
            />

            <MatchCard
              label="Ad-set IDs"
              captured={coverage.captured_adset_ids}
              matched={coverage.matched_adset_ids}
            />

            <MatchCard
              label="Ad IDs"
              captured={coverage.captured_ad_ids}
              matched={coverage.matched_ad_ids}
            />
          </div>
        </div>
      </div>

      <div className="mt-6">
        <div className="text-sm font-semibold text-slate-800">
          Campaign business performance
        </div>

        <p className="mt-1 text-xs leading-5 text-slate-400">
          Spend comes from the Meta Marketing API. Leads, payments, enrollments
          and revenue come from the CRM.
        </p>

        <div className="funnel-paid-table-wrap mt-3 overflow-x-auto">
          <table className="funnel-paid-table min-w-[1180px] text-left text-xs">
            <thead>
              <tr className="border-b border-slate-100 uppercase tracking-wide text-slate-400">
                <th className="px-2 py-2.5">Campaign</th>

                <th className="px-2 py-2.5 text-right">Spend</th>

                <th className="px-2 py-2.5 text-right">Clicks</th>

                <th className="px-2 py-2.5 text-right">Leads</th>

                <th className="px-2 py-2.5 text-right">Qualified</th>

                <th className="px-2 py-2.5 text-right">Paid</th>

                <th className="px-2 py-2.5 text-right">Enrolled</th>

                <th className="px-2 py-2.5 text-right">CPL</th>

                <th className="px-2 py-2.5 text-right">CAC</th>

                <th className="px-2 py-2.5 text-right">INR revenue</th>

                <th className="px-2 py-2.5 text-right">USD revenue</th>

                <th className="px-2 py-2.5 text-right">ROAS</th>
              </tr>
            </thead>

            <tbody>
              {campaigns.length === 0 ? (
                <tr>
                  <td
                    colSpan={12}
                    className="px-3 py-8 text-center text-slate-400"
                  >
                    No Meta campaign rows available for this reporting window.
                  </td>
                </tr>
              ) : (
                campaigns.map((row) => (
                  <tr
                    key={`${row.ad_account_id}-${row.campaign_id}`}
                    className="border-b border-slate-50 last:border-0"
                  >
                    <td className="max-w-[320px] px-2 py-3">
                      <div className="truncate font-semibold text-slate-800">
                        {row.campaign_name || row.campaign_id}
                      </div>

                      <div className="mt-0.5 truncate text-[10px] text-slate-400">
                        ID {row.campaign_id}
                        {row.objective ? ` · ${pretty(row.objective)}` : ""}
                      </div>
                    </td>

                    <td className="px-2 py-3 text-right font-semibold text-slate-700">
                      {formatCurrency(
                        row.spend,

                        row.currency_code || adsCurrency,
                      )}
                    </td>

                    <td className="px-2 py-3 text-right">
                      {formatNumber(row.clicks)}
                    </td>

                    <td className="px-2 py-3 text-right font-semibold text-slate-800">
                      {formatNumber(row.crm_leads)}
                    </td>

                    <td className="px-2 py-3 text-right">
                      {formatNumber(row.qualified_leads)}
                    </td>

                    <td className="px-2 py-3 text-right">
                      {formatNumber(row.paid_leads)}
                    </td>

                    <td className="px-2 py-3 text-right">
                      {formatNumber(row.enrolled_leads)}
                    </td>

                    <td className="px-2 py-3 text-right">
                      {row.cpl == null
                        ? "—"
                        : formatCurrency(
                            row.cpl,

                            row.currency_code || adsCurrency,
                          )}
                    </td>

                    <td className="px-2 py-3 text-right">
                      {row.cac == null
                        ? "—"
                        : formatCurrency(
                            row.cac,

                            row.currency_code || adsCurrency,
                          )}
                    </td>

                    <td className="px-2 py-3 text-right">
                      {formatCurrency(row.crm_revenue_inr, "INR")}
                    </td>

                    <td className="px-2 py-3 text-right">
                      {formatCurrency(row.crm_revenue_usd, "USD")}
                    </td>

                    <td className="px-2 py-3 text-right font-semibold text-slate-800">
                      {row.roas == null
                        ? "—"
                        : `${formatDecimal(row.roas, 2)}×`}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="mt-6 grid gap-4 xl:grid-cols-2">
        <SmallPerformanceTable
          title="Top ad sets by spend"
          empty="No Meta ad-set rows available."
          rows={adsets.map((row) => ({
            id: row.adset_id,

            primary: row.adset_name || row.adset_id,

            secondary: row.campaign_name || row.campaign_id,

            spend: row.spend,

            currency: row.currency_code || adsCurrency,

            leads: row.crm_leads,

            enrolled: row.enrolled_leads,

            roas: row.roas,
          }))}
        />

        <SmallPerformanceTable
          title="Top ads by spend"
          empty="No Meta ad rows available."
          rows={ads.map((row) => ({
            id: row.ad_id,

            primary: row.ad_name || row.ad_id,

            secondary: row.adset_name || row.campaign_name || row.adset_id,

            spend: row.spend,

            currency: row.currency_code || adsCurrency,

            leads: row.crm_leads,

            enrolled: row.enrolled_leads,

            roas: row.roas,
          }))}
        />
      </div>
    </section>
  );
}

function MetricCard({
  icon,

  label,

  value,

  sub,
}: {
  icon: ReactNode;

  label: string;

  value: string;

  sub: string;
}) {
  return (
    <div className="funnel-paid-metric rounded-xl border border-slate-100 bg-white p-4">
      <div className="flex items-center gap-2 text-xs font-semibold text-slate-400">
        {icon}

        {label}
      </div>

      <div className="mt-2 text-xl font-semibold text-slate-800">{value}</div>

      <div className="mt-1 text-[11px] text-slate-400">{sub}</div>
    </div>
  );
}

function CoverageLine({
  label,

  value,
}: {
  label: string;

  value: number | string | null;
}) {
  return (
    <div className="funnel-coverage-line flex items-center justify-between gap-4 rounded-lg bg-white px-3 py-2.5">
      <span className="text-xs font-medium text-slate-500">{label}</span>

      <span className="text-xs font-semibold text-slate-800">
        {formatNumber(value)}
      </span>
    </div>
  );
}

function MatchCard({
  label,

  captured,

  matched,
}: {
  label: string;

  captured: number | string | null;

  matched: number | string | null;
}) {
  const capturedNumber = numberValue(captured);

  const matchedNumber = numberValue(matched);

  return (
    <div className="funnel-match-card rounded-xl bg-slate-50 p-4">
      <div className="text-xs font-semibold text-slate-400">{label}</div>

      <div className="mt-2 text-lg font-semibold text-slate-800">
        {matchedNumber}

        <span className="text-sm font-semibold text-slate-400">
          {" / "}

          {capturedNumber}
        </span>
      </div>

      <div className="mt-1 text-[11px] text-slate-400">
        {percentOf(matchedNumber, capturedNumber)} matched
      </div>
    </div>
  );
}

function SmallPerformanceTable({
  title,

  empty,

  rows,
}: {
  title: string;

  empty: string;

  rows: Array<{
    id: string;

    primary: string;

    secondary: string;

    spend: number | string | null;

    currency: string;

    leads: number | string | null;

    enrolled: number | string | null;

    roas: number | string | null;
  }>;
}) {
  return (
    <div className="funnel-small-table-card rounded-xl border border-slate-100 bg-white p-4">
      <div className="text-sm font-semibold text-slate-800">{title}</div>

      <div className="funnel-paid-table-wrap mt-3 overflow-x-auto">
        <table className="funnel-paid-table min-w-full text-left text-xs">
          <thead>
            <tr className="border-b border-slate-100 uppercase tracking-wide text-slate-400">
              <th className="px-2 py-2.5">Name</th>

              <th className="px-2 py-2.5 text-right">Spend</th>

              <th className="px-2 py-2.5 text-right">Leads</th>

              <th className="px-2 py-2.5 text-right">Enrolled</th>

              <th className="px-2 py-2.5 text-right">ROAS</th>
            </tr>
          </thead>

          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td
                  colSpan={5}
                  className="px-2 py-8 text-center text-slate-400"
                >
                  {empty}
                </td>
              </tr>
            ) : (
              rows.map((row) => (
                <tr
                  key={row.id}
                  className="border-b border-slate-50 last:border-0"
                >
                  <td className="max-w-[260px] px-2 py-2.5">
                    <div className="truncate font-semibold text-slate-700">
                      {row.primary}
                    </div>

                    <div className="mt-0.5 truncate text-[10px] text-slate-400">
                      {row.secondary}
                    </div>
                  </td>

                  <td className="px-2 py-2.5 text-right">
                    {formatCurrency(row.spend, row.currency)}
                  </td>

                  <td className="px-2 py-2.5 text-right">
                    {formatNumber(row.leads)}
                  </td>

                  <td className="px-2 py-2.5 text-right">
                    {formatNumber(row.enrolled)}
                  </td>

                  <td className="px-2 py-2.5 text-right font-semibold text-slate-700">
                    {row.roas == null ? "—" : `${formatDecimal(row.roas, 2)}×`}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function numberValue(value: number | string | null | undefined) {
  const parsed = Number(value ?? 0);

  return Number.isFinite(parsed) ? parsed : 0;
}

function formatNumber(value: number | string | null | undefined) {
  return new Intl.NumberFormat("en-IN", {
    maximumFractionDigits: 0,
  }).format(numberValue(value));
}

function formatCurrency(
  value: number | string | null | undefined,

  currency: string,
) {
  try {
    return new Intl.NumberFormat(
      currency === "INR" ? "en-IN" : "en-US",

      {
        style: "currency",

        currency,

        maximumFractionDigits: 2,
      },
    ).format(numberValue(value));
  } catch {
    return `${currency} ${numberValue(value).toFixed(2)}`;
  }
}

function formatDecimal(
  value: number | string | null | undefined,

  digits: number,
) {
  return numberValue(value).toFixed(digits);
}

function percentOf(
  numerator: number | string | null | undefined,

  denominator: number | string | null | undefined,
) {
  const n = numberValue(numerator);

  const d = numberValue(denominator);

  if (d <= 0) return "0%";

  return `${((n / d) * 100).toFixed(1)}%`;
}

function formatDate(value: string | null | undefined) {
  if (!value) return "—";

  const date = new Date(`${value}T00:00:00`);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("en-IN", {
    day: "numeric",

    month: "short",

    year: "numeric",
  }).format(date);
}

function pretty(value: string) {
  return value

    .replaceAll("_", " ")

    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}
