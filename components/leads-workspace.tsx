'use client';

import Link from 'next/link';

import {
  AlertTriangle,
  ArrowUpRight,
  CalendarClock,
  CircleDollarSign,
  Clock3,
  Filter,
  Search,
  SlidersHorizontal,
  UserRoundCheck,
  UserRoundX,
  X,
} from 'lucide-react';

import {
  useMemo,
  useState,
} from 'react';

import type {
  LeadOverview,
} from '@/types/crm';

import {
  ChannelBadge,
  IntentLabel,
  StageBadge,
} from '@/components/ui';


export type LeadListIntelligence = {
  lead_id: string;

  owner_user_id:
    | string
    | null;

  owner_name:
    | string
    | null;

  aging_status:
    | 'healthy'
    | 'warning'
    | 'stuck'
    | 'untracked'
    | null;

  stage_entered_at:
    | string
    | null;

  stage_age_hours:
    | number
    | string
    | null;

  stage_age_days:
    | number
    | string
    | null;

  warning_after_days:
    | number
    | string
    | null;

  stuck_after_days:
    | number
    | string
    | null;

  days_over_stuck_threshold:
    | number
    | string
    | null;

  days_since_last_contact:
    | number
    | string
    | null;

  preferred_batch_id:
    | string
    | null;

  batch_code:
    | string
    | null;

  batch_location:
    | string
    | null;

  batch_start_date:
    | string
    | null;

  batch_end_date:
    | string
    | null;
};


type EnrichedLead = {
  lead: LeadOverview;
  intel:
    | LeadListIntelligence
    | null;
};


type QuickView =
  | 'all'
  | 'mine'
  | 'unassigned'
  | 'stuck'
  | 'followup_overdue'
  | 'payment_pending';


type SortMode =
  | 'name'
  | 'stage_age_desc'
  | 'followup_asc';


export function LeadsWorkspace({
  leads,
  intelligence,
  mock,
}: {
  leads: LeadOverview[];
  intelligence: LeadListIntelligence[];
  mock: boolean;
}) {
  const [
    query,
    setQuery,
  ] = useState(
    ''
  );

  const [
    stage,
    setStage,
  ] = useState(
    'all'
  );

  const [
    source,
    setSource,
  ] = useState(
    'all'
  );

  const [
    channel,
    setChannel,
  ] = useState(
    'all'
  );

  const [
    owner,
    setOwner,
  ] = useState(
    'all'
  );

  const [
    course,
    setCourse,
  ] = useState(
    'all'
  );

  const [
    aging,
    setAging,
  ] = useState(
    'all'
  );

  const [
    quickView,
    setQuickView,
  ] = useState<QuickView>(
    'all'
  );

  const [
    sortMode,
    setSortMode,
  ] = useState<SortMode>(
    'stage_age_desc'
  );

  const [
    showMoreFilters,
    setShowMoreFilters,
  ] = useState(
    false
  );

  const intelligenceByLead =
    useMemo(
      () =>
        new Map(
          intelligence.map(
            (
              row
            ) => [
              row.lead_id,
              row,
            ]
          )
        ),
      [
        intelligence,
      ]
    );

  const enriched =
    useMemo<EnrichedLead[]>(
      () =>
        leads.map(
          (
            lead
          ) => ({
            lead,
            intel:
              intelligenceByLead.get(
                lead.id
              ) ??
              null,
          })
        ),
      [
        leads,
        intelligenceByLead,
      ]
    );

  const now =
    Date.now();

  const stages =
    useMemo(
      () =>
        uniqueSorted(
          leads.map(
            (
              lead
            ) =>
              lead.stage
          )
        ),
      [
        leads,
      ]
    );

  const sources =
    useMemo(
      () =>
        uniqueSorted(
          leads.map(
            (
              lead
            ) =>
              lead.firstTouchSource ||
              ''
          )
        ),
      [
        leads,
      ]
    );

  const channels =
    useMemo(
      () =>
        uniqueSorted(
          leads.map(
            (
              lead
            ) =>
              lead.currentContactChannel ||
              ''
          )
        ),
      [
        leads,
      ]
    );

  const owners =
    useMemo(
      () =>
        uniqueSorted(
          intelligence.map(
            (
              row
            ) =>
              row.owner_name ||
              ''
          )
        ),
      [
        intelligence,
      ]
    );

  const courses =
    useMemo(
      () =>
        uniqueSorted(
          leads.map(
            (
              lead
            ) =>
              lead.course ||
              ''
          )
        ),
      [
        leads,
      ]
    );

  const counts =
    useMemo(
      () => ({
        all:
          enriched.length,

        unassigned:
          enriched.filter(
            (
              item
            ) =>
              !item.intel
                ?.owner_user_id
          ).length,

        stuck:
          enriched.filter(
            (
              item
            ) =>
              item.intel
                ?.aging_status ===
              'stuck'
          ).length,

        followupOverdue:
          enriched.filter(
            (
              item
            ) =>
              isOverdue(
                item.lead.nextFollowupAt,
                now
              )
          ).length,

        paymentPending:
          enriched.filter(
            (
              item
            ) =>
              item.lead.stage ===
              'payment_pending'
          ).length,
      }),
      [
        enriched,
        now,
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
          enriched.filter(
            (
              item
            ) => {
              const {
                lead,
                intel,
              } =
                item;

              if (
                stage !==
                  'all' &&
                lead.stage !==
                  stage
              ) {
                return false;
              }

              if (
                source !==
                  'all' &&
                lead.firstTouchSource !==
                  source
              ) {
                return false;
              }

              if (
                channel !==
                  'all' &&
                lead.currentContactChannel !==
                  channel
              ) {
                return false;
              }

              if (
                owner !==
                  'all' &&
                (
                  owner ===
                  '__unassigned__'
                    ? Boolean(
                        intel?.owner_user_id
                      )
                    : intel?.owner_name !==
                      owner
                )
              ) {
                return false;
              }

              if (
                course !==
                  'all' &&
                lead.course !==
                  course
              ) {
                return false;
              }

              if (
                aging !==
                  'all' &&
                (
                  intel?.aging_status ??
                  'untracked'
                ) !==
                  aging
              ) {
                return false;
              }

              if (
                quickView ===
                  'unassigned' &&
                intel?.owner_user_id
              ) {
                return false;
              }

              if (
                quickView ===
                  'stuck' &&
                intel?.aging_status !==
                  'stuck'
              ) {
                return false;
              }

              if (
                quickView ===
                  'followup_overdue' &&
                !isOverdue(
                  lead.nextFollowupAt,
                  now
                )
              ) {
                return false;
              }

              if (
                quickView ===
                  'payment_pending' &&
                lead.stage !==
                  'payment_pending'
              ) {
                return false;
              }

              /*
               * "Mine" requires a user identity mapping in the lead-list
               * payload. Until that is exposed here, keep it disabled in UI.
               */

              if (
                !needle
              ) {
                return true;
              }

              return [
                lead.name,
                lead.leadCode,
                lead.country,
                lead.location,
                lead.course,
                lead.firstTouchSource,
                lead.firstTouchCampaign,
                lead.currentContactChannel,
                intel?.owner_name,
                intel?.batch_code,
                intel?.batch_location,
              ]
                .filter(
                  Boolean
                )
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
              return (
                a.lead.name ||
                ''
              ).localeCompare(
                b.lead.name ||
                ''
              );
            }

            if (
              sortMode ===
              'followup_asc'
            ) {
              return (
                sortableDate(
                  a.lead.nextFollowupAt
                ) -
                sortableDate(
                  b.lead.nextFollowupAt
                )
              );
            }

            return (
              toNumber(
                b.intel
                  ?.stage_age_days
              ) -
              toNumber(
                a.intel
                  ?.stage_age_days
              )
            );
          }
        );
      },
      [
        enriched,
        query,
        stage,
        source,
        channel,
        owner,
        course,
        aging,
        quickView,
        sortMode,
        now,
      ]
    );

  const hasAdvancedFilters =
    stage !==
      'all' ||
    source !==
      'all' ||
    channel !==
      'all' ||
    owner !==
      'all' ||
    course !==
      'all' ||
    aging !==
      'all';

  function resetFilters() {
    setQuery(
      ''
    );

    setStage(
      'all'
    );

    setSource(
      'all'
    );

    setChannel(
      'all'
    );

    setOwner(
      'all'
    );

    setCourse(
      'all'
    );

    setAging(
      'all'
    );

    setQuickView(
      'all'
    );

    setSortMode(
      'stage_age_desc'
    );
  }

  return (
    <div className="card overflow-hidden">
      <div className="border-b border-slate-100 p-4">
        <div className="flex flex-wrap items-center gap-2">
          <QuickViewButton
            active={
              quickView ===
              'all'
            }
            onClick={
              () =>
                setQuickView(
                  'all'
                )
            }
            label="All leads"
            count={
              counts.all
            }
          />

          <QuickViewButton
            active={
              quickView ===
              'unassigned'
            }
            onClick={
              () =>
                setQuickView(
                  'unassigned'
                )
            }
            label="Unassigned"
            count={
              counts.unassigned
            }
            icon={
              <UserRoundX
                size={13}
              />
            }
          />

          <QuickViewButton
            active={
              quickView ===
              'stuck'
            }
            onClick={
              () =>
                setQuickView(
                  'stuck'
                )
            }
            label="Stuck"
            count={
              counts.stuck
            }
            icon={
              <AlertTriangle
                size={13}
              />
            }
          />

          <QuickViewButton
            active={
              quickView ===
              'followup_overdue'
            }
            onClick={
              () =>
                setQuickView(
                  'followup_overdue'
                )
            }
            label="Follow-up overdue"
            count={
              counts.followupOverdue
            }
            icon={
              <CalendarClock
                size={13}
              />
            }
          />

          <QuickViewButton
            active={
              quickView ===
              'payment_pending'
            }
            onClick={
              () =>
                setQuickView(
                  'payment_pending'
                )
            }
            label="Payment pending"
            count={
              counts.paymentPending
            }
            icon={
              <CircleDollarSign
                size={13}
              />
            }
          />
        </div>

        <div className="mt-4 flex flex-col gap-3 xl:flex-row xl:items-center">
          <div className="flex min-w-0 flex-1 items-center rounded-xl border border-slate-200 bg-slate-50 px-3 transition focus-within:border-brand/30 focus-within:bg-white focus-within:ring-4 focus-within:ring-brand/5">
            <Search
              size={16}
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
              className="w-full bg-transparent px-2 py-2.5 text-sm outline-none placeholder:text-slate-400"
              placeholder="Search name, lead ID, country, course, source, owner or batch..."
            />
          </div>

          <select
            value={
              stage
            }
            onChange={
              (
                event
              ) =>
                setStage(
                  event.target.value
                )
            }
            className="input xl:w-44"
          >
            <option value="all">
              All stages
            </option>

            {stages.map(
              (
                item
              ) => (
                <option
                  key={
                    item
                  }
                  value={
                    item
                  }
                >
                  {pretty(
                    item
                  )}
                </option>
              )
            )}
          </select>

          <select
            value={
              source
            }
            onChange={
              (
                event
              ) =>
                setSource(
                  event.target.value
                )
            }
            className="input xl:w-44"
          >
            <option value="all">
              All sources
            </option>

            {sources.map(
              (
                item
              ) => (
                <option
                  key={
                    item
                  }
                  value={
                    item
                  }
                >
                  {
                    item
                  }
                </option>
              )
            )}
          </select>

          <button
            type="button"
            onClick={
              () =>
                setShowMoreFilters(
                  (
                    current
                  ) =>
                    !current
                )
            }
            className={`btn-secondary ${
              showMoreFilters ||
              hasAdvancedFilters
                ? '!border-brand/20 !bg-brand/[0.04] !text-brand'
                : ''
            }`}
          >
            <Filter
              size={15}
            />
            More filters
          </button>
        </div>

        {showMoreFilters && (
          <div className="mt-3 grid gap-3 rounded-xl border border-slate-100 bg-slate-50/60 p-3 sm:grid-cols-2 xl:grid-cols-4">
            <FilterSelect
              label="Current channel"
              value={
                channel
              }
              onChange={
                setChannel
              }
              options={
                channels
              }
            />

            <FilterSelect
              label="Owner"
              value={
                owner
              }
              onChange={
                setOwner
              }
              options={
                owners
              }
              extraOptions={[
                {
                  value:
                    '__unassigned__',
                  label:
                    'Unassigned only',
                },
              ]}
            />

            <FilterSelect
              label="Course"
              value={
                course
              }
              onChange={
                setCourse
              }
              options={
                courses
              }
            />

            <label>
              <span className="field-label text-xs">
                Stage aging
              </span>

              <select
                value={
                  aging
                }
                onChange={
                  (
                    event
                  ) =>
                    setAging(
                      event.target.value
                    )
                }
                className="input"
              >
                <option value="all">
                  All aging
                </option>
                <option value="healthy">
                  Healthy
                </option>
                <option value="warning">
                  Warning
                </option>
                <option value="stuck">
                  Stuck
                </option>
                <option value="untracked">
                  Untracked
                </option>
              </select>
            </label>
          </div>
        )}

        <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
            <span>
              <strong className="text-slate-800">
                {filtered.length.toLocaleString()}
              </strong>{' '}
              shown
            </span>

            <span>
              ·
            </span>

            <span>
              {
                mock
                  ? 'Mock-data mode'
                  : 'Supabase live mode'
              }
            </span>

            {(hasAdvancedFilters ||
              quickView !==
                'all' ||
              query) && (
              <button
                type="button"
                onClick={
                  resetFilters
                }
                className="inline-flex items-center gap-1 font-bold text-brand hover:underline"
              >
                <X
                  size={12}
                />
                Clear filters
              </button>
            )}
          </div>

          <div className="flex items-center gap-2">
            <SlidersHorizontal
              size={14}
              className="text-slate-400"
            />

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
              className="input !w-auto min-w-[170px] !py-2"
            >
              <option value="stage_age_desc">
                Oldest in stage
              </option>
              <option value="followup_asc">
                Next follow-up
              </option>
              <option value="name">
                Name A–Z
              </option>
            </select>
          </div>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="min-w-[1320px] w-full text-left">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50/60 text-[10px] uppercase tracking-[0.1em] text-slate-400">
              <th className="px-4 py-3 font-bold">
                Lead
              </th>

              <th className="px-4 py-3 font-bold">
                Course / Batch
              </th>

              <th className="px-4 py-3 font-bold">
                Stage
              </th>

              <th className="px-4 py-3 font-bold">
                Owner
              </th>

              <th className="px-4 py-3 font-bold">
                Source
              </th>

              <th className="px-4 py-3 font-bold">
                Channel
              </th>

              <th className="px-4 py-3 font-bold">
                Stage age
              </th>

              <th className="px-4 py-3 font-bold">
                Next follow-up
              </th>

              <th className="px-4 py-3 font-bold">
                Attention
              </th>

              <th className="px-4 py-3 font-bold" />
            </tr>
          </thead>

          <tbody>
            {filtered.length ===
            0 ? (
              <tr>
                <td
                  colSpan={
                    10
                  }
                  className="px-5 py-12 text-center"
                >
                  <div className="text-sm font-bold text-slate-600">
                    No leads match these filters.
                  </div>

                  <button
                    type="button"
                    onClick={
                      resetFilters
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
                  item
                ) => (
                  <LeadRow
                    key={
                      item.lead.id
                    }
                    item={
                      item
                    }
                    now={
                      now
                    }
                  />
                )
              )
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}


function LeadRow({
  item,
  now,
}: {
  item: EnrichedLead;
  now: number;
}) {
  const {
    lead,
    intel,
  } =
    item;

  const overdue =
    isOverdue(
      lead.nextFollowupAt,
      now
    );

  const unassigned =
    !intel
      ?.owner_user_id;

  const stuck =
    intel
      ?.aging_status ===
    'stuck';

  const paymentPending =
    lead.stage ===
    'payment_pending';

  return (
    <tr className="border-b border-slate-100 last:border-0 hover:bg-slate-50/70">
      <td className="px-4 py-3.5">
        <div className="font-semibold text-slate-900">
          {
            lead.name
          }
        </div>

        <div className="mt-0.5 flex items-center gap-2 text-xs text-slate-400">
          <span>
            {
              lead.leadCode
            }
          </span>

          <span>
            •
          </span>

          <span>
            {lead.country ||
              '—'}
          </span>
        </div>
      </td>

      <td className="max-w-[260px] px-4 py-3.5">
        <div className="truncate text-sm font-medium text-slate-700">
          {lead.course ||
            'Course not set'}
        </div>

        <div className="mt-0.5 truncate text-xs text-slate-400">
          {intel
            ?.batch_code ||
            lead.location ||
            'Batch not set'}
        </div>
      </td>

      <td className="px-4 py-3.5">
        <StageBadge
          stage={
            lead.stage
          }
        />

        <div className="mt-1">
          <IntentLabel
            intent={
              lead.intent
            }
          />
        </div>
      </td>

      <td className="px-4 py-3.5">
        {intel
          ?.owner_name ? (
          <div className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-700">
            <UserRoundCheck
              size={13}
              className="text-slate-400"
            />
            {
              intel.owner_name
            }
          </div>
        ) : (
          <span className="inline-flex items-center gap-1.5 rounded-lg bg-amber-50 px-2 py-1 text-[10px] font-bold text-amber-700">
            <UserRoundX
              size={11}
            />
            Unassigned
          </span>
        )}
      </td>

      <td className="max-w-[190px] px-4 py-3.5">
        <div className="truncate text-sm font-medium text-slate-700">
          {lead.firstTouchSource ||
            '—'}
        </div>

        <div className="mt-0.5 truncate text-xs text-slate-400">
          {lead.firstTouchCampaign ||
            'No campaign'}
        </div>
      </td>

      <td className="px-4 py-3.5">
        <ChannelBadge
          channel={
            lead.currentContactChannel
          }
        />
      </td>

      <td className="px-4 py-3.5">
        <AgingCell
          intel={
            intel
          }
        />
      </td>

      <td className="px-4 py-3.5">
        <div
          className={`text-sm font-medium ${
            overdue
              ? 'text-red-700'
              : 'text-slate-700'
          }`}
        >
          {formatDateTimeLocal(
            lead.nextFollowupAt
          )}
        </div>

        {overdue && (
          <div className="mt-0.5 text-[9px] font-black uppercase text-red-500">
            Overdue
          </div>
        )}
      </td>

      <td className="px-4 py-3.5">
        <div className="flex max-w-[210px] flex-wrap gap-1">
          {stuck && (
            <AttentionBadge
              tone="danger"
              icon={
                <AlertTriangle
                  size={10}
                />
              }
            >
              Stuck
            </AttentionBadge>
          )}

          {overdue && (
            <AttentionBadge
              tone="danger"
              icon={
                <CalendarClock
                  size={10}
                />
              }
            >
              Follow-up
            </AttentionBadge>
          )}

          {paymentPending && (
            <AttentionBadge
              tone="warning"
              icon={
                <CircleDollarSign
                  size={10}
                />
              }
            >
              Payment
            </AttentionBadge>
          )}

          {unassigned && (
            <AttentionBadge
              tone="warning"
              icon={
                <UserRoundX
                  size={10}
                />
              }
            >
              Owner
            </AttentionBadge>
          )}

          {!stuck &&
            !overdue &&
            !paymentPending &&
            !unassigned && (
            <span className="text-[10px] font-semibold text-slate-400">
              —
            </span>
          )}
        </div>
      </td>

      <td className="px-4 py-3.5 text-right">
        <Link
          href={`/leads/${lead.id}`}
          className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 text-slate-500 transition hover:border-brand/20 hover:bg-white hover:text-brand"
        >
          <ArrowUpRight
            size={15}
          />
        </Link>
      </td>
    </tr>
  );
}


function AgingCell({
  intel,
}: {
  intel:
    | LeadListIntelligence
    | null;
}) {
  const status =
    intel
      ?.aging_status ??
    'untracked';

  const age =
    toNumber(
      intel
        ?.stage_age_days
    );

  return (
    <div>
      <span
        className={`inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[9px] font-black uppercase ${agingBadgeClass(
          status
        )}`}
      >
        {status ===
          'stuck' && (
          <AlertTriangle
            size={10}
          />
        )}

        {status ===
          'warning' && (
          <Clock3
            size={10}
          />
        )}

        {
          pretty(
            status
          )
        }
      </span>

      <div className="mt-1 text-[10px] font-semibold text-slate-400">
        {formatAge(
          age
        )}{' '}
        in stage
      </div>
    </div>
  );
}


function QuickViewButton({
  active,
  onClick,
  label,
  count,
  icon,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  count: number;
  icon?: React.ReactNode;
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
        icon
      }

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


function FilterSelect({
  label,
  value,
  onChange,
  options,
  extraOptions = [],
}: {
  label: string;
  value: string;
  onChange: (
    value: string
  ) => void;
  options: string[];
  extraOptions?: Array<{
    value: string;
    label: string;
  }>;
}) {
  return (
    <label>
      <span className="field-label text-xs">
        {
          label
        }
      </span>

      <select
        value={
          value
        }
        onChange={
          (
            event
          ) =>
            onChange(
              event.target.value
            )
        }
        className="input"
      >
        <option value="all">
          All
        </option>

        {extraOptions.map(
          (
            option
          ) => (
            <option
              key={
                option.value
              }
              value={
                option.value
              }
            >
              {
                option.label
              }
            </option>
          )
        )}

        {options.map(
          (
            option
          ) => (
            <option
              key={
                option
              }
              value={
                option
              }
            >
              {
                pretty(
                  option
                )
              }
            </option>
          )
        )}
      </select>
    </label>
  );
}


function AttentionBadge({
  tone,
  icon,
  children,
}: {
  tone:
    | 'danger'
    | 'warning';
  icon:
    React.ReactNode;
  children:
    React.ReactNode;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-[8px] font-black uppercase ${
        tone ===
        'danger'
          ? 'bg-red-50 text-red-600'
          : 'bg-amber-50 text-amber-700'
      }`}
    >
      {
        icon
      }

      {
        children
      }
    </span>
  );
}


function uniqueSorted(
  values: string[]
) {
  return Array.from(
    new Set(
      values
        .map(
          (
            value
          ) =>
            value.trim()
        )
        .filter(
          Boolean
        )
    )
  ).sort(
    (
      a,
      b
    ) =>
      a.localeCompare(
        b
      )
  );
}


function isOverdue(
  value:
    | string
    | null
    | undefined,
  now: number
) {
  if (!value) {
    return false;
  }

  const time =
    new Date(
      value
    ).getTime();

  return (
    Number.isFinite(
      time
    ) &&
    time <
      now
  );
}


function sortableDate(
  value:
    | string
    | null
    | undefined
) {
  if (!value) {
    return Number.MAX_SAFE_INTEGER;
  }

  const time =
    new Date(
      value
    ).getTime();

  return Number.isFinite(
    time
  )
    ? time
    : Number.MAX_SAFE_INTEGER;
}


function formatDateTimeLocal(
  value:
    | string
    | null
    | undefined
) {
  if (!value) {
    return '—';
  }

  const date =
    new Date(
      value
    );

  if (
    Number.isNaN(
      date.getTime()
    )
  ) {
    return '—';
  }

  return new Intl.DateTimeFormat(
    'en-IN',
    {
      day:
        '2-digit',
      month:
        'short',
      hour:
        '2-digit',
      minute:
        '2-digit',
    }
  ).format(
    date
  );
}


function agingBadgeClass(
  status: string
) {
  if (
    status ===
    'stuck'
  ) {
    return 'bg-red-100 text-red-700';
  }

  if (
    status ===
    'warning'
  ) {
    return 'bg-amber-100 text-amber-700';
  }

  if (
    status ===
    'healthy'
  ) {
    return 'bg-emerald-100 text-emerald-700';
  }

  return 'bg-slate-100 text-slate-500';
}


function formatAge(
  days: number
) {
  if (
    days <
    1
  ) {
    return `${Math.max(
      0,
      Math.round(
        days *
          24
      )
    )}h`;
  }

  if (
    days <
    10
  ) {
    return `${days.toFixed(
      1
    )}d`;
  }

  return `${Math.round(
    days
  )}d`;
}


function toNumber(
  value:
    | number
    | string
    | null
    | undefined
) {
  const number =
    Number(
      value ??
      0
    );

  return Number.isFinite(
    number
  )
    ? number
    : 0;
}


function pretty(
  value: string
) {
  return value
    .replaceAll(
      '_',
      ' '
    )
    .replace(
      /\b\w/g,
      (
        letter
      ) =>
        letter.toUpperCase()
    );
}
