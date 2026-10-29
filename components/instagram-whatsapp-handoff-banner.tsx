'use client';

import Link from 'next/link';
import { MessageCircle, Phone, X } from 'lucide-react';
import { useSearchParams } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';

import {
  getInstagramWhatsAppHandoffStateAction,
  sendInstagramWhatsAppHandoffTemplateAction,
} from '@/app/conversations/instagram-whatsapp-handoff-actions';
import { WhatsAppTemplateComposer } from '@/components/whatsapp-template-composer';

type HandoffState = Awaited<
  ReturnType<typeof getInstagramWhatsAppHandoffStateAction>
>;

type ConversationInboundEvent = CustomEvent<{ leadId?: string | null }>;

export function InstagramWhatsAppHandoffBanner() {
  const searchParams = useSearchParams();
  const leadId = searchParams.get('lead') || '';
  const [state, setState] = useState<HandoffState | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [dismissedLeadId, setDismissedLeadId] = useState<string | null>(null);

  useEffect(() => {
    setState(null);
    setExpanded(false);
    if (!leadId) return;

    let active = true;
    const loadState = () => {
      void getInstagramWhatsAppHandoffStateAction(leadId).then((next) => {
        if (active) setState(next);
      });
    };

    const onInbound = (event: Event) => {
      const detail = (event as ConversationInboundEvent).detail;
      if (detail?.leadId !== leadId) return;
      setDismissedLeadId(null);
      loadState();
    };

    loadState();
    window.addEventListener('crm:conversation-inbound', onInbound);

    return () => {
      active = false;
      window.removeEventListener('crm:conversation-inbound', onInbound);
    };
  }, [leadId]);

  const sendAction = useMemo(
    () =>
      leadId
        ? sendInstagramWhatsAppHandoffTemplateAction.bind(null, leadId)
        : undefined,
    [leadId],
  );

  if (!leadId || dismissedLeadId === leadId || !state?.ok || !state.detected) {
    return null;
  }

  return (
    <aside className="fixed bottom-4 right-4 z-[70] w-[min(430px,calc(100vw-2rem))] overflow-hidden rounded-2xl border border-emerald-200 bg-white shadow-[0_18px_60px_rgba(21,62,51,0.22)]">
      <div className="flex items-start gap-3 bg-emerald-50 px-4 py-3.5">
        <div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-white text-emerald-700 shadow-sm">
          <Phone size={16} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-[12px] font-semibold text-emerald-950">
            Phone number detected in Instagram
          </div>
          <p className="mt-1 text-[10px] leading-4 text-emerald-800/80">
            This lead shared a contact number. You can keep replying on Instagram or move the conversation to WhatsApp.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setDismissedLeadId(leadId)}
          className="grid h-7 w-7 shrink-0 place-items-center rounded-lg text-emerald-700 transition hover:bg-white"
          aria-label="Dismiss WhatsApp handoff suggestion"
        >
          <X size={14} />
        </button>
      </div>

      {state.existingWhatsApp ? (
        <div className="space-y-3 px-4 py-3.5">
          <div className="rounded-lg border border-sky-200 bg-sky-50 px-3 py-2.5 text-[10px] leading-4 text-sky-800">
            This number is already connected to an existing WhatsApp conversation in the CRM. Use that conversation instead of creating a duplicate WhatsApp lead.
          </div>
          {state.existingWhatsAppLeadId ? (
            <Link
              href={`/conversations?lead=${encodeURIComponent(state.existingWhatsAppLeadId)}`}
              className="inline-flex h-9 w-full items-center justify-center gap-2 rounded-lg bg-[#153E33] px-3 text-[10px] font-semibold text-white transition hover:bg-[#216551]"
            >
              <MessageCircle size={13} /> Open WhatsApp conversation
            </Link>
          ) : (
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-[10px] leading-4 text-amber-800">
              The WhatsApp record is owned outside your current lead access. Ask a manager to review the existing conversation.
            </div>
          )}
        </div>
      ) : state.ready ? (
        <>
          {!expanded ? (
            <div className="space-y-3 px-4 py-3.5">
              <div className="rounded-lg border border-emerald-100 bg-[#F7FAF8] px-3 py-2 text-[10px] leading-4 text-[#4B665B]">
                Suggested Instagram reply: “Thanks for sharing your number. We can continue on WhatsApp for easier assistance.”
              </div>
              <button
                type="button"
                onClick={() => setExpanded(true)}
                className="inline-flex h-9 w-full items-center justify-center gap-2 rounded-lg bg-[#153E33] px-3 text-[10px] font-semibold text-white transition hover:bg-[#216551]"
              >
                <MessageCircle size={13} /> Continue on WhatsApp
              </button>
              <div className="text-center text-[9px] text-[#78877F]">
                Uses an approved WhatsApp template. Nothing is sent until you confirm.
              </div>
            </div>
          ) : sendAction ? (
            <div className="max-h-[65vh] overflow-y-auto border-t border-emerald-100">
              <WhatsAppTemplateComposer
                action={sendAction}
                leadId={leadId}
                templates={state.templates}
                loadError={state.loadError}
                windowLabel="Phone number shared in Instagram. Choose an approved template to continue on WhatsApp."
                mode="start"
              />
            </div>
          ) : null}
        </>
      ) : (
        <div className="px-4 py-3.5">
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-[10px] leading-4 text-amber-800">
            The number was detected, but it does not include a clear international country code. Verify the number before starting WhatsApp.
          </div>
          <Link
            href={`/leads/${leadId}`}
            className="mt-3 inline-flex h-8 w-full items-center justify-center rounded-lg border border-[#DCE4DF] bg-white px-3 text-[10px] font-semibold text-[#456158] transition hover:bg-[#F4F8F5] hover:text-[#216551]"
          >
            Open lead profile
          </Link>
        </div>
      )}
    </aside>
  );
}
