import type { ReactNode } from 'react';

import {
  BarChart3,
  Eye,
  Globe2,
  MousePointerClick,
  Smartphone,
  Target,
  TrendingUp,
} from 'lucide-react';

import { createClient } from '@/lib/supabase/server';

type AnyRow = Record<string, unknown>;

function numberValue(value: unknown) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === 'string') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  return 0;
}

function textValue(value: unknown) {
  if (value == null) return '';
  return String(value);
}

function formatNumber(value: unknown) {
  return new Intl.NumberFormat('en-IN', {
    maximumFractionDigits: 0,
  }).format(numberValue(value));
}

function formatMoney(value: unknown, currency = 'INR') {
  const amount = numberValue(value);

  try {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency,
      maximumFractionDigits: 0,
    }).format(amount);
  } catch {
    return `${currency} ${amount.toFixed(0)}`;
  }
}

function formatDecimal(value: unknown, digits = 2) {
  return numberValue(value).toLocaleString('en-IN', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

function formatPercent(value: unknown) {
  const numeric = numberValue(value);

  // Meta's CTR is commonly already returned as a percentage value.
  return `${numeric.toFixed(2)}%`;
}

function formatDate(value: unknown) {
  const raw = textValue(value);
  if (!raw) return '—';

  const date = new Date(`${raw}T00:00:00`);
  if (Number.isNaN(date.getTime())) return raw;

  return new Intl.DateTimeFormat('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(date);
}

function pick(row: AnyRow | null | undefined, ...keys: string[]) {
  if (!row) return null;

  for (const key of keys) {
    if (row[key] !== undefined && row[key] !== null) {
      return row[key];
    }
  }

  return null;
}

function MetricCard({
  label,
  value,
  helper,
  icon,
}: {
  label: string;
  value: string;
  helper?: string;
  icon: ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900/70">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-[11px] font-bold uppercase tracking-[0.14em] text-slate-400">
            {label}
          </div>
          <div className="mt-2 text-2xl font-black tracking-tight text-slate-900 dark:text-slate-100">
            {value}
          </div>
          {helper ? (
            <div className="mt-1 text-xs text-slate-400">{helper}</div>
          ) : null}
        </div>
        <div className="rounded-xl bg-slate-50 p-2 text-slate-500 dark:bg-slate-800 dark:text-slate-300">
          {icon}
        </div>
      </div>
    </div>
  );
}

function EmptyRow({ colSpan, text }: { colSpan: number; text: string }) {
  return (
    <tr>
      <td colSpan={colSpan} className="px-3 py-8 text-center text-sm text-slate-400">
        {text}
      </td>
    </tr>
  );
}

export async function MetaAdsBusinessPerformance() {
  const supabase = await createClient();

  const [
    overviewResult,
    campaignsResult,
    adsetsResult,
    adsResult,
    publishersResult,
    countriesResult,
    devicesResult,
  ] = await Promise.all([
    supabase.from('v_meta_ads_30d_overview').select('*').maybeSingle(),
    supabase.from('v_meta_ads_campaign_30d').select('*').order('spend', { ascending: false }),
    supabase.from('v_meta_ads_adset_30d').select('*').order('spend', { ascending: false }).limit(12),
    supabase.from('v_meta_ads_ad_30d').select('*').order('spend', { ascending: false }).limit(12),
    supabase.from('v_meta_ads_publisher_30d').select('*').order('spend', { ascending: false }),
    supabase.from('v_meta_ads_country_30d').select('*').order('spend', { ascending: false }).limit(12),
    supabase.from('v_meta_ads_device_30d').select('*').order('spend', { ascending: false }),
  ]);

  const errors = [
    overviewResult.error,
    campaignsResult.error,
    adsetsResult.error,
    adsResult.error,
    publishersResult.error,
    countriesResult.error,
    devicesResult.error,
  ].filter(Boolean);

  if (errors.length > 0) {
    throw new Error(
      `Unable to load Meta Ads performance: ${errors
        .map((error) => error?.message)
        .filter(Boolean)
        .join(' | ')}`
    );
  }

  const overview = (overviewResult.data ?? {}) as AnyRow;
  const campaigns = (campaignsResult.data ?? []) as AnyRow[];
  const adsets = (adsetsResult.data ?? []) as AnyRow[];
  const ads = (adsResult.data ?? []) as AnyRow[];
  const publishers = (publishersResult.data ?? []) as AnyRow[];
  const countries = (countriesResult.data ?? []) as AnyRow[];
  const devices = (devicesResult.data ?? []) as AnyRow[];

  const currency =
    textValue(pick(overview, 'currency_code', 'currency')) ||
    textValue(pick(campaigns[0], 'currency_code', 'currency')) ||
    'INR';

  const startDate = pick(overview, 'start_date', 'date_start', 'min_date');
  const endDate = pick(overview, 'end_date', 'date_end', 'max_date');

  const spend = pick(overview, 'spend', 'total_spend');
  const impressions = pick(overview, 'impressions', 'total_impressions');
  const reach = pick(overview, 'reach', 'total_reach');
  const clicks = pick(overview, 'clicks', 'total_clicks');
  const linkClicks = pick(
    overview,
    'inline_link_clicks',
    'link_clicks',
    'total_inline_link_clicks'
  );
  const ctr = pick(overview, 'ctr');
  const cpc = pick(overview, 'cpc', 'avg_cpc');
  const cpm = pick(overview, 'cpm', 'avg_cpm');

  return (
    <section className="card-pad mt-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="eyebrow">Paid media performance</div>
          <div className="section-title mt-1">Meta Ads · Facebook + Instagram</div>
          <p className="mt-2 max-w-3xl text-xs leading-5 text-slate-400">
            Live Meta Marketing API data from campaign, ad set, ad, publisher/placement,
            country and device reporting. CRM lead/revenue attribution will be joined in
            the next layer using captured Meta campaign, ad set and ad IDs.
          </p>
        </div>

        <div className="rounded-full bg-slate-100 px-3 py-1.5 text-xs font-bold text-slate-600 dark:bg-slate-800 dark:text-slate-300">
          {formatDate(startDate)} {' → '} {formatDate(endDate)}
        </div>
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          label="Spend"
          value={formatMoney(spend, currency)}
          helper={currency}
          icon={<TrendingUp size={18} />}
        />
        <MetricCard
          label="Impressions"
          value={formatNumber(impressions)}
          helper={`Reach ${formatNumber(reach)}`}
          icon={<Eye size={18} />}
        />
        <MetricCard
          label="Clicks"
          value={formatNumber(clicks)}
          helper={`Link clicks ${formatNumber(linkClicks)}`}
          icon={<MousePointerClick size={18} />}
        />
        <MetricCard
          label="CTR"
          value={formatPercent(ctr)}
          helper={`CPC ${formatMoney(cpc, currency)} · CPM ${formatMoney(cpm, currency)}`}
          icon={<Target size={18} />}
        />
      </div>

      <div className="mt-6 grid gap-4 xl:grid-cols-2">
        <div className="rounded-2xl border border-slate-100 p-4 dark:border-slate-800">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-sm font-bold text-slate-800 dark:text-slate-100">
                Facebook vs Instagram
              </div>
              <div className="mt-1 text-xs text-slate-400">Publisher + placement performance</div>
            </div>
            <BarChart3 size={18} className="text-slate-400" />
          </div>

          <div className="mt-4 overflow-x-auto">
            <table className="min-w-[680px] text-left text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-[11px] uppercase tracking-wide text-slate-400 dark:border-slate-800">
                  <th className="px-3 py-3">Publisher</th>
                  <th className="px-3 py-3">Placement</th>
                  <th className="px-3 py-3 text-right">Spend</th>
                  <th className="px-3 py-3 text-right">Impr.</th>
                  <th className="px-3 py-3 text-right">Clicks</th>
                  <th className="px-3 py-3 text-right">CTR</th>
                </tr>
              </thead>
              <tbody>
                {publishers.length === 0 ? (
                  <EmptyRow colSpan={6} text="No publisher/placement data available." />
                ) : (
                  publishers.map((row, index) => (
                    <tr
                      key={`${textValue(pick(row, 'publisher_platform'))}-${textValue(
                        pick(row, 'platform_position')
                      )}-${index}`}
                      className="border-b border-slate-50 last:border-0 dark:border-slate-800/70"
                    >
                      <td className="px-3 py-3 font-semibold text-slate-700 dark:text-slate-200">
                        {textValue(pick(row, 'publisher_platform')) || 'Unknown'}
                      </td>
                      <td className="px-3 py-3 text-slate-500 dark:text-slate-400">
                        {textValue(pick(row, 'platform_position')) || 'Unknown'}
                      </td>
                      <td className="px-3 py-3 text-right font-semibold">
                        {formatMoney(pick(row, 'spend'), currency)}
                      </td>
                      <td className="px-3 py-3 text-right">{formatNumber(pick(row, 'impressions'))}</td>
                      <td className="px-3 py-3 text-right">{formatNumber(pick(row, 'clicks'))}</td>
                      <td className="px-3 py-3 text-right">{formatPercent(pick(row, 'ctr'))}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="rounded-2xl border border-slate-100 p-4 dark:border-slate-800">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-sm font-bold text-slate-800 dark:text-slate-100">
                Device performance
              </div>
              <div className="mt-1 text-xs text-slate-400">Meta impression-device breakdown</div>
            </div>
            <Smartphone size={18} className="text-slate-400" />
          </div>

          <div className="mt-4 overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-[11px] uppercase tracking-wide text-slate-400 dark:border-slate-800">
                  <th className="px-3 py-3">Device</th>
                  <th className="px-3 py-3 text-right">Spend</th>
                  <th className="px-3 py-3 text-right">Impr.</th>
                  <th className="px-3 py-3 text-right">Clicks</th>
                </tr>
              </thead>
              <tbody>
                {devices.length === 0 ? (
                  <EmptyRow colSpan={4} text="No device data available." />
                ) : (
                  devices.map((row, index) => (
                    <tr
                      key={`${textValue(pick(row, 'impression_device', 'device'))}-${index}`}
                      className="border-b border-slate-50 last:border-0 dark:border-slate-800/70"
                    >
                      <td className="px-3 py-3 font-semibold text-slate-700 dark:text-slate-200">
                        {textValue(pick(row, 'impression_device', 'device')) || 'Unknown'}
                      </td>
                      <td className="px-3 py-3 text-right font-semibold">
                        {formatMoney(pick(row, 'spend'), currency)}
                      </td>
                      <td className="px-3 py-3 text-right">{formatNumber(pick(row, 'impressions'))}</td>
                      <td className="px-3 py-3 text-right">{formatNumber(pick(row, 'clicks'))}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <div className="mt-6">
        <div className="text-sm font-bold text-slate-800 dark:text-slate-100">Campaign performance</div>
        <p className="mt-1 text-xs leading-5 text-slate-400">
          Top Meta campaigns in the current reporting window. CRM lead, enrollment and revenue
          columns will be added after deterministic Meta attribution is created.
        </p>

        <div className="mt-4 overflow-x-auto">
          <table className="min-w-[1100px] text-left text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-[11px] uppercase tracking-wide text-slate-400 dark:border-slate-800">
                <th className="px-3 py-3">Campaign</th>
                <th className="px-3 py-3">Objective</th>
                <th className="px-3 py-3 text-right">Spend</th>
                <th className="px-3 py-3 text-right">Impressions</th>
                <th className="px-3 py-3 text-right">Reach</th>
                <th className="px-3 py-3 text-right">Clicks</th>
                <th className="px-3 py-3 text-right">CTR</th>
                <th className="px-3 py-3 text-right">CPC</th>
                <th className="px-3 py-3 text-right">CPM</th>
              </tr>
            </thead>
            <tbody>
              {campaigns.length === 0 ? (
                <EmptyRow colSpan={9} text="No Meta campaign data available." />
              ) : (
                campaigns.map((row, index) => (
                  <tr
                    key={`${textValue(pick(row, 'ad_account_id'))}-${textValue(
                      pick(row, 'campaign_id')
                    )}-${index}`}
                    className="border-b border-slate-50 last:border-0 dark:border-slate-800/70"
                  >
                    <td className="max-w-[320px] px-3 py-3">
                      <div className="truncate font-bold text-slate-800 dark:text-slate-100">
                        {textValue(pick(row, 'campaign_name')) || textValue(pick(row, 'campaign_id'))}
                      </div>
                      <div className="mt-0.5 truncate text-[10px] text-slate-400">
                        ID {textValue(pick(row, 'campaign_id')) || '—'}
                      </div>
                    </td>
                    <td className="px-3 py-3 text-xs font-semibold text-slate-500 dark:text-slate-400">
                      {textValue(pick(row, 'objective')) || '—'}
                    </td>
                    <td className="px-3 py-3 text-right font-semibold">
                      {formatMoney(pick(row, 'spend'), currency)}
                    </td>
                    <td className="px-3 py-3 text-right">{formatNumber(pick(row, 'impressions'))}</td>
                    <td className="px-3 py-3 text-right">{formatNumber(pick(row, 'reach'))}</td>
                    <td className="px-3 py-3 text-right">{formatNumber(pick(row, 'clicks'))}</td>
                    <td className="px-3 py-3 text-right">{formatPercent(pick(row, 'ctr'))}</td>
                    <td className="px-3 py-3 text-right">{formatMoney(pick(row, 'cpc'), currency)}</td>
                    <td className="px-3 py-3 text-right">{formatMoney(pick(row, 'cpm'), currency)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="mt-6 grid gap-4 xl:grid-cols-2">
        <div className="rounded-2xl border border-slate-100 p-4 dark:border-slate-800">
          <div className="text-sm font-bold text-slate-800 dark:text-slate-100">Top ad sets</div>
          <div className="mt-4 overflow-x-auto">
            <table className="min-w-[720px] text-left text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-[11px] uppercase tracking-wide text-slate-400 dark:border-slate-800">
                  <th className="px-3 py-3">Ad set</th>
                  <th className="px-3 py-3 text-right">Spend</th>
                  <th className="px-3 py-3 text-right">Clicks</th>
                  <th className="px-3 py-3 text-right">CTR</th>
                </tr>
              </thead>
              <tbody>
                {adsets.length === 0 ? (
                  <EmptyRow colSpan={4} text="No ad-set data available." />
                ) : (
                  adsets.map((row, index) => (
                    <tr
                      key={`${textValue(pick(row, 'adset_id'))}-${index}`}
                      className="border-b border-slate-50 last:border-0 dark:border-slate-800/70"
                    >
                      <td className="max-w-[340px] px-3 py-3">
                        <div className="truncate font-semibold text-slate-700 dark:text-slate-200">
                          {textValue(pick(row, 'adset_name')) || textValue(pick(row, 'adset_id'))}
                        </div>
                        <div className="mt-0.5 truncate text-[10px] text-slate-400">
                          {textValue(pick(row, 'campaign_name')) || '—'}
                        </div>
                      </td>
                      <td className="px-3 py-3 text-right font-semibold">
                        {formatMoney(pick(row, 'spend'), currency)}
                      </td>
                      <td className="px-3 py-3 text-right">{formatNumber(pick(row, 'clicks'))}</td>
                      <td className="px-3 py-3 text-right">{formatPercent(pick(row, 'ctr'))}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="rounded-2xl border border-slate-100 p-4 dark:border-slate-800">
          <div className="text-sm font-bold text-slate-800 dark:text-slate-100">Top ads / creatives</div>
          <div className="mt-4 overflow-x-auto">
            <table className="min-w-[720px] text-left text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-[11px] uppercase tracking-wide text-slate-400 dark:border-slate-800">
                  <th className="px-3 py-3">Ad</th>
                  <th className="px-3 py-3 text-right">Spend</th>
                  <th className="px-3 py-3 text-right">Clicks</th>
                  <th className="px-3 py-3 text-right">CTR</th>
                </tr>
              </thead>
              <tbody>
                {ads.length === 0 ? (
                  <EmptyRow colSpan={4} text="No ad-level data available." />
                ) : (
                  ads.map((row, index) => (
                    <tr
                      key={`${textValue(pick(row, 'ad_id'))}-${index}`}
                      className="border-b border-slate-50 last:border-0 dark:border-slate-800/70"
                    >
                      <td className="max-w-[340px] px-3 py-3">
                        <div className="truncate font-semibold text-slate-700 dark:text-slate-200">
                          {textValue(pick(row, 'ad_name')) || textValue(pick(row, 'ad_id'))}
                        </div>
                        <div className="mt-0.5 truncate text-[10px] text-slate-400">
                          {textValue(pick(row, 'adset_name')) || textValue(pick(row, 'campaign_name')) || '—'}
                        </div>
                      </td>
                      <td className="px-3 py-3 text-right font-semibold">
                        {formatMoney(pick(row, 'spend'), currency)}
                      </td>
                      <td className="px-3 py-3 text-right">{formatNumber(pick(row, 'clicks'))}</td>
                      <td className="px-3 py-3 text-right">{formatPercent(pick(row, 'ctr'))}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <div className="mt-6 rounded-2xl border border-slate-100 p-4 dark:border-slate-800">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-sm font-bold text-slate-800 dark:text-slate-100">Top countries</div>
            <div className="mt-1 text-xs text-slate-400">Where Meta spend and traffic are being delivered</div>
          </div>
          <Globe2 size={18} className="text-slate-400" />
        </div>

        <div className="mt-4 overflow-x-auto">
          <table className="min-w-[760px] text-left text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-[11px] uppercase tracking-wide text-slate-400 dark:border-slate-800">
                <th className="px-3 py-3">Country</th>
                <th className="px-3 py-3 text-right">Spend</th>
                <th className="px-3 py-3 text-right">Impressions</th>
                <th className="px-3 py-3 text-right">Reach</th>
                <th className="px-3 py-3 text-right">Clicks</th>
                <th className="px-3 py-3 text-right">CPC</th>
              </tr>
            </thead>
            <tbody>
              {countries.length === 0 ? (
                <EmptyRow colSpan={6} text="No country data available." />
              ) : (
                countries.map((row, index) => (
                  <tr
                    key={`${textValue(pick(row, 'country'))}-${index}`}
                    className="border-b border-slate-50 last:border-0 dark:border-slate-800/70"
                  >
                    <td className="px-3 py-3 font-semibold text-slate-700 dark:text-slate-200">
                      {textValue(pick(row, 'country')) || 'Unknown'}
                    </td>
                    <td className="px-3 py-3 text-right font-semibold">
                      {formatMoney(pick(row, 'spend'), currency)}
                    </td>
                    <td className="px-3 py-3 text-right">{formatNumber(pick(row, 'impressions'))}</td>
                    <td className="px-3 py-3 text-right">{formatNumber(pick(row, 'reach'))}</td>
                    <td className="px-3 py-3 text-right">{formatNumber(pick(row, 'clicks'))}</td>
                    <td className="px-3 py-3 text-right">{formatMoney(pick(row, 'cpc'), currency)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
