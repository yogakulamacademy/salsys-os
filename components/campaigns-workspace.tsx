'use client';

import {
  BarChart3,
  CircleDollarSign,
  Filter,
  Search,
  Target,
  UsersRound,
  X,
} from 'lucide-react';

import {
  useMemo,
  useState,
} from 'react';


export type CampaignWorkspaceRow = {
  id: string;
  externalId: string;

  name: string;
  platform: string;

  spend: number;
  spendCurrency: string;

  impressions: number;
  clicks: number;

  leads: number;
  qualified: number;
  highIntent: number;
  paymentPending: number;
  paid: number;
  enrolled: number;

  revenueInr: number;
  revenueUsd: number;

  cpl:
    | number
    | null;

  cpql:
    | number
    | null;

  cac:
    | number
    | null;

  roas:
    | number
    | null;

  source:
    | 'live'
    | 'mock';
};


type OutcomeFilter =
  | 'all'
  | 'with_leads'
  | 'no_leads'
  | 'qualified'
  | 'enrolled'
  | 'revenue';


type SortMode =
  | 'spend_desc'
  | 'leads_desc'
  | 'qualified_desc'
  | 'enrolled_desc'
  | 'roas_desc'
  | 'cac_asc'
  | 'name';


export function CampaignsWorkspace({
  campaigns,
  mock,
}: {
  campaigns:
    CampaignWorkspaceRow[];
  mock: boolean;
}) {
  const [
    query,
    setQuery,
  ] = useState(
    ''
  );

  const [
    platform,
    setPlatform,
  ] = useState(
    'all'
  );

  const [
    outcome,
    setOutcome,
  ] = useState<OutcomeFilter>(
    'all'
  );

  const [
    sortMode,
    setSortMode,
  ] = useState<SortMode>(
    'spend_desc'
  );

  const platforms =
    useMemo(
      () =>
        Array.from(
          new Set(
            campaigns
              .map(
                (
                  row
                ) =>
                  row.platform
              )
              .filter(
                Boolean
              )
          )
        ).sort(),
      [
        campaigns,
      ]
    );

  const filtered =
    useMemo(
      () => {
        const needle =
          query
            .trim()
            .toLowerCase();

        const result =
          campaigns.filter(
            (
              campaign
            ) => {
              if (
                platform !==
                  'all' &&
                campaign.platform !==
                  platform
              ) {
                return false;
              }

              if (
                outcome ===
                  'with_leads' &&
                campaign.leads <=
                  0
              ) {
                return false;
              }

              if (
                outcome ===
                  'no_leads' &&
                campaign.leads >
                  0
              ) {
                return false;
              }

              if (
                outcome ===
                  'qualified' &&
                campaign.qualified <=
                  0
              ) {
                return false;
              }

              if (
                outcome ===
                  'enrolled' &&
                campaign.enrolled <=
                  0
              ) {
                return false;
              }

              if (
                outcome ===
                  'revenue' &&
                campaign.revenueInr <=
                  0 &&
                campaign.revenueUsd <=
                  0
              ) {
                return false;
              }

              if (
                !needle
              ) {
                return true;
              }

              return [
                campaign.name,
                campaign.externalId,
                campaign.platform,
              ]
                .join(
                  ' '
                )
                .toLowerCase()
                .includes(
                  needle
                );
            }
          );

        return [
          ...result,
        ].sort(
          (
            a,
            b
          ) => {
            if (
              sortMode ===
              'name'
            ) {
              return a.name.localeCompare(
                b.name
              );
            }

            if (
              sortMode ===
              'leads_desc'
            ) {
              return (
                b.leads -
                a.leads
              );
            }

            if (
              sortMode ===
              'qualified_desc'
            ) {
              return (
                b.qualified -
                a.qualified
              );
            }

            if (
              sortMode ===
              'enrolled_desc'
            ) {
              return (
                b.enrolled -
                a.enrolled
              );
            }

            if (
              sortMode ===
              'roas_desc'
            ) {
              return (
                nullableSortNumber(
                  b.roas,
                  -1
                ) -
                nullableSortNumber(
                  a.roas,
                  -1
                )
              );
            }

            if (
              sortMode ===
              'cac_asc'
            ) {
              return (
                nullableSortNumber(
                  a.cac,
                  Number.MAX_SAFE_INTEGER
                ) -
                nullableSortNumber(
                  b.cac,
                  Number.MAX_SAFE_INTEGER
                )
              );
            }

            return (
              b.spend -
              a.spend
            );
          }
        );
      },
      [
        campaigns,
        query,
        platform,
        outcome,
        sortMode,
      ]
    );

  const totals =
    useMemo(
      () => {
        const spendByCurrency =
          new Map<
            string,
            number
          >();

        let leads =
          0;

        let qualified =
          0;

        let enrolled =
          0;

        let clicks =
          0;

        let revenueInr =
          0;

        let revenueUsd =
          0;

        for (
          const campaign
          of filtered
        ) {
          spendByCurrency.set(
            campaign.spendCurrency,
            (
              spendByCurrency.get(
                campaign.spendCurrency
              ) ??
              0
            ) +
              campaign.spend
          );

          clicks +=
            campaign.clicks;

          leads +=
            campaign.leads;

          qualified +=
            campaign.qualified;

          enrolled +=
            campaign.enrolled;

          revenueInr +=
            campaign.revenueInr;

          revenueUsd +=
            campaign.revenueUsd;
        }

        return {
          spendByCurrency,
          clicks,
          leads,
          qualified,
          enrolled,
          revenueInr,
          revenueUsd,
        };
      },
      [
        filtered,
      ]
    );

  const clear =
    () => {
      setQuery(
        ''
      );

      setPlatform(
        'all'
      );

      setOutcome(
        'all'
      );

      setSortMode(
        'spend_desc'
      );
    };

  const filtersActive =
    Boolean(
      query
    ) ||
    platform !==
      'all' ||
    outcome !==
      'all';

  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-6">
        <Metric
          label="Campaigns"
          value={
            filtered.length.toLocaleString(
              'en-IN'
            )
          }
          note={
            mock
              ? 'mock campaign rows'
              : 'live campaign rows'
          }
          icon={
            <Target
              size={18}
            />
          }
        />

        <Metric
          label="Spend"
          value={
            formatCurrencyMap(
              totals.spendByCurrency
            )
          }
          note="selected campaigns"
          icon={
            <CircleDollarSign
              size={18}
            />
          }
        />

        <Metric
          label="Clicks"
          value={
            totals.clicks.toLocaleString(
              'en-IN'
            )
          }
          note="paid-media clicks"
          icon={
            <BarChart3
              size={18}
            />
          }
        />

        <Metric
          label="CRM leads"
          value={
            totals.leads.toLocaleString(
              'en-IN'
            )
          }
          note="deterministically attributed"
          icon={
            <UsersRound
              size={18}
            />
          }
        />

        <Metric
          label="Qualified"
          value={
            totals.qualified.toLocaleString(
              'en-IN'
            )
          }
          note={
            totals.leads >
            0
              ? `${percent(
                  totals.qualified,
                  totals.leads
                )} of attributed leads`
              : 'no attributed leads'
          }
          icon={
            <Filter
              size={18}
            />
          }
        />

        <Metric
          label="Enrolled"
          value={
            totals.enrolled.toLocaleString(
              'en-IN'
            )
          }
          note={
            totals.leads >
            0
              ? `${percent(
                  totals.enrolled,
                  totals.leads
                )} lead → enrolled`
              : 'no attributed leads'
          }
          icon={
            <UsersRound
              size={18}
            />
          }
        />
      </div>

      <section className="card mt-4 overflow-hidden">
        <div className="border-b border-slate-100 p-4">
          <div className="flex flex-wrap items-center gap-2">
            <PlatformButton
              active={
                platform ===
                'all'
              }
              onClick={
                () =>
                  setPlatform(
                    'all'
                  )
              }
              label="All"
              count={
                campaigns.length
              }
            />

            {platforms.map(
              (
                item
              ) => (
                <PlatformButton
                  key={
                    item
                  }
                  active={
                    platform ===
                    item
                  }
                  onClick={
                    () =>
                      setPlatform(
                        item
                      )
                  }
                  label={
                    item
                  }
                  count={
                    campaigns.filter(
                      (
                        campaign
                      ) =>
                        campaign.platform ===
                        item
                    ).length
                  }
                />
              )
            )}
          </div>

          <div className="mt-4 flex flex-col gap-3 xl:flex-row xl:items-center">
            <div className="flex min-w-0 flex-1 items-center rounded-xl border border-slate-200 bg-slate-50 px-3 transition focus-within:border-brand/30 focus-within:bg-white focus-within:ring-4 focus-within:ring-brand/5">
              <Search
                size={15}
                className="shrink-0 text-slate-400"
              />

              <input
                value={
                  query
                }
                onChange={
                  (
                    event
                  ) =>
                    setQuery(
                      event.target.value
                    )
                }
                placeholder="Search campaign name or campaign ID..."
                className="w-full bg-transparent px-2 py-2.5 text-sm outline-none placeholder:text-slate-400"
              />
            </div>

            <select
              value={
                outcome
              }
              onChange={
                (
                  event
                ) =>
                  setOutcome(
                    event.target.value as OutcomeFilter
                  )
              }
              className="input xl:w-[190px]"
            >
              <option value="all">
                All outcomes
              </option>

              <option value="with_leads">
                With CRM leads
              </option>

              <option value="no_leads">
                No attributed leads
              </option>

              <option value="qualified">
                Has qualified leads
              </option>

              <option value="enrolled">
                Has enrollments
              </option>

              <option value="revenue">
                Has CRM revenue
              </option>
            </select>

            <select
              value={
                sortMode
              }
              onChange={
                (
                  event
                ) =>
                  setSortMode(
                    event.target.value as SortMode
                  )
              }
              className="input xl:w-[190px]"
            >
              <option value="spend_desc">
                Highest spend
              </option>

              <option value="leads_desc">
                Most leads
              </option>

              <option value="qualified_desc">
                Most qualified
              </option>

              <option value="enrolled_desc">
                Most enrolled
              </option>

              <option value="roas_desc">
                Highest ROAS
              </option>

              <option value="cac_asc">
                Lowest CAC
              </option>

              <option value="name">
                Campaign A–Z
              </option>
            </select>

            {filtersActive && (
              <button
                type="button"
                onClick={
                  clear
                }
                className="btn-secondary"
              >
                <X
                  size={14}
                />
                Clear
              </button>
            )}
          </div>

          <div className="mt-3 flex flex-wrap items-center justify-between gap-3 text-xs text-slate-500">
            <span>
              <strong className="text-slate-800">
                {
                  filtered.length
                }
              </strong>{' '}
              campaigns shown
            </span>

            <span>
              {mock
                ? 'Mock-data mode'
                : 'Live Google Ads + Meta Ads · rolling 30-day CRM attribution views'}
            </span>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-[1600px] w-full text-left">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50/60 text-[10px] uppercase tracking-[0.1em] text-slate-400">
                <Header>
                  Campaign
                </Header>

                <Header>
                  Platform
                </Header>

                <Header>
                  Spend
                </Header>

                <Header>
                  Clicks
                </Header>

                <Header>
                  Leads
                </Header>

                <Header>
                  Qualified
                </Header>

                <Header>
                  Enrolled
                </Header>

                <Header>
                  CPL
                </Header>

                <Header>
                  CPQL
                </Header>

                <Header>
                  CAC
                </Header>

                <Header>
                  CRM Revenue
                </Header>

                <Header>
                  ROAS
                </Header>

                <Header>
                  Funnel
                </Header>
              </tr>
            </thead>

            <tbody>
              {filtered.length ===
              0 ? (
                <tr>
                  <td
                    colSpan={
                      13
                    }
                    className="px-5 py-14 text-center"
                  >
                    <div className="text-sm font-bold text-slate-700">
                      No campaigns match these filters.
                    </div>

                    <button
                      type="button"
                      onClick={
                        clear
                      }
                      className="mt-2 text-xs font-bold text-brand hover:underline"
                    >
                      Clear filters
                    </button>
                  </td>
                </tr>
              ) : (
                filtered.map(
                  (
                    campaign
                  ) => (
                    <CampaignRow
                      key={
                        campaign.id
                      }
                      campaign={
                        campaign
                      }
                    />
                  )
                )
              )}
            </tbody>
          </table>
        </div>

        <div className="border-t border-slate-100 bg-slate-50/50 px-5 py-3 text-[10px] leading-5 text-slate-400">
          Campaign outcomes are based on deterministic CRM attribution from captured advertising identifiers. Revenue currencies are kept separate. ROAS is shown only when the reporting view provides a valid value, or when INR spend can be compared safely with INR CRM revenue.
        </div>
      </section>
    </>
  );
}


function CampaignRow({
  campaign,
}: {
  campaign:
    CampaignWorkspaceRow;
}) {
  return (
    <tr className="border-b border-slate-100 last:border-0 hover:bg-slate-50/70">
      <td className="max-w-[310px] px-4 py-4">
        <div className="truncate font-semibold text-slate-900">
          {
            campaign.name
          }
        </div>

        <div className="mt-0.5 truncate text-[10px] text-slate-400">
          {
            campaign.externalId
          }
        </div>
      </td>

      <td className="px-4 py-4">
        <span
          className={`rounded-lg px-2 py-1 text-[10px] font-black ${
            campaign.platform
              .toLowerCase()
              .includes(
                'google'
              )
              ? 'bg-blue-50 text-blue-700'
              : 'bg-violet-50 text-violet-700'
          }`}
        >
          {
            campaign.platform
          }
        </span>
      </td>

      <td className="px-4 py-4 text-sm font-bold text-slate-800">
        {formatMoney(
          campaign.spend,
          campaign.spendCurrency
        )}
      </td>

      <td className="px-4 py-4 text-sm text-slate-700">
        {campaign.clicks.toLocaleString(
          'en-IN'
        )}
      </td>

      <td className="px-4 py-4">
        <CountWithRate
          count={
            campaign.leads
          }
          rate={
            campaign.clicks >
            0
              ? percent(
                  campaign.leads,
                  campaign.clicks
                )
              : null
          }
          label="click → lead"
        />
      </td>

      <td className="px-4 py-4">
        <CountWithRate
          count={
            campaign.qualified
          }
          rate={
            campaign.leads >
            0
              ? percent(
                  campaign.qualified,
                  campaign.leads
                )
              : null
          }
          label="of leads"
        />
      </td>

      <td className="px-4 py-4">
        <CountWithRate
          count={
            campaign.enrolled
          }
          rate={
            campaign.leads >
            0
              ? percent(
                  campaign.enrolled,
                  campaign.leads
                )
              : null
          }
          label="of leads"
        />
      </td>

      <td className="px-4 py-4 text-sm text-slate-700">
        {formatNullableMoney(
          campaign.cpl,
          campaign.spendCurrency
        )}
      </td>

      <td className="px-4 py-4 text-sm text-slate-700">
        {formatNullableMoney(
          campaign.cpql,
          campaign.spendCurrency
        )}
      </td>

      <td className="px-4 py-4 text-sm font-semibold text-slate-700">
        {formatNullableMoney(
          campaign.cac,
          campaign.spendCurrency
        )}
      </td>

      <td className="px-4 py-4">
        <div className="text-sm font-bold text-slate-800">
          {formatMoney(
            campaign.revenueInr,
            'INR'
          )}
        </div>

        {campaign.revenueUsd >
          0 && (
          <div className="mt-0.5 text-[10px] font-semibold text-slate-400">
            {formatMoney(
              campaign.revenueUsd,
              'USD'
            )}
          </div>
        )}
      </td>

      <td className="px-4 py-4">
        {campaign.roas ==
        null ? (
          <span className="text-xs text-slate-400">
            —
          </span>
        ) : (
          <span
            className={`text-sm font-black ${
              campaign.roas >=
              1
                ? 'text-emerald-600'
                : 'text-amber-600'
            }`}
          >
            {campaign.roas.toFixed(
              2
            )}
            ×
          </span>
        )}
      </td>

      <td className="px-4 py-4">
        <div className="flex min-w-[180px] flex-wrap gap-1">
          <MiniPill
            label="HI"
            value={
              campaign.highIntent
            }
          />

          <MiniPill
            label="Pay"
            value={
              campaign.paymentPending
            }
          />

          <MiniPill
            label="Paid"
            value={
              campaign.paid
            }
          />
        </div>
      </td>
    </tr>
  );
}


function Metric({
  label,
  value,
  note,
  icon,
}: {
  label: string;
  value: string;
  note: string;
  icon:
    React.ReactNode;
}) {
  return (
    <div className="card-pad transition hover:-translate-y-0.5 hover:shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <div className="text-xs font-bold uppercase tracking-[.08em] text-slate-400">
          {
            label
          }
        </div>

        <span className="text-slate-400">
          {
            icon
          }
        </span>
      </div>

      <div className="mt-2 text-xl font-black text-slate-950">
        {
          value
        }
      </div>

      <div className="mt-1 text-[10px] text-slate-400">
        {
          note
        }
      </div>
    </div>
  );
}


function PlatformButton({
  active,
  onClick,
  label,
  count,
}: {
  active: boolean;
  onClick:
    () => void;
  label: string;
  count: number;
}) {
  return (
    <button
      type="button"
      onClick={
        onClick
      }
      className={`inline-flex items-center gap-1.5 rounded-xl border px-3 py-2 text-xs font-bold transition ${
        active
          ? 'border-brand/20 bg-brand/[0.06] text-brand shadow-sm'
          : 'border-slate-200 bg-white text-slate-500 hover:border-slate-300 hover:text-slate-800'
      }`}
    >
      {
        label
      }

      <span
        className={`rounded-full px-1.5 py-0.5 text-[9px] font-black ${
          active
            ? 'bg-white text-brand'
            : 'bg-slate-100 text-slate-500'
        }`}
      >
        {
          count
        }
      </span>
    </button>
  );
}


function Header({
  children,
}: {
  children:
    React.ReactNode;
}) {
  return (
    <th className="px-4 py-3 font-bold">
      {
        children
      }
    </th>
  );
}


function CountWithRate({
  count,
  rate,
  label,
}: {
  count: number;
  rate:
    | string
    | null;
  label: string;
}) {
  return (
    <div>
      <div className="text-sm font-bold text-slate-800">
        {count.toLocaleString(
          'en-IN'
        )}
      </div>

      {rate && (
        <div className="mt-0.5 text-[9px] font-semibold text-slate-400">
          {rate}{' '}
          {
            label
          }
        </div>
      )}
    </div>
  );
}


function MiniPill({
  label,
  value,
}: {
  label: string;
  value: number;
}) {
  return (
    <span className="rounded-md bg-slate-100 px-1.5 py-1 text-[8px] font-black text-slate-600">
      {label}{' '}
      {
        value
      }
    </span>
  );
}


function percent(
  numerator: number,
  denominator: number
) {
  if (
    denominator <=
    0
  ) {
    return '0%';
  }

  return `${(
    (
      numerator /
      denominator
    ) *
    100
  ).toFixed(
    1
  )}%`;
}


function nullableSortNumber(
  value:
    | number
    | null,
  fallback: number
) {
  return value ==
    null
    ? fallback
    : value;
}


function formatNullableMoney(
  value:
    | number
    | null,
  currency: string
) {
  if (
    value ==
    null ||
    !Number.isFinite(
      value
    )
  ) {
    return '—';
  }

  return formatMoney(
    value,
    currency
  );
}


function formatMoney(
  value: number,
  currency: string
) {
  const safe =
    Number.isFinite(
      value
    )
      ? value
      : 0;

  try {
    return new Intl.NumberFormat(
      currency ===
        'INR'
        ? 'en-IN'
        : 'en-US',
      {
        style:
          'currency',
        currency:
          currency ||
          'INR',
        maximumFractionDigits:
          safe >=
          1000
            ? 0
            : 2,
      }
    ).format(
      safe
    );
  } catch {
    return `${currency} ${safe.toLocaleString(
      'en-IN'
    )}`;
  }
}


function formatCurrencyMap(
  values:
    Map<
      string,
      number
    >
) {
  const entries =
    [
      ...values.entries(),
    ].filter(
      (
        [
          ,
          amount,
        ]
      ) =>
        amount !==
        0
    );

  if (
    entries.length ===
    0
  ) {
    return '₹0';
  }

  return entries
    .map(
      (
        [
          currency,
          amount,
        ]
      ) =>
        formatMoney(
          amount,
          currency
        )
    )
    .join(
      ' · '
    );
}
