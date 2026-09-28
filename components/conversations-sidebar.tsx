'use client';

import {
  useMemo,
  useState,
} from 'react';

import Link from 'next/link';

import {
  Bell,
  Clock3,
  ContactRound,
  Globe2,
  Instagram,
  Mail,
  MessageCircle,
  Phone,
  Search,
  X,
} from 'lucide-react';

import {
  StageBadge,
} from '@/components/ui';

import type {
  Channel,
  LeadStage,
} from '@/types/crm';

export type ConversationPriority =
  | 'urgent'
  | 'high'
  | 'normal'
  | 'waiting';

export type ConversationLeadSummary = {
  id: string;

  name: string;

  course: string;

  country: string;

  stage: LeadStage;

  currentContactChannel:
    Channel;

  lastContactedAt:
    | string
    | null;

  unread: boolean;

  needsReply: boolean;

  needsFirstContact: boolean;

  priority:
    ConversationPriority;

  waitingSince:
    | string
    | null;
};

type InboxFilter =
  | 'all'
  | 'attention'
  | 'unread';

export function ConversationsSidebar({
  leads,
  selectedId,
}: {
  leads:
    ConversationLeadSummary[];

  selectedId?: string;
}) {
  const [
    search,
    setSearch,
  ] =
    useState('');

  const [
    filter,
    setFilter,
  ] =
    useState<InboxFilter>(
      'all'
    );

  const unreadCount =
    leads.filter(
      (lead) =>
        lead.unread
    ).length;

  const attentionCount =
    leads.filter(
      (lead) =>
        lead.needsReply ||
        lead.needsFirstContact
    ).length;

  const filteredLeads =
    useMemo(() => {
      const query =
        search
          .trim()
          .toLowerCase();

      return leads.filter(
        (lead) => {
          if (
            filter ===
              'attention' &&
            !lead.needsReply &&
            !lead.needsFirstContact
          ) {
            return false;
          }

          if (
            filter ===
              'unread' &&
            !lead.unread
          ) {
            return false;
          }

          if (!query) {
            return true;
          }

          const searchable =
            [
              lead.name,
              lead.course,
              lead.country,
              lead.stage,
              lead.currentContactChannel,
              lead.priority,
            ]
              .filter(Boolean)
              .join(' ')
              .replaceAll(
                '_',
                ' '
              )
              .toLowerCase();

          return searchable.includes(
            query
          );
        }
      );
    }, [
      leads,
      search,
      filter,
    ]);

  return (
    <aside className="flex h-full min-h-0 flex-col overflow-hidden bg-white">
      <div className="shrink-0 border-b border-slate-100 px-4 pb-3 pt-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-[10px] font-black uppercase tracking-[.14em] text-slate-400">
              Inbox
            </div>

            <div className="mt-1 text-sm font-black text-slate-900">
              Conversations
            </div>
          </div>

          <div className="rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-black text-slate-600">
            {
              leads.length
            }
          </div>
        </div>

        {/* FILTERS */}

        <div className="mt-3 grid grid-cols-3 gap-1 rounded-xl bg-slate-100 p-1">
          <FilterButton
            active={
              filter ===
              'all'
            }
            onClick={() =>
              setFilter(
                'all'
              )
            }
          >
            All
          </FilterButton>

          <FilterButton
            active={
              filter ===
              'attention'
            }
            onClick={() =>
              setFilter(
                'attention'
              )
            }
          >
            Reply{' '}
            {attentionCount >
              0 &&
              `(${attentionCount})`}
          </FilterButton>

          <FilterButton
            active={
              filter ===
              'unread'
            }
            onClick={() =>
              setFilter(
                'unread'
              )
            }
          >
            Unread{' '}
            {unreadCount >
              0 &&
              `(${unreadCount})`}
          </FilterButton>
        </div>

        {/* SEARCH */}

        <div className="relative mt-3">
          <Search
            size={14}
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
          />

          <input
            value={search}
            onChange={(
              event
            ) =>
              setSearch(
                event.target.value
              )
            }
            placeholder="Search conversations..."
            className="h-10 w-full rounded-xl border border-slate-200 bg-slate-50 pl-9 pr-9 text-xs font-medium outline-none transition focus:border-brand/30 focus:bg-white focus:ring-2 focus:ring-brand/5"
          />

          {search && (
            <button
              type="button"
              onClick={() =>
                setSearch('')
              }
              className="absolute right-2 top-1/2 grid h-6 w-6 -translate-y-1/2 place-items-center rounded-lg text-slate-400 hover:bg-slate-200"
            >
              <X
                size={12}
              />
            </button>
          )}
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-2">
        {filteredLeads.length ===
        0 ? (
          <div className="grid min-h-[250px] place-items-center px-4 text-center">
            <div>
              <div className="mx-auto grid h-11 w-11 place-items-center rounded-2xl bg-slate-100 text-slate-400">
                <MessageCircle
                  size={18}
                />
              </div>

              <div className="mt-3 text-xs font-bold text-slate-700">
                No conversations
                found
              </div>
            </div>
          </div>
        ) : (
          <div className="space-y-1.5">
            {filteredLeads.map(
              (lead) => (
                <ConversationCard
                  key={
                    lead.id
                  }
                  lead={
                    lead
                  }
                  selected={
                    lead.id ===
                    selectedId
                  }
                />
              )
            )}
          </div>
        )}
      </div>
    </aside>
  );
}

function ConversationCard({
  lead,
  selected,
}: {
  lead:
    ConversationLeadSummary;

  selected: boolean;
}) {
  return (
    <Link
      href={`/conversations?lead=${lead.id}`}
      className={`group relative block rounded-2xl border p-3 transition-all duration-200 ${
        selected
          ? 'border-brand/25 bg-brand/[0.045] shadow-sm'
          : lead.unread
            ? 'border-sky-100 bg-sky-50/35 hover:border-sky-200'
            : 'border-transparent bg-white hover:border-slate-200 hover:bg-slate-50'
      }`}
    >
      {selected && (
        <div className="absolute bottom-3 left-0 top-3 w-[3px] rounded-r-full bg-brand" />
      )}

      {lead.unread &&
        !selected && (
          <div className="absolute right-3 top-3 h-2 w-2 rounded-full bg-sky-500 ring-4 ring-sky-50" />
        )}

      <div className="flex gap-3">
        <div
          className={`grid h-10 w-10 shrink-0 place-items-center rounded-full text-[11px] font-black ${
            selected
              ? 'bg-brand text-white'
              : lead.unread
                ? 'bg-sky-100 text-sky-700'
                : 'bg-slate-100 text-slate-600'
          }`}
        >
          {initials(
            lead.name
          )}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-3 pr-3">
            <div
              className={`truncate text-xs ${
                lead.unread
                  ? 'font-black text-slate-950'
                  : 'font-bold text-slate-900'
              }`}
            >
              {lead.name}
            </div>

            <div className="shrink-0 text-[9px] font-semibold text-slate-400">
              {lead.lastContactedAt
                ? formatListTime(
                    lead.lastContactedAt
                  )
                : 'New'}
            </div>
          </div>

          <div className="mt-1 truncate text-[10px] font-semibold text-slate-500">
            {lead.course &&
            lead.course !==
              'Not selected'
              ? lead.course
              : 'Course not selected'}
          </div>

          {/* ACTION STATE */}

          <div className="mt-2 flex flex-wrap gap-1.5">
            {lead.needsFirstContact && (
              <StatusBadge
                tone="sky"
              >
                New lead
              </StatusBadge>
            )}

            {lead.needsReply && (
              <StatusBadge
                tone="orange"
              >
                Needs reply
              </StatusBadge>
            )}

            {lead.unread && (
              <StatusBadge
                tone="blue"
              >
                <Bell
                  size={8}
                />
                Unread
              </StatusBadge>
            )}

            {!lead.needsReply &&
              !lead.needsFirstContact && (
                <StatusBadge
                  tone="slate"
                >
                  Waiting
                </StatusBadge>
              )}

            <PriorityBadge
              priority={
                lead.priority
              }
            />
          </div>

          {/* CHANNEL / COUNTRY */}

          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            <ChannelBadge
              channel={
                lead.currentContactChannel
              }
            />

            {lead.country &&
              lead.country !==
                '—' && (
                <span className="inline-flex max-w-[100px] items-center gap-1 truncate rounded-full border border-violet-100 bg-violet-50 px-2 py-0.5 text-[8px] font-bold text-violet-700">
                  <Globe2
                    size={8}
                  />

                  <span className="truncate">
                    {
                      lead.country
                    }
                  </span>
                </span>
              )}
          </div>

          {/* WAITING TIME */}

          {lead.waitingSince && (
            <div className="mt-2 flex items-center gap-1 text-[9px] font-semibold text-slate-400">
              <Clock3
                size={9}
              />

              Waiting{' '}
              {formatWaitingTime(
                lead.waitingSince
              )}
            </div>
          )}

          <div className="mt-2">
            <StageBadge
              stage={
                lead.stage
              }
            />
          </div>
        </div>
      </div>
    </Link>
  );
}

function FilterButton({
  active,
  onClick,
  children,
}: {
  active: boolean;

  onClick: () => void;

  children:
    React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={
        onClick
      }
      className={`rounded-lg px-2 py-1.5 text-[9px] font-black transition ${
        active
          ? 'bg-white text-slate-900 shadow-sm'
          : 'text-slate-500 hover:text-slate-800'
      }`}
    >
      {children}
    </button>
  );
}

