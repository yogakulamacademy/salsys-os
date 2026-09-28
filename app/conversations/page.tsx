import Link from 'next/link';
import {
  Instagram,
  MessageCircle,
  Search,
  Send,
} from 'lucide-react';
import { logLeadInteractionAction } from '@/app/actions/crm';
import { sendWhatsAppMessageAction } from '@/app/conversations/actions';
import { PageHeader, StageBadge } from '@/components/ui';
import { getLead, getLeads, isMockMode } from '@/lib/data';
import { formatDateTime } from '@/lib/format';
import type { Channel } from '@/types/crm';

const channels: Array<[Channel, string]> = [
  ['instagram', 'Instagram'],
  ['whatsapp', 'WhatsApp'],
  ['website', 'Website'],
  ['email', 'Email'],
  ['phone', 'Phone'],
  ['meta_lead_form', 'Meta Lead Form'],
  ['other', 'Other'],
];

export default async function ConversationsPage({
  searchParams,
}: {
  searchParams: Promise<{
    lead?: string;
    notice?: string;
    error?: string;
    wamid?: string;
  }>;
}) {
  const [allLeads, query] = await Promise.all([
    getLeads(),
    searchParams,
  ]);

  const conversationLeads = allLeads
    .filter((lead) => lead.lastContactedAt)
    .slice(0, 100);

  const selectedId =
    query.lead &&
    allLeads.some((lead) => lead.id === query.lead)
      ? query.lead
      : conversationLeads[0]?.id;

  const selected = selectedId
    ? await getLead(selectedId)
    : null;

  const interactionAction = selectedId
    ? logLeadInteractionAction.bind(null, selectedId)
    : undefined;

  const whatsappAction = selectedId
    ? sendWhatsAppMessageAction.bind(null, selectedId)
    : undefined;

  const mock = isMockMode();

  const noticeText =
    query.notice === 'whatsapp-sent'
      ? 'WhatsApp message sent and logged in the CRM.'
      : query.notice
        ? 'Interaction logged.'
        : null;

  return (
    <>
      <PageHeader
        eyebrow="Unified inbox"
        title="Conversations"
        description="Review CRM conversation history and send live WhatsApp replies from the same lead thread."
        actions={
          <span
            className={`rounded-xl px-3 py-2 text-xs font-bold ${
              mock
                ? 'bg-orange-50 text-orange-700'
                : 'bg-emerald-50 text-emerald-700'
            }`}
          >
            {mock ? 'Mock inbox' : 'Live messaging'}
          </span>
        }
      />

      {query.error && (
        <div className="mb-4 rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
          {query.error}
        </div>
      )}

      {noticeText && (
        <div className="mb-4 rounded-xl border border-emerald-100 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-700">
          {noticeText}
        </div>
      )}

      <div className="grid min-h-[650px] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-card lg:grid-cols-[380px_1fr]">
        <aside className="border-r border-slate-200">
          <div className="border-b border-slate-100 p-4">
            <div className="flex items-center rounded-xl border border-slate-200 bg-slate-50 px-3">
              <Search
                size={15}
                className="text-slate-400"
              />
              <input
                className="w-full bg-transparent px-2 py-2.5 text-sm outline-none"
                placeholder="Search UI coming next"
                disabled
              />
            </div>
          </div>

          <div className="max-h-[580px] overflow-y-auto">
            {conversationLeads.length === 0 && (
              <div className="p-6 text-sm leading-6 text-slate-400">
                No conversations yet. Inbound WhatsApp
                messages and logged CRM interactions will
                appear here.
              </div>
            )}

            {conversationLeads.map((lead) => (
              <Link
                key={lead.id}
                href={`/conversations?lead=${lead.id}`}
                className={`block border-b border-slate-100 p-4 hover:bg-slate-50 ${
                  selectedId === lead.id
                    ? 'bg-slate-50'
                    : ''
                }`}
              >
                <div className="flex items-start gap-3">
                  <div className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-brand/10 font-bold text-brand">
                    {lead.name
                      .split(' ')
                      .map((x) => x[0])
                      .slice(0, 2)
                      .join('')}
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <div className="truncate text-sm font-semibold text-slate-900">
                        {lead.name}
                      </div>

                      <div className="text-[10px] text-slate-400">
                        {formatDateTime(
                          lead.lastContactedAt
                        )}
                      </div>
                    </div>

                    <div className="mt-1 truncate text-xs text-slate-500">
                      Interested in {lead.course}
                    </div>

                    <div className="mt-2 flex items-center gap-2">
                      <span className="inline-flex items-center gap-1 text-[11px] font-semibold capitalize text-slate-500">
                        {lead.currentContactChannel ===
                        'instagram' ? (
                          <Instagram size={12} />
                        ) : (
                          <MessageCircle size={12} />
                        )}
                        {lead.currentContactChannel}
                      </span>

                      <StageBadge stage={lead.stage} />
                    </div>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </aside>

        {!selected ? (
          <section className="grid min-h-[600px] place-items-center p-8 text-center">
            <div>
              <div className="text-lg font-bold text-slate-800">
                No conversation selected
              </div>

              <p className="mt-2 max-w-md text-sm leading-6 text-slate-500">
                Incoming WhatsApp messages and CRM
                interactions will appear here.
              </p>

              <Link
                href="/leads"
                className="btn-primary mt-4"
              >
                Open leads
              </Link>
            </div>
          </section>
        ) : (
          <section className="flex min-h-[600px] flex-col">
            <div className="flex items-center justify-between border-b border-slate-100 p-4">
              <div>
                <div className="font-semibold text-slate-900">
                  {selected.name}
                </div>

                <div className="text-xs capitalize text-slate-400">
                  {selected.currentContactChannel} ·{' '}
                  {selected.stage.replaceAll('_', ' ')} ·{' '}
                  {selected.country}
                </div>
              </div>

              <Link
                href={`/leads/${selected.id}`}
                className="btn-secondary"
              >
                View lead
              </Link>
            </div>

            <div className="flex-1 space-y-4 overflow-y-auto bg-slate-50/50 p-5">
              {selected.lastMessages.length === 0 && (
                <div className="rounded-xl border border-dashed border-slate-200 bg-white p-5 text-sm text-slate-400">
                  No messages stored for this lead yet.
                </div>
              )}

              {selected.lastMessages.map((message) => (
                <Bubble
                  key={message.id}
                  inbound={
                    message.direction === 'inbound'
                  }
                  text={message.body}
                  meta={`${message.sender} · ${message.channel} · ${formatDateTime(
                    message.timestamp
                  )}`}
                />
              ))}
            </div>

            {selected.currentContactChannel ===
              'whatsapp' &&
            whatsappAction ? (
              <form
                action={whatsappAction}
                className="border-t border-slate-100 p-4"
              >
                <div className="flex gap-2">
                  <input
                    className="input min-w-0 flex-1"
                    name="body"
                    required
                    maxLength={4096}
                    autoComplete="off"
                    placeholder="Reply on WhatsApp…"
                  />

                  <button
                    className="btn-primary shrink-0"
                    type="submit"
                  >
                    <Send size={15} />
                    Send
                  </button>
                </div>

                <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-400">
                  <span>
                    Sends through WhatsApp Cloud API and
                    logs the outbound message in the CRM.
                  </span>

                  <span>
                    Free-form replies require an active
                    24-hour customer-service window.
                  </span>
                </div>
              </form>
            ) : interactionAction ? (
              <form
                action={interactionAction}
                className="border-t border-slate-100 p-4"
              >
                <div className="grid gap-2 sm:grid-cols-[130px_160px_1fr_auto]">
                  <select
                    className="input"
                    name="direction"
                    defaultValue="outbound"
                  >
                    <option value="outbound">
                      Outbound
                    </option>
                    <option value="inbound">
                      Inbound
                    </option>
                  </select>

                  <select
                    className="input"
                    name="channel"
                    defaultValue={
                      selected.currentContactChannel
                    }
                  >
                    {channels.map(
                      ([value, label]) => (
                        <option
                          key={value}
                          value={value}
                        >
                          {label}
                        </option>
                      )
                    )}
                  </select>

                  <input
                    className="input"
                    name="body"
                    required
                    placeholder="Log the message / call note…"
                  />

                  <button
                    className="btn-primary"
                    type="submit"
                  >
                    <Send size={15} />
                    Log
                  </button>
                </div>

                <div className="mt-2 text-[11px] text-slate-400">
                  Non-WhatsApp channels are still logged
                  manually for now.
                </div>
              </form>
            ) : null}
          </section>
        )}
      </div>
    </>
  );
}

function Bubble({
  text,
  inbound = false,
  meta,
}: {
  text: string;
  inbound?: boolean;
  meta: string;
}) {
  return (
    <div
      className={`flex ${
        inbound ? 'justify-start' : 'justify-end'
      }`}
    >
      <div
        className={`max-w-xl rounded-2xl px-4 py-3 text-sm leading-6 ${
          inbound
            ? 'border border-slate-200 bg-white text-slate-700'
            : 'bg-brand text-white'
        }`}
      >
        <div>{text}</div>

        <div
          className={`mt-1 text-[10px] ${
            inbound
              ? 'text-slate-400'
              : 'text-white/60'
          }`}
        >
          {meta}
        </div>
      </div>
    </div>
  );
}
