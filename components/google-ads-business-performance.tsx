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

import type { GoogleAdsBusinessData } from "@/lib/funnel-data";

type AdsOverviewRow = {
  start_date: string | null;

  end_date: string | null;

  impressions: number | string | null;

  clicks: number | string | null;

  spend: number | string | null;

  crm_leads: number | string | null;

  qualified_leads: number | string | null;

  paid_leads: number | string | null;

  enrolled_leads: number | string | null;

  hot_leads: number | string | null;

  crm_revenue_inr: number | string | null;

  crm_revenue_usd: number | string | null;

  cpl: number | string | null;

  cost_per_qualified_lead: number | string | null;

  cac: number | string | null;

  roas_inr: number | string | null;
};

type CampaignRow = {
  customer_id: string;

  campaign_id: string;

  campaign_name: string | null;

  campaign_status: string | null;

  advertising_channel_type: string | null;

  currency_code: string | null;

  impressions: number | string | null;

  clicks: number | string | null;

  spend: number | string | null;

  google_conversions: number | string | null;

  google_conversion_value: number | string | null;

  crm_leads: number | string | null;

  qualified_leads: number | string | null;

  high_intent_leads: number | string | null;

  payment_pending_leads: number | string | null;

  paid_leads: number | string | null;

  enrolled_leads: number | string | null;

  hot_leads: number | string | null;

  warm_leads: number | string | null;

  cold_leads: number | string | null;

  closed_leads: number | string | null;

  crm_revenue_inr: number | string | null;

  crm_revenue_usd: number | string | null;

  avg_cpc: number | string | null;

  cpl: number | string | null;

  cost_per_qualified_lead: number | string | null;

  cost_per_paid_lead: number | string | null;

  cac: number | string | null;

  roas_inr: number | string | null;

  click_to_lead_rate: number | string | null;

  lead_to_enrollment_rate: number | string | null;
};

type CoverageRow = {
  google_paid_touchpoints: number | string | null;

  touchpoints_with_gclid: number | string | null;

  touchpoints_with_campaign_id: number | string | null;

  touchpoints_with_adgroup_id: number | string | null;

  touchpoints_with_ad_id: number | string | null;

  google_paid_leads: number | string | null;

  leads_with_campaign_id: number | string | null;

  leads_with_gclid: number | string | null;

  gclid_only_leads: number | string | null;

  leads_matching_ads_campaign: number | string | null;

  captured_campaign_ids: number | string | null;

  matched_campaign_ids: number | string | null;
};

type MatchRow = {
  captured_campaign_id: string;

  campaign_name: string | null;

  touchpoints: number | string | null;

  leads: number | string | null;

  first_ads_date: string | null;

  last_ads_date: string | null;

  matched_to_google_ads: boolean | null;
};

export function GoogleAdsBusinessPerformance({
  data,
}: {
  data: GoogleAdsBusinessData;
}) {
  const overview = (data.overview ?? {}) as AdsOverviewRow;

  const campaigns = (data.campaigns ?? []) as CampaignRow[];

  const coverage = (data.coverage ?? {}) as CoverageRow;

  const matches = (data.matches ?? []) as MatchRow[];

  const unmatchedCount = data.unmatchedCount ?? 0;

  const adsCurrency = campaigns[0]?.currency_code || "INR";

  const matchingLeadRate = percentOf(
    coverage.leads_matching_ads_campaign,

    coverage.google_paid_leads,
  );

  return (
    <section className="card-pad mt-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="eyebrow">Paid media business attribution</div>

          <div className="section-title mt-1">Google Ads → CRM → Revenue</div>

          <p className="mt-2 max-w-3xl text-xs leading-5 text-slate-400">
            Google Ads spend is joined to CRM leads using the exact campaign ID
            captured by first-party tracking. CRM payments and enrollments are
            then used for business outcomes.
          </p>
        </div>

        <div className="rounded-full bg-slate-100 px-3 py-1.5 text-xs font-bold text-slate-600">
          {formatDate(overview.start_date)}

          {" → "}

          {formatDate(overview.end_date)}
        </div>
      </div>

      <div
        className="

          mt-5

          grid

          gap-3

          sm:grid-cols-2

          xl:grid-cols-4

        "
      >
        <AdsMetricCard
          icon={<BadgeIndianRupee size={17} />}
          label="Ad spend"
          value={formatCurrency(
            overview.spend,

            adsCurrency,
          )}
          sub={`${formatNumber(overview.clicks)} clicks`}
        />

        <AdsMetricCard
          icon={<Users size={17} />}
          label="CRM leads"
          value={formatNumber(overview.crm_leads)}
          sub={`${formatNumber(overview.hot_leads)} currently hot`}
        />

        <AdsMetricCard
          icon={<Target size={17} />}
          label="Qualified"
          value={formatNumber(overview.qualified_leads)}
          sub={
            overview.cost_per_qualified_lead == null
              ? "Cost/qualified unavailable"
              : `${formatCurrency(
                  overview.cost_per_qualified_lead,

                  adsCurrency,
                )} / qualified`
          }
        />

        <AdsMetricCard
          icon={<Coins size={17} />}
          label="Paid leads"
          value={formatNumber(overview.paid_leads)}
          sub={`${formatNumber(overview.enrolled_leads)} enrolled`}
        />

        <AdsMetricCard
          icon={<ReceiptIndianRupee size={17} />}
          label="CRM revenue · INR"
          value={formatCurrency(
            overview.crm_revenue_inr,

            "INR",
          )}
          sub="Net recorded payments"
        />

        <AdsMetricCard
          icon={<CircleDollarSign size={17} />}
          label="CRM revenue · USD"
          value={formatCurrency(
            overview.crm_revenue_usd,

            "USD",
          )}
          sub="Kept separate from INR"
        />

        <AdsMetricCard
          icon={<MousePointerClick size={17} />}
          label="CRM CPL"
          value={
            overview.cpl == null
              ? "—"
              : formatCurrency(
                  overview.cpl,

                  adsCurrency,
                )
          }
          sub="Spend ÷ attributed leads"
        />

        <AdsMetricCard
          icon={<TrendingUp size={17} />}
          label="CRM ROAS"
          value={
            overview.roas_inr == null
              ? "—"
              : `${formatDecimal(
                  overview.roas_inr,

                  2,
                )}×`
          }
          sub={
            overview.cac == null
              ? "CAC unavailable"
              : `CAC ${formatCurrency(
                  overview.cac,

                  adsCurrency,
                )}`
          }
        />
      </div>

      <div
        className="

          mt-5

          grid

          gap-4

          xl:grid-cols-[.72fr_1.28fr]

        "
      >
        <div className="rounded-xl border border-slate-100 bg-slate-50 p-4">
          <div className="flex items-center gap-2">
            <Link2 size={16} className="text-slate-400" />

            <div className="text-sm font-bold text-slate-800">
              Attribution coverage
            </div>
          </div>

          <div className="mt-4 space-y-2">
            <CoverageLine
              label="Google paid leads"
              value={coverage.google_paid_leads}
            />

            <CoverageLine
              label="Leads with campaign ID"
              value={coverage.leads_with_campaign_id}
            />

            <CoverageLine
              label="Matched to Ads campaign"
              value={coverage.leads_matching_ads_campaign}
            />

            <CoverageLine
              label="Leads with GCLID"
              value={coverage.leads_with_gclid}
            />

            <CoverageLine
              label="GCLID-only leads"
              value={coverage.gclid_only_leads}
            />

            <CoverageLine label="Unmatched paid leads" value={unmatchedCount} />
          </div>

          <div className="mt-4 rounded-lg bg-white px-3 py-2.5 text-xs leading-5 text-slate-500">
            Exact campaign-ID coverage:{" "}
            <strong className="font-bold text-slate-700">
              {matchingLeadRate}
            </strong>
            . Leads with only a GCLID are kept separate rather than guessed into
            a campaign.
          </div>
        </div>

        <div className="rounded-xl border border-slate-100 bg-white p-4">
          <div className="text-sm font-bold text-slate-800">
            Captured campaign ID matching
          </div>

          <div className="mt-3 overflow-x-auto">
            <table className="min-w-full text-left text-xs">
              <thead>
                <tr className="border-b border-slate-100 uppercase tracking-wide text-slate-400">
                  <th className="px-2 py-2.5">Campaign</th>

                  <th className="px-2 py-2.5 text-right">Touchpoints</th>

                  <th className="px-2 py-2.5 text-right">Leads</th>

                  <th className="px-2 py-2.5">Match</th>
                </tr>
              </thead>

              <tbody>
                {matches.length === 0 ? (
                  <tr>
                    <td
                      colSpan={4}
                      className="px-2 py-8 text-center text-slate-400"
                    >
                      No captured campaign IDs yet.
                    </td>
                  </tr>
                ) : (
                  matches.map((row) => (
                    <tr
                      key={row.captured_campaign_id}
                      className="border-b border-slate-50 last:border-0"
                    >
                      <td className="max-w-[280px] px-2 py-2.5">
                        <div className="truncate font-semibold text-slate-700">
                          {row.campaign_name || row.captured_campaign_id}
                        </div>

                        {row.campaign_name && (
                          <div className="mt-0.5 truncate text-[10px] text-slate-400">
                            ID {row.captured_campaign_id}
                          </div>
                        )}
                      </td>

                      <td className="px-2 py-2.5 text-right">
                        {formatNumber(row.touchpoints)}
                      </td>

                      <td className="px-2 py-2.5 text-right">
                        {formatNumber(row.leads)}
                      </td>

                      <td className="px-2 py-2.5">
                        <span
                          className={
                            row.matched_to_google_ads
                              ? "font-bold text-emerald-600"
                              : "font-bold text-orange-600"
                          }
                        >
                          {row.matched_to_google_ads ? "Matched" : "Unmatched"}
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <div className="mt-6">
        <div className="text-sm font-bold text-slate-800">
          Campaign business performance
        </div>

        <p className="mt-1 text-xs leading-5 text-slate-400">
          Google-reported conversions are shown separately from CRM leads and
          revenue. CRM outcomes are based on the campaign-ID attribution
          captured on your website.
        </p>

        <div className="mt-4 overflow-x-auto">
          <table className="min-w-[1380px] text-left text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-xs uppercase tracking-wide text-slate-400">
                <th className="px-3 py-3">Campaign</th>

                <th className="px-3 py-3 text-right">Spend</th>

                <th className="px-3 py-3 text-right">Clicks</th>

                <th className="px-3 py-3 text-right">CRM leads</th>

                <th className="px-3 py-3 text-right">Qualified</th>

                <th className="px-3 py-3 text-right">Hot</th>

                <th className="px-3 py-3 text-right">Paid</th>

                <th className="px-3 py-3 text-right">Enrolled</th>

                <th className="px-3 py-3 text-right">CPL</th>

                <th className="px-3 py-3 text-right">CAC</th>

                <th className="px-3 py-3 text-right">INR revenue</th>

                <th className="px-3 py-3 text-right">USD revenue</th>

                <th className="px-3 py-3 text-right">ROAS</th>
              </tr>
            </thead>

            <tbody>
              {campaigns.length === 0 ? (
                <tr>
                  <td
                    colSpan={13}
                    className="px-3 py-10 text-center text-slate-400"
                  >
                    No Google Ads campaign data is available for the reporting
                    window.
                  </td>
                </tr>
              ) : (
                campaigns.map((row) => (
                  <tr
                    key={row.campaign_id}
                    className="border-b border-slate-50 last:border-0"
                  >
                    <td className="max-w-[300px] px-3 py-3">
                      <div className="truncate font-bold text-slate-800">
                        {row.campaign_name || row.campaign_id}
                      </div>

                      <div className="mt-0.5 text-xs text-slate-400">
                        {pretty(row.advertising_channel_type)}

                        {" · "}

                        {pretty(row.campaign_status)}
                      </div>
                    </td>

                    <td className="px-3 py-3 text-right font-semibold">
                      {formatCurrency(
                        row.spend,

                        row.currency_code || adsCurrency,
                      )}
                    </td>

                    <td className="px-3 py-3 text-right">
                      {formatNumber(row.clicks)}
                    </td>

                    <td className="px-3 py-3 text-right font-bold">
                      {formatNumber(row.crm_leads)}
                    </td>

                    <td className="px-3 py-3 text-right">
                      {formatNumber(row.qualified_leads)}
                    </td>

                    <td className="px-3 py-3 text-right">
                      {formatNumber(row.hot_leads)}
                    </td>

                    <td className="px-3 py-3 text-right">
                      {formatNumber(row.paid_leads)}
                    </td>

                    <td className="px-3 py-3 text-right">
                      {formatNumber(row.enrolled_leads)}
                    </td>

                    <td className="px-3 py-3 text-right">
                      {nullableCurrency(
                        row.cpl,

                        row.currency_code || adsCurrency,
                      )}
                    </td>

                    <td className="px-3 py-3 text-right">
                      {nullableCurrency(
                        row.cac,

                        row.currency_code || adsCurrency,
                      )}
                    </td>

                    <td className="px-3 py-3 text-right font-semibold">
                      {formatCurrency(
                        row.crm_revenue_inr,

                        "INR",
                      )}
                    </td>

                    <td className="px-3 py-3 text-right font-semibold">
                      {formatCurrency(
                        row.crm_revenue_usd,

                        "USD",
                      )}
                    </td>

                    <td className="px-3 py-3 text-right font-black text-brand">
                      {row.roas_inr == null
                        ? "—"
                        : `${formatDecimal(
                            row.roas_inr,

                            2,
                          )}×`}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="mt-4 rounded-xl border border-slate-100 bg-slate-50 px-4 py-3 text-xs leading-5 text-slate-500">
        Campaign revenue attribution is deterministic only when the website
        captured Google&apos;s campaign ID for the visitor. GCLID-only leads
        remain visible as unmatched until we add the optional click-ID
        enrichment layer.
      </div>
    </section>
  );
}

function AdsMetricCard({
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
    <div className="rounded-xl border border-slate-100 bg-slate-50 p-4">
      <div className="flex items-center gap-2 text-xs font-semibold text-slate-400">
        {icon}

        {label}
      </div>

      <div className="mt-2 text-xl font-black text-slate-800">{value}</div>

      <div className="mt-1 text-xs text-slate-400">{sub}</div>
    </div>
  );
}

function CoverageLine({
  label,

  value,
}: {
  label: string;

  value: number | string | null | undefined;
}) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-lg bg-white px-3 py-2.5">
      <span className="text-xs font-semibold text-slate-500">{label}</span>

      <span className="text-sm font-black text-slate-800">
        {formatNumber(value)}
      </span>
    </div>
  );
}

function toNumber(value: number | string | null | undefined) {
  const number = Number(value ?? 0);

  return Number.isFinite(number) ? number : 0;
}

function formatNumber(value: number | string | null | undefined) {
  return new Intl.NumberFormat(
    "en-IN",

    {
      maximumFractionDigits: 0,
    },
  ).format(toNumber(value));
}

function formatDecimal(
  value: number | string | null | undefined,

  digits = 1,
) {
  return toNumber(value).toFixed(digits);
}

function formatCurrency(
  value: number | string | null | undefined,

  currency: string,
) {
  const amount = toNumber(value);

  try {
    return new Intl.NumberFormat(
      currency === "INR" ? "en-IN" : "en-US",

      {
        style: "currency",

        currency,

        maximumFractionDigits: 0,
      },
    ).format(amount);
  } catch {
    return `${currency} ${amount}`;
  }
}

function nullableCurrency(
  value: number | string | null | undefined,

  currency: string,
) {
  if (value == null || value === "") {
    return "—";
  }

  return formatCurrency(
    value,

    currency,
  );
}

function formatDate(value: string | null | undefined) {
  if (!value) {
    return "No data";
  }

  const date = new Date(`${value}T00:00:00Z`);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat(
    "en-IN",

    {
      day: "numeric",

      month: "short",

      year: "numeric",

      timeZone: "UTC",
    },
  ).format(date);
}

function percentOf(
  numerator: number | string | null | undefined,

  denominator: number | string | null | undefined,
) {
  const top = toNumber(numerator);

  const bottom = toNumber(denominator);

  if (bottom <= 0) {
    return "—";
  }

  return `${((top / bottom) * 100).toFixed(1)}%`;
}

function pretty(value: string | null | undefined) {
  if (!value) {
    return "—";
  }

  return String(value)
    .replaceAll(
      "_",

      " ",
    )

    .replace(
      /\b\w/g,

      (letter) => letter.toUpperCase(),
    );
}
