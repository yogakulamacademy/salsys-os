'use client';

import { useRef, useState } from 'react';
import { Beaker, CheckCircle2, ShieldAlert } from 'lucide-react';

export type InstagramSelectedVariant = {
  experimentId: string;
  variantId: 'A' | 'B';
  body: string;
};

type PreviewResult = InstagramSelectedVariant & {
  ok: true;
  canSendNow: boolean;
  policyReasons: string[];
  observedReplySignals: string[];
  customerMessageSent: false;
  previewOnly: true;
};

const EXPERIMENTS = [
  ['enquiry', 'New enquiry'],
  ['followup', 'Course questions'],
  ['fees', 'Fees'],
  ['batch', 'Batch planning'],
  ['mode', 'Online or residential'],
  ['rooms', 'Accommodation'],
  ['register', 'Registration'],
  ['reengage', 'Still interested'],
] as const;

export function InstagramVariantChooser({
  leadId,
  onUse,
}: {
  leadId: string;
  onUse: (value: InstagramSelectedVariant) => void;
}) {
  const [selected, setSelected] = useState('');
  const selectionRevision = useRef(0);
  const [preview, setPreview] = useState<PreviewResult | null>(null);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function loadPreview() {
    if (!selected || pending) return;
    const requested = selected;
    const revision = selectionRevision.current;
    setPending(true);
    setMessage(null);
    setPreview(null);
    try {
      const response = await fetch(
        '/api/conversations/' + encodeURIComponent(leadId) + '/instagram-variants',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'same-origin',
          cache: 'no-store',
          body: JSON.stringify({ experimentId: requested }),
        },
      );
      const payload = await response.json() as Partial<PreviewResult> & {
        error?: string;
        reason?: string;
      };
      if (!response.ok || payload.ok !== true || typeof payload.body !== 'string'
          || !['A', 'B'].includes(String(payload.variantId))) {
        throw new Error(payload.error || payload.reason || 'Preview is unavailable.');
      }
      if (revision !== selectionRevision.current) return;
      setPreview(payload as PreviewResult);
    } catch (error) {
      if (revision === selectionRevision.current) {
        setMessage(error instanceof Error ? error.message : 'Cannot load verified CRM details.');
      }
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="mb-3 rounded-lg border border-[#DCE4DF] bg-[#F8FAF8] p-3">
      <div className="flex items-center gap-2 text-[10px] font-semibold text-[#18362D]">
        <Beaker size={13} /> Instagram reply A/B drafts
      </div>
      <p className="mt-1 text-[9px] leading-4 text-[#596E64]">
        Choose an experiment. SalsysOS assigns this lead a stable A or B version,
        fills verified CRM fields, and previews the result. No message is sent.
      </p>
      <div className="mt-2 flex flex-wrap gap-2">
        <select
          aria-label="Instagram reply experiment"
          value={selected}
          onChange={event => {
            selectionRevision.current += 1;
            setSelected(event.target.value);
            setPreview(null);
            setMessage(null);
          }}
          className="min-w-0 flex-1 rounded-md border border-[#DCE4DF] bg-white px-2 py-2 text-[10px]"
        >
          <option value="">Select reply situation…</option>
          {EXPERIMENTS.map(([id, label]) => <option key={id} value={id}>{label}</option>)}
        </select>
        <button
          type="button"
          disabled={!selected || pending}
          onClick={() => void loadPreview()}
          className="rounded-md border border-[#D2E3D5] bg-white px-3 py-2 text-[10px] font-semibold text-[#216551] disabled:opacity-50"
        >
          {pending ? 'Checking…' : 'Preview'}
        </button>
      </div>
      {message ? <p role="alert" className="mt-2 text-[9px] text-red-700">{message}</p> : null}
      {preview ? (
        <div className="mt-2 rounded-md border border-[#D6E6DB] bg-white p-3">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[9px] font-semibold text-[#216551]">
              Assigned variant {preview.variantId} · Verified CRM fields
            </span>
            {preview.canSendNow
              ? <CheckCircle2 size={13} className="text-[#216551]"/>
              : <ShieldAlert size={13} className="text-amber-700"/>}
          </div>
          <p className="mt-2 whitespace-pre-wrap text-[11px] leading-5 text-[#18362D]">
            {preview.body}
          </p>
          {preview.observedReplySignals?.length ? (
            <p className="mt-2 text-[9px] text-[#596E64]">
              Latest inbound keyword hints: {preview.observedReplySignals.join(', ')} (unconfirmed)
            </p>
          ) : null}
          {!preview.canSendNow ? (
            <p className="mt-2 text-[9px] leading-4 text-amber-800">
              Instagram sending is not currently authorized. You may prepare a draft,
              but the standard reply policy must allow any future send.
            </p>
          ) : null}
          <button
            type="button"
            onClick={() => onUse({
              experimentId: preview.experimentId,
              variantId: preview.variantId,
              body: preview.body,
            })}
            className="mt-3 rounded-md bg-[#153E33] px-3 py-2 text-[10px] font-semibold text-white"
          >
            Use as reply draft — do not send
          </button>
        </div>
      ) : null}
    </div>
  );
}
