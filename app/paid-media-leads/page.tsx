import Link from 'next/link';

import {
  ArrowRight,
  BadgeIndianRupee,
  CircleDollarSign,
  Filter,
  Flame,
  Search,
  Target,
  Users,
} from 'lucide-react';

import { PageHeader } from '@/components/ui';
import { createClient } from '@/lib/supabase/server';

type SearchParams = {
  q?: string | string[];
  platform?: string | string[];
  stage?: string | string[];
  temperature?: string | string[];
  payment?: string | string[];
  match?: string | string[];
  course?: string | string[];
  country?: string | string[];
  campaign?: string | string[];
  from?: string | string[];
  to?: string | string[];
  page?: string | string[];
};

type PaidLead = {
  lead_id: string;
  lead_code: string | null;
  lead_name: string | null;
  email: string | null;
  phone: string | null;

  platform: string | null;
  platform_label: string | null;

  campaign_id: string | null;
  campaign_name: string | null;

  ad_group_or_adset_id: string | null;
  group_type: string | null;
  ad_id: string | null;

  current_stage: string | null;
  behaviour_temperature: string | null;
  engagement_score: number | string | null;
  is_reengaged: boolean | null;

  payment_status: string | null;
  revenue_inr: number | string | null;
  revenue_usd: number | string | null;
  has_payment: boolean | null;
  is_enrolled: boolean | null;

  allocated_acquisition_cost: number | string | null;
  acquisition_currency: string | null;
  acquisition_cost_method: string | null;

  campaign_spend_30d: number | string | null;
  campaign_crm_leads_30d: number | string | null;
  campaign_roas_30d: number | string | null;
  campaign_matched: boolean | null;

  course_name: string | null;
  course_code: string | null;

  country: string | null;
  region: string | null;
  city: string | null;

  preferred_location: string | null;
  preferred_month: string | null;
  preferred_mode: string | null;

  first_paid_touch_at: string | null;
  landing_page: string | null;

  gclid: string | null;
  fbclid: string | null;
};

type Overview = {
  paid_media_leads: number | string | null;
  google_leads: number | string | null;
  instagram_leads: number | string | null;
  facebook_leads: number | string | null;
  meta_unspecified_leads: number | string | null;
  qualified_leads: number | string | null;
  hot_leads: number | string | null;
  paid_leads: number | string | null;
  enrolled_leads: number | string | null;
  campaign_matched_leads: number | string | null;
  leads_with_allocated_cost: number | string | null;
  revenue_inr: number | string | null;
  revenue_usd: number | string | null;
};

const PAGE_SIZE = 50;

export default async function PaidMediaLeadsPage({
  searchParams,
}: {
  searchParams?: Promise<SearchParams>;
}) {
  const resolved =
    searchParams instanceof Promise
      ? await searchParams
      : searchParams ?? {};

  const q = one(resolved.q);
  const platform = one(resolved.platform);
  const stage = one(resolved.stage);
  const temperature = one(resolved.temperature);
  const payment = one(resolved.payment);
  const match = one(resolved.match);
  const course = one(resolved.course);
  const country = one(resolved.country);
  const campaign = one(resolved.campaign);
  const from = one(resolved.from);
  const to = one(resolved.to);

  const page = Math.max(
    1,
    Number(one(resolved.page) || 1)
  );

  const supabase = await createClient();

  const overviewResult = await supabase
    .from('v_paid_media_leads_overview')
    .select('*')
    .maybeSingle();

  if (overviewResult.error) {
    throw new Error(
      `Unable to load paid-media overview: ${overviewResult.error.message}`
    );
  }

  let query = supabase
    .from('v_paid_media_leads_ui')
    .select('*', { count: 'exact' });

  if (platform && platform !== 'all') {
    query = query.eq('platform', platform);
  }

  if (stage && stage !== 'all') {
    query = query.eq('current_stage', stage);
  }

  if (temperature && temperature !== 'all') {
    query = query.eq(
      'behaviour_temperature',
      temperature
    );
  }

  if (payment && payment !== 'all') {
    query = query.eq('payment_status', payment);
  }

  if (match === 'matched') {
    query = query.eq('campaign_matched', true);
  } else if (match === 'unmatched') {
    query = query.eq('campaign_matched', false);
  }

  if (course) {
    query = query.ilike(
      'course_name',
      `%${safeSearch(course)}%`
    );
  }

  if (country) {
    query = query.ilike(
      'country',
      `%${safeSearch(country)}%`
    );
  }

  if (campaign) {
    query = query.ilike(
      'campaign_name',
      `%${safeSearch(campaign)}%`
    );
  }

  if (from) {
    query = query.gte(
      'first_paid_touch_at',
      `${from}T00:00:00`
    );
  }

  if (to) {
    query = query.lte(
      'first_paid_touch_at',
      `${to}T23:59:59.999`
    );
  }

  if (q) {
    const s = safeOrSearch(q);

    query = query.or(
      [
        `lead_name.ilike.%${s}%`,
        `lead_code.ilike.%${s}%`,
        `campaign_name.ilike.%${s}%`,
        `course_name.ilike.%${s}%`,
        `email.ilike.%${s}%`,
        `phone.ilike.%${s}%`,
      ].join(',')
    );
  }

  const fromIndex = (page - 1) * PAGE_SIZE;
  const toIndex = fromIndex + PAGE_SIZE - 1;

  const leadsResult = await query
    .order('first_paid_touch_at', {
      ascending: false,
      nullsFirst: false,
    })
    .range(fromIndex, toIndex);

  if (leadsResult.error) {
    throw new Error(
      `Unable to load paid-media leads: ${leadsResult.error.message}`
    );
  }

  const overview =
    (overviewResult.data ?? {}) as Overview;

  const leads =
    (leadsResult.data ?? []) as PaidLead[];

  const total =
    leadsResult.count ?? leads.length;

  const totalPages = Math.max(
    1,
    Math.ceil(total / PAGE_SIZE)
  );

  const metaTotal =
    toNumber(overview.instagram_leads) +
    toNumber(overview.facebook_leads) +
    toNumber(overview.meta_unspecified_leads);

  return (
    <>
      <PageHeader
        title="Paid Media Leads"
        description="Individual Google, Facebook, Instagram and Meta leads connected to campaign attribution, CRM stage, payments, enrollment, revenue and allocated acquisition cost."
      />

      <section className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
        <SummaryCard
          icon={<Users size={17} />}
          label="Paid media leads"
          value={formatNumber(
            overview.paid_media_leads
          )}
          sub={`${formatNumber(
            overview.qualified_leads
          )} qualified`}
        />

        <SummaryCard
          icon={<Target size={17} />}
          label="Google Ads"
          value={formatNumber(
            overview.google_leads
          )}
          sub="Attributed leads"
        />

        <SummaryCard
          icon={<Target size={17} />}
          label="Meta Ads"
          value={formatNumber(metaTotal)}
          sub="Facebook + Instagram + Meta"
        />

        <SummaryCard
          icon={<Flame size={17} />}
          label="Hot leads"
          value={formatNumber(
            overview.hot_leads
          )}
          sub={`${formatNumber(
            overview.paid_leads
          )} with payment`}
        />

        <SummaryCard
          icon={<BadgeIndianRupee size={17} />}
          label="Revenue · INR"
          value={formatMoney(
            overview.revenue_inr,
            'INR'
          )}
          sub={`${formatNumber(
            overview.enrolled_leads
          )} enrolled`}
        />

        <SummaryCard
          icon={<CircleDollarSign size={17} />}
          label="Revenue · USD"
          value={formatMoney(
            overview.revenue_usd,
            'USD'
          )}
          sub={`${formatNumber(
            overview.campaign_matched_leads
          )} campaign-matched`}
        />
      </section>

      <section className="card-pad mt-4">
        <div className="flex items-center gap-2">
          <Filter size={16} className="text-slate-400" />
          <div className="section-title">
            Filters
          </div>
        </div>

        <form
          method="get"
          className="mt-4 grid gap-3 lg:grid-cols-4 xl:grid-cols-6"
        >
          <div className="lg:col-span-2">
            <label className="mb-1 block text-xs font-semibold text-slate-500">
              Search
            </label>
            <div className="relative">
              <Search
                size={15}
                className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
              />
              <input
                name="q"
                defaultValue={q}
                placeholder="Lead, email, campaign, course..."
                className="input pl-9"
              />
            </div>
          </div>

          <FilterSelect
            name="platform"
            label="Platform"
            value={platform || 'all'}
            options={[
              ['all', 'All platforms'],
              ['google', 'Google Ads'],
              ['instagram', 'Instagram Ads'],
              ['facebook', 'Facebook Ads'],
              ['meta', 'Meta Ads'],
            ]}
          />

          <FilterSelect
            name="stage"
            label="Stage"
            value={stage || 'all'}
            options={[
              ['all', 'All stages'],
              ['new', 'New'],
              ['contacted', 'Contacted'],
              ['engaged', 'Engaged'],
              ['qualified', 'Qualified'],
              ['high_intent', 'High intent'],
              ['payment_pending', 'Payment pending'],
              ['enrolled', 'Enrolled'],
              ['nurture', 'Nurture'],
              ['not_now', 'Not now'],
              ['lost', 'Lost'],
            ]}
          />

          <FilterSelect
            name="temperature"
            label="Temperature"
            value={temperature || 'all'}
            options={[
              ['all', 'All temperatures'],
              ['hot', 'Hot'],
              ['warm', 'Warm'],
              ['cold', 'Cold'],
              ['closed', 'Closed'],
            ]}
          />

          <FilterSelect
            name="payment"
            label="Payment"
            value={payment || 'all'}
            options={[
              ['all', 'All payment states'],
              ['unvalued', 'Unvalued'],
              ['unpaid', 'Unpaid'],
              ['partially_paid', 'Partially paid'],
              ['paid', 'Paid'],
            ]}
          />

          <TextFilter
            name="course"
            label="Course"
            value={course}
            placeholder="200-Hour..."
          />

          <TextFilter
            name="country"
            label="Country"
            value={country}
            placeholder="Germany..."
          />

          <TextFilter
            name="campaign"
            label="Campaign"
            value={campaign}
            placeholder="Campaign name..."
          />

          <FilterSelect
            name="match"
            label="Campaign match"
            value={match || 'all'}
            options={[
              ['all', 'All'],
              ['matched', 'Matched'],
              ['unmatched', 'Unmatched'],
            ]}
          />

          <TextFilter
            name="from"
            label="From"
            value={from}
            type="date"
          />

          <TextFilter
            name="to"
            label="To"
            value={to}
            type="date"
          />

          <div className="flex items-end gap-2 lg:col-span-2">
            <button
              type="submit"
              className="btn-primary"
            >
              Apply filters
            </button>

            <Link
              href="/paid-media-leads"
              className="btn-secondary"
            >
              Reset
            </Link>
          </div>
        </form>
      </section>

      <section className="card-pad mt-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="eyebrow">
              Individual acquisition records
            </div>
            <div className="section-title mt-1">
              {formatNumber(total)} paid-media leads
            </div>
          </div>

          <div className="text-xs text-slate-400">
            Page {page} of {totalPages}
          </div>
        </div>

        <div className="mt-4 overflow-x-auto">
          <table className="min-w-[1500px] text-left text-xs">
            <thead>
              <tr className="border-b border-slate-100 uppercase tracking-wide text-slate-400">
                <th className="px-3 py-2.5">Lead</th>
                <th className="px-3 py-2.5">Platform</th>
                <th className="px-3 py-2.5">Course</th>
                <th className="px-3 py-2.5">Campaign</th>
                <th className="px-3 py-2.5">Stage</th>
                <th className="px-3 py-2.5">Temperature</th>
                <th className="px-3 py-2.5">Payment</th>
                <th className="px-3 py-2.5 text-right">Revenue</th>
                <th className="px-3 py-2.5 text-right">Allocated cost</th>
                <th className="px-3 py-2.5">Country</th>
                <th className="px-3 py-2.5">First paid visit</th>
                <th className="px-3 py-2.5">Match</th>
                <th className="px-3 py-2.5"></th>
              </tr>
            </thead>

            <tbody>
              {leads.length === 0 ? (
                <tr>
                  <td
                    colSpan={13}
                    className="px-3 py-10 text-center text-sm text-slate-400"
                  >
                    No paid-media leads match these filters.
                  </td>
                </tr>
              ) : (
                leads.map((lead) => (
                  <tr
                    key={lead.lead_id}
                    className="border-b border-slate-50 last:border-0"
                  >
                    <td className="px-3 py-3">
                      <div className="font-semibold text-slate-800">
                        {lead.lead_name || lead.lead_code || 'Lead'}
                      </div>
                      <div className="mt-0.5 text-[10px] text-slate-400">
                        {lead.lead_code || '—'}
                        {lead.email
                          ? ` · ${lead.email}`
                          : ''}
                      </div>
                    </td>

                    <td className="px-3 py-3">
                      <PlatformBadge
                        platform={lead.platform}
                        label={lead.platform_label}
                      />
                    </td>

                    <td className="max-w-[220px] px-3 py-3 text-slate-600">
                      <div className="truncate">
                        {lead.course_name || '—'}
                      </div>
                      {lead.preferred_location && (
                        <div className="mt-0.5 text-[10px] text-slate-400">
                          {lead.preferred_location}
                        </div>
                      )}
                    </td>

                    <td className="max-w-[300px] px-3 py-3">
                      <div className="truncate font-medium text-slate-700">
                        {lead.campaign_name || '—'}
                      </div>
                      <div className="mt-0.5 truncate text-[10px] text-slate-400">
                        {lead.campaign_id || 'No campaign ID'}
                      </div>
                    </td>

                    <td className="px-3 py-3">
                      <span className="capitalize text-slate-600">
                        {pretty(lead.current_stage || '—')}
                      </span>
                    </td>

                    <td className="px-3 py-3">
                      <TemperatureBadge
                        value={lead.behaviour_temperature}
                      />
                    </td>

                    <td className="px-3 py-3">
                      <PaymentBadge
                        value={lead.payment_status}
                      />
                    </td>

                    <td className="px-3 py-3 text-right">
                      <RevenueCell
                        inr={lead.revenue_inr}
                        usd={lead.revenue_usd}
                      />
                    </td>

                    <td className="px-3 py-3 text-right">
                      {lead.allocated_acquisition_cost == null ? (
                        <span className="text-slate-400">
                          —
                        </span>
                      ) : (
                        <div>
                          <div className="font-semibold text-slate-700">
                            {formatMoney(
                              lead.allocated_acquisition_cost,
                              lead.acquisition_currency || 'INR'
                            )}
                          </div>
                          <div className="mt-0.5 text-[10px] text-slate-400">
                            Campaign CPL allocation
                          </div>
                        </div>
                      )}
                    </td>

                    <td className="px-3 py-3 text-slate-600">
                      {lead.country || '—'}
                    </td>

                    <td className="px-3 py-3 text-slate-500">
                      {formatDateTime(
                        lead.first_paid_touch_at
                      )}
                    </td>

                    <td className="px-3 py-3">
                      {lead.campaign_matched ? (
                        <span className="inline-flex rounded-full bg-emerald-50 px-2 py-1 text-[10px] font-bold text-emerald-700">
                          Matched
                        </span>
                      ) : (
                        <span className="inline-flex rounded-full bg-slate-100 px-2 py-1 text-[10px] font-bold text-slate-500">
                          Unmatched
                        </span>
                      )}
                    </td>

                    <td className="px-3 py-3 text-right">
                      <Link
                        href={`/leads/${lead.lead_id}`}
                        className="inline-flex items-center gap-1 font-bold text-brand"
                      >
                        View
                        <ArrowRight size={13} />
                      </Link>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <div className="mt-4 flex items-center justify-between gap-3 border-t border-slate-100 pt-4">
          <div className="text-xs text-slate-400">
            Showing{' '}
            {total === 0 ? 0 : fromIndex + 1}
            {'–'}
            {Math.min(toIndex + 1, total)}
            {' of '}
            {formatNumber(total)}
          </div>

          <div className="flex items-center gap-2">
            {page > 1 && (
              <Link
                href={pageHref(resolved, page - 1)}
                className="btn-secondary"
              >
                Previous
              </Link>
            )}

            {page < totalPages && (
              <Link
                href={pageHref(resolved, page + 1)}
                className="btn-secondary"
              >
                Next
              </Link>
            )}
          </div>
        </div>
      </section>
    </>
  );
}

function SummaryCard({
  icon,
  label,
  value,
  sub,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  sub: string;
}) {
  return (
    <div className="rounded-xl border border-slate-100 bg-white p-4">
      <div className="flex items-center gap-2 text-xs font-semibold text-slate-400">
        {icon}
        {label}
      </div>

      <div className="mt-2 text-xl font-bold text-slate-800">
        {value}
      </div>

      <div className="mt-1 text-[11px] text-slate-400">
        {sub}
      </div>
    </div>
  );
}

function FilterSelect({
  name,
  label,
  value,
  options,
}: {
  name: string;
  label: string;
  value: string;
  options: Array<[string, string]>;
}) {
  return (
    <div>
      <label className="mb-1 block text-xs font-semibold text-slate-500">
        {label}
      </label>

      <select
        name={name}
        defaultValue={value}
        className="input"
      >
        {options.map(([optionValue, optionLabel]) => (
          <option
            key={optionValue}
            value={optionValue}
          >
            {optionLabel}
          </option>
        ))}
      </select>
    </div>
  );
}

function TextFilter({
  name,
  label,
  value,
  placeholder,
  type = 'text',
}: {
  name: string;
  label: string;
  value: string;
  placeholder?: string;
  type?: string;
}) {
  return (
    <div>
      <label className="mb-1 block text-xs font-semibold text-slate-500">
        {label}
      </label>

      <input
        type={type}
        name={name}
        defaultValue={value}
        placeholder={placeholder}
        className="input"
      />
    </div>
  );
}

function PlatformBadge({
  platform,
  label,
}: {
  platform: string | null;
  label: string | null;
}) {
  const key = platform || 'paid';

  const classes: Record<string, string> = {
    google:
      'bg-blue-50 text-blue-700',
    instagram:
      'bg-fuchsia-50 text-fuchsia-700',
    facebook:
      'bg-indigo-50 text-indigo-700',
    meta:
      'bg-violet-50 text-violet-700',
  };

  return (
    <span
      className={`inline-flex rounded-full px-2 py-1 text-[10px] font-bold ${
        classes[key] || 'bg-slate-100 text-slate-600'
      }`}
    >
      {label || 'Paid Media'}
    </span>
  );
}

function TemperatureBadge({
  value,
}: {
  value: string | null;
}) {
  const key = value || 'unknown';

  const classes: Record<string, string> = {
    hot:
      'bg-red-50 text-red-700',
    warm:
      'bg-orange-50 text-orange-700',
    cold:
      'bg-sky-50 text-sky-700',
    closed:
      'bg-slate-100 text-slate-600',
  };

  return (
    <span
      className={`inline-flex rounded-full px-2 py-1 text-[10px] font-bold capitalize ${
        classes[key] || 'bg-slate-100 text-slate-500'
      }`}
    >
      {pretty(key)}
    </span>
  );
}

function PaymentBadge({
  value,
}: {
  value: string | null;
}) {
  const key = value || 'unvalued';

  const classes: Record<string, string> = {
    paid:
      'bg-emerald-50 text-emerald-700',
    partially_paid:
      'bg-amber-50 text-amber-700',
    unpaid:
      'bg-red-50 text-red-700',
    unvalued:
      'bg-slate-100 text-slate-500',
  };

  return (
    <span
      className={`inline-flex rounded-full px-2 py-1 text-[10px] font-bold ${
        classes[key] || 'bg-slate-100 text-slate-500'
      }`}
    >
      {pretty(key)}
    </span>
  );
}

function RevenueCell({
  inr,
  usd,
}: {
  inr: number | string | null;
  usd: number | string | null;
}) {
  const inrValue = toNumber(inr);
  const usdValue = toNumber(usd);

  if (inrValue <= 0 && usdValue <= 0) {
    return (
      <span className="text-slate-400">
        —
      </span>
    );
  }

  return (
    <div className="space-y-0.5">
      {inrValue > 0 && (
        <div className="font-semibold text-slate-700">
          {formatMoney(inrValue, 'INR')}
        </div>
      )}
      {usdValue > 0 && (
        <div className="font-semibold text-slate-700">
          {formatMoney(usdValue, 'USD')}
        </div>
      )}
    </div>
  );
}

function one(
  value: string | string[] | undefined
) {
  if (Array.isArray(value)) {
    return value[0] ?? '';
  }

  return value ?? '';
}

function safeSearch(value: string) {
  return value
    .replaceAll('%', '')
    .replaceAll('*', '')
    .trim();
}

function safeOrSearch(value: string) {
  return safeSearch(value)
    .replaceAll(',', ' ')
    .replaceAll('(', ' ')
    .replaceAll(')', ' ');
}

function toNumber(
  value: number | string | null | undefined
) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed)
    ? parsed
    : 0;
}

function formatNumber(
  value: number | string | null | undefined
) {
  return new Intl.NumberFormat('en-IN', {
    maximumFractionDigits: 0,
  }).format(toNumber(value));
}

function formatMoney(
  value: number | string | null | undefined,
  currency: string
) {
  try {
    return new Intl.NumberFormat(
      currency === 'INR'
        ? 'en-IN'
        : 'en-US',
      {
        style: 'currency',
        currency,
        maximumFractionDigits: 2,
      }
    ).format(toNumber(value));
  } catch {
    return `${currency} ${toNumber(value).toFixed(2)}`;
  }
}

function formatDateTime(
  value: string | null | undefined
) {
  if (!value) return '—';

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

function pretty(value: string) {
  if (!value || value === '—') {
    return value || '—';
  }

  return value
    .replaceAll('_', ' ')
    .replace(/\b\w/g, (letter) =>
      letter.toUpperCase()
    );
}

function pageHref(
  params: SearchParams,
  page: number
) {
  const next =
    new URLSearchParams();

  for (const [key, raw] of Object.entries(params)) {
    if (key === 'page') continue;

    const value = one(raw);

    if (value) {
      next.set(key, value);
    }
  }

  next.set(
    'page',
    String(page)
  );

  return `/paid-media-leads?${next.toString()}`;
}