function PriorityBadge({
  priority,
}: {
  priority:
    ConversationPriority;
}) {
  if (
    priority ===
    'waiting'
  ) {
    return null;
  }

  const className =
    priority ===
    'urgent'
      ? 'border-red-100 bg-red-50 text-red-700'
      : priority ===
          'high'
        ? 'border-amber-100 bg-amber-50 text-amber-700'
        : 'border-emerald-100 bg-emerald-50 text-emerald-700';

  return (
    <span
      className={`rounded-full border px-2 py-0.5 text-[8px] font-black uppercase ${className}`}
    >
      {priority}
    </span>
  );
}

function StatusBadge({
  tone,
  children,
}: {
  tone:
    | 'blue'
    | 'sky'
    | 'orange'
    | 'slate';

  children:
    React.ReactNode;
}) {
  const colors = {
    blue:
      'border-blue-100 bg-blue-50 text-blue-700',

    sky:
      'border-sky-100 bg-sky-50 text-sky-700',

    orange:
      'border-orange-100 bg-orange-50 text-orange-700',

    slate:
      'border-slate-200 bg-slate-50 text-slate-500',
  };

  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[8px] font-black uppercase ${colors[tone]}`}
    >
      {children}
    </span>
  );
}

function ChannelBadge({
  channel,
}: {
  channel:
    Channel;
}) {
  const config =
    channelConfig(
      channel
    );

  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[8px] font-black ${config.className}`}
    >
      <ChannelIcon
        channel={
          channel
        }
      />

      {
        config.label
      }
    </span>
  );
}

function channelConfig(
  channel: Channel
) {
  switch (
    channel
  ) {
    case 'whatsapp':
      return {
        label:
          'WhatsApp',

        className:
          'border-emerald-100 bg-emerald-50 text-emerald-700',
      };

    case 'instagram':
      return {
        label:
          'Instagram',

        className:
          'border-pink-100 bg-pink-50 text-pink-700',
      };

    case 'website':
      return {
        label:
          'Website',

        className:
          'border-sky-100 bg-sky-50 text-sky-700',
      };

    case 'email':
      return {
        label:
          'Email',

        className:
          'border-indigo-100 bg-indigo-50 text-indigo-700',
      };

    case 'phone':
      return {
        label:
          'Phone',

        className:
          'border-amber-100 bg-amber-50 text-amber-700',
      };

    case 'meta_lead_form':
      return {
        label:
          'Meta',

        className:
          'border-blue-100 bg-blue-50 text-blue-700',
      };

    default:
      return {
        label:
          'Other',

        className:
          'border-slate-200 bg-slate-50 text-slate-600',
      };
  }
}

function ChannelIcon({
  channel,
}: {
  channel:
    Channel;
}) {
  if (
    channel ===
    'whatsapp'
  ) {
    return (
      <MessageCircle
        size={9}
      />
    );
  }

  if (
    channel ===
    'instagram'
  ) {
    return (
      <Instagram
        size={9}
      />
    );
  }

  if (
    channel ===
    'email'
  ) {
    return (
      <Mail
        size={9}
      />
    );
  }

  if (
    channel ===
    'phone'
  ) {
    return (
      <Phone
        size={9}
      />
    );
  }

  if (
    channel ===
    'website'
  ) {
    return (
      <Globe2
        size={9}
      />
    );
  }

  return (
    <ContactRound
      size={9}
    />
  );
}

function initials(
  name: string
) {
  return (
    name
      .split(' ')
      .filter(Boolean)
      .map(
        (part) =>
          part[0]
      )
      .slice(0, 2)
      .join('')
      .toUpperCase() ||
    '?'
  );
}

function formatWaitingTime(
  value: string
) {
  const timestamp =
    new Date(
      value
    ).getTime();

  if (
    !Number.isFinite(
      timestamp
    )
  ) {
    return '';
  }

  const minutes =
    Math.max(
      0,
      Math.floor(
        (
          Date.now() -
          timestamp
        ) /
          60000
      )
    );

  if (
    minutes < 60
  ) {
    return `${minutes}m`;
  }

  const hours =
    Math.floor(
      minutes / 60
    );

  if (
    hours < 24
  ) {
    return `${hours}h`;
  }

  const days =
    Math.floor(
      hours / 24
    );

  return `${days}d`;
}

function formatListTime(
  value: string
) {
  const date =
    new Date(value);

  if (
    Number.isNaN(
      date.getTime()
    )
  ) {
    return '';
  }

  const now =
    new Date();

  const sameDay =
    date.getFullYear() ===
      now.getFullYear() &&
    date.getMonth() ===
      now.getMonth() &&
    date.getDate() ===
      now.getDate();

  if (sameDay) {
    return new Intl.DateTimeFormat(
      'en',
      {
        hour:
          'numeric',
        minute:
          '2-digit',
      }
    ).format(date);
  }

  return new Intl.DateTimeFormat(
    'en',
    {
      day:
        'numeric',

      month:
        'short',
    }
  ).format(date);
}