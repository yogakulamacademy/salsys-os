import {
  ArrowDown,
  ContactRound,
  Globe2,
  Instagram,
  Mail,
  MessageCircle,
  Phone,
} from 'lucide-react';

import type {
  Channel,
} from '@/types/crm';

type ConversationMessage = {
  id: string;

  direction:
    | 'inbound'
    | 'outbound';

  sender: string;

  body: string;

  timestamp: string;

  channel: Channel;
};

type ConversationThreadProps = {
  messages: ConversationMessage[];

  originChannel?: Channel | string;

  originTimestamp?: string;

  originCourse?: string;

  originDetail?: string;
};

export function ConversationThread({
  messages,
  originChannel,
  originTimestamp,
  originCourse,
  originDetail,
}: ConversationThreadProps) {
  const hasOrigin =
    Boolean(
      originChannel &&
        originTimestamp
    );

  if (
    !hasOrigin &&
    messages.length === 0
  ) {
    return (
      <div className="grid min-h-[260px] place-items-center text-center">
        <div>
          <div className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-slate-100 text-slate-400">
            <MessageCircle
              size={20}
            />
          </div>

          <div className="mt-3 text-sm font-bold text-slate-700">
            No messages yet
          </div>

          <p className="mt-1 text-xs leading-5 text-slate-400">
            Messages and channel
            activity will appear here.
          </p>
        </div>
      </div>
    );
  }

  let previousChannel:
    | string
    | null =
    originChannel || null;

  return (
    <div className="space-y-4">
      {/* =============================================
          LEAD / CHANNEL ORIGIN
      ============================================= */}

      {hasOrigin && (
        <>
          <ChannelSectionHeader
            channel={
              originChannel!
            }
            timestamp={
              originTimestamp!
            }
          />

          <OriginEvent
            channel={
              originChannel!
            }
            course={
              originCourse
            }
            detail={
              originDetail
            }
            timestamp={
              originTimestamp!
            }
          />
        </>
      )}

      {/* =============================================
          MESSAGES
      ============================================= */}

      {messages.map(
        (
          message,
          index
        ) => {
          const channelChanged =
            Boolean(
              previousChannel &&
                previousChannel !==
                  message.channel
            );

          const isFirstMessage =
            index === 0;

          const shouldShowHeader =
            channelChanged ||
            (
              !hasOrigin &&
              (
                isFirstMessage ||
                previousChannel !==
                  message.channel
              )
            );

          const oldChannel =
            previousChannel;

          previousChannel =
            message.channel;

          return (
            <div
              key={message.id}
              className="space-y-4"
            >
              {/* CHANNEL HANDOFF */}

              {channelChanged && (
                <ChannelHandoff
                  from={
                    oldChannel ||
                    'other'
                  }
                  to={
                    message.channel
                  }
                />
              )}

              {/* NEW CHANNEL HEADER */}

              {shouldShowHeader && (
                <ChannelSectionHeader
                  channel={
                    message.channel
                  }
                  timestamp={
                    message.timestamp
                  }
                />
              )}

              {/* MESSAGE */}

              <MessageBubble
                message={
                  message
                }
              />
            </div>
          );
        }
      )}
    </div>
  );
}

/* =========================================================
   ORIGIN EVENT
========================================================= */

function OriginEvent({
  channel,
  course,
  detail,
  timestamp,
}: {
  channel: string;
  course?: string;
  detail?: string;
  timestamp: string;
}) {
  const isWebsite =
    channel === 'website';

  return (
    <div className="relative mx-auto max-w-[88%]">
      <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
        <div className="flex items-start gap-3">
          <div
            className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl ${
              isWebsite
                ? 'bg-sky-50 text-sky-600'
                : 'bg-slate-100 text-slate-600'
            }`}
          >
            {isWebsite ? (
              <Globe2
                size={16}
              />
            ) : (
              <ContactRound
                size={16}
              />
            )}
          </div>

          <div className="min-w-0 flex-1">
            <div className="text-[10px] font-black uppercase tracking-[.12em] text-slate-400">
              Lead origin
            </div>

            <div className="mt-1 text-sm font-bold text-slate-900">
              {isWebsite
                ? 'Website enquiry submitted'
                : `${channelLabel(
                    channel
                  )} lead created`}
            </div>

            {course &&
              course !==
                'Not selected' && (
                <div className="mt-1 text-xs font-semibold text-slate-600">
                  {course}
                </div>
              )}

            {detail && (
              <div className="mt-1 text-[11px] leading-5 text-slate-500">
                {detail}
              </div>
            )}

            <div className="mt-2 text-[10px] font-medium text-slate-400">
              {formatTimelineTime(
                timestamp
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* =========================================================
   CHANNEL HEADER
========================================================= */

function ChannelSectionHeader({
  channel,
  timestamp,
}: {
  channel: string;
  timestamp: string;
}) {
  const tone =
    channelTone(channel);

  return (
    <div className="flex items-center gap-3 py-1">
      <div className="h-px flex-1 bg-slate-200" />

      <div
        className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1 text-[9px] font-black uppercase tracking-[.12em] ${tone}`}
      >
        <ChannelIcon
          channel={
            channel
          }
        />

        {channelLabel(
          channel
        )}

        <span className="opacity-40">
          ·
        </span>

        <span className="font-semibold normal-case tracking-normal opacity-70">
          {formatCompactTime(
            timestamp
          )}
        </span>
      </div>

      <div className="h-px flex-1 bg-slate-200" />
    </div>
  );
}

/* =========================================================
   HANDOFF
========================================================= */

function ChannelHandoff({
  from,
  to,
}: {
  from: string;
  to: string;
}) {
  return (
    <div className="py-2">
      <div className="mx-auto flex max-w-sm flex-col items-center">
        <div className="h-3 w-px bg-slate-200" />

        <div className="grid h-6 w-6 place-items-center rounded-full border border-slate-200 bg-white text-slate-400 shadow-sm">
          <ArrowDown
            size={11}
          />
        </div>

        <div className="mt-2 rounded-full border border-slate-200 bg-white px-3 py-1 text-[9px] font-bold text-slate-500 shadow-sm">
          Moved from{' '}
          <span className="font-black">
            {channelLabel(
              from
            )}
          </span>{' '}
          to{' '}
          <span className="font-black">
            {channelLabel(
              to
            )}
          </span>
        </div>
      </div>
    </div>
  );
}

/* =========================================================
   MESSAGE
========================================================= */

function MessageBubble({
  message,
}: {
  message: ConversationMessage;
}) {
  const outbound =
    message.direction ===
    'outbound';

  const isWhatsApp =
    message.channel ===
    'whatsapp';

  return (
    <div
      className={`flex ${
        outbound
          ? 'justify-end'
          : 'justify-start'
      }`}
    >
      <div
        className={`max-w-[84%] sm:max-w-[72%] ${
          outbound
            ? 'items-end'
            : 'items-start'
        }`}
      >
        <div
          className={`mb-1 flex items-center gap-1.5 px-1 text-[9px] font-bold ${
            outbound
              ? 'justify-end text-slate-400'
              : 'justify-start text-slate-500'
          }`}
        >
          <span>
            {message.sender}
          </span>

          <span>
            ·
          </span>

          <span>
            {formatCompactTime(
              message.timestamp
            )}
          </span>
        </div>

        <div
          className={`rounded-2xl px-4 py-3 text-sm leading-6 shadow-sm ${
            outbound
              ? isWhatsApp
                ? 'rounded-br-md bg-emerald-600 text-white'
                : 'rounded-br-md bg-brand text-white'
              : isWhatsApp
                ? 'rounded-bl-md border border-emerald-100 bg-white text-slate-800'
                : 'rounded-bl-md border border-slate-200 bg-white text-slate-800'
          }`}
        >
          <div className="whitespace-pre-wrap break-words">
            {message.body}
          </div>
        </div>

        <div
          className={`mt-1 flex items-center gap-1 px-1 text-[9px] font-semibold ${
            outbound
              ? 'justify-end'
              : 'justify-start'
          }`}
        >
          <span
            className={
              channelTextTone(
                message.channel
              )
            }
          >
            {channelLabel(
              message.channel
            )}
          </span>
        </div>
      </div>
    </div>
  );
}

/* =========================================================
   ICON
========================================================= */

function ChannelIcon({
  channel,
}: {
  channel: string;
}) {
  if (
    channel ===
    'whatsapp'
  ) {
    return (
      <MessageCircle
        size={11}
      />
    );
  }

  if (
    channel ===
    'instagram'
  ) {
    return (
      <Instagram
        size={11}
      />
    );
  }

  if (
    channel ===
    'email'
  ) {
    return (
      <Mail
        size={11}
      />
    );
  }

  if (
    channel ===
    'phone'
  ) {
    return (
      <Phone
        size={11}
      />
    );
  }

  if (
    channel ===
    'website'
  ) {
    return (
      <Globe2
        size={11}
      />
    );
  }

  return (
    <ContactRound
      size={11}
    />
  );
}

/* =========================================================
   CHANNEL LABEL
========================================================= */

function channelLabel(
  channel: string
) {
  if (
    channel ===
    'meta_lead_form'
  ) {
    return 'Meta Lead Form';
  }

  return channel
    .replaceAll('_', ' ')
    .replace(
      /\b\w/g,
      (letter) =>
        letter.toUpperCase()
    );
}

/* =========================================================
   CHANNEL COLORS
========================================================= */

function channelTone(
  channel: string
) {
  if (
    channel ===
    'whatsapp'
  ) {
    return 'border-emerald-100 bg-emerald-50 text-emerald-700';
  }

  if (
    channel ===
    'instagram'
  ) {
    return 'border-pink-100 bg-pink-50 text-pink-700';
  }

  if (
    channel ===
    'website'
  ) {
    return 'border-sky-100 bg-sky-50 text-sky-700';
  }

  if (
    channel ===
    'email'
  ) {
    return 'border-indigo-100 bg-indigo-50 text-indigo-700';
  }

  if (
    channel ===
    'phone'
  ) {
    return 'border-amber-100 bg-amber-50 text-amber-700';
  }

  if (
    channel ===
    'meta_lead_form'
  ) {
    return 'border-blue-100 bg-blue-50 text-blue-700';
  }

  return 'border-slate-200 bg-slate-50 text-slate-600';
}

function channelTextTone(
  channel: string
) {
  if (
    channel ===
    'whatsapp'
  ) {
    return 'text-emerald-600';
  }

  if (
    channel ===
    'instagram'
  ) {
    return 'text-pink-600';
  }

  if (
    channel ===
    'website'
  ) {
    return 'text-sky-600';
  }

  if (
    channel ===
    'email'
  ) {
    return 'text-indigo-600';
  }

  if (
    channel ===
    'phone'
  ) {
    return 'text-amber-600';
  }

  return 'text-slate-400';
}

/* =========================================================
   DATE FORMAT
========================================================= */

function formatCompactTime(
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

  return new Intl.DateTimeFormat(
    'en',
    {
      day: 'numeric',
      month: 'short',
      hour: 'numeric',
      minute: '2-digit',
    }
  ).format(date);
}

function formatTimelineTime(
  value: string
) {
  const date =
    new Date(value);

  if (
    Number.isNaN(
      date.getTime()
    )
  ) {
    return value;
  }

  return new Intl.DateTimeFormat(
    'en',
    {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    }
  ).format(date);
}