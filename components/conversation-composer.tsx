'use client';

import {
  LockKeyhole,
  Send,
} from 'lucide-react';
import {
  useRef,
  useState,
} from 'react';
import {
  useFormStatus,
} from 'react-dom';

type ServerAction = (
  formData: FormData
) => void | Promise<void>;

export function WhatsAppComposer({
  action,
  windowOpen,
  windowLabel,
}: {
  action: ServerAction;
  windowOpen: boolean;
  windowLabel: string;
}) {
  const [body, setBody] = useState('');
  const formRef =
    useRef<HTMLFormElement | null>(null);

  if (!windowOpen) {
    return (
      <div className="border-t border-slate-100 bg-white p-4">
        <div className="flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4">
          <div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-amber-100 text-amber-700">
            <LockKeyhole size={17} />
          </div>

          <div className="min-w-0 flex-1">
            <div className="text-sm font-bold text-amber-800">
              24-hour WhatsApp window expired
            </div>

            <p className="mt-1 text-xs leading-5 text-amber-700">
              A free-form reply cannot be sent now. An approved WhatsApp template is required to restart the conversation.
            </p>

            <div className="mt-2 text-[10px] font-semibold text-amber-600">
              {windowLabel}
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <form
      ref={formRef}
      action={action}
      className="border-t border-slate-100 bg-white p-4"
    >
      <div className="rounded-2xl border border-slate-200 bg-slate-50 p-2 transition focus-within:border-brand/30 focus-within:bg-white focus-within:ring-4 focus-within:ring-brand/5">
        <textarea
          name="body"
          value={body}
          onChange={(event) =>
            setBody(
              event.target.value.slice(
                0,
                4096
              )
            )
          }
          onKeyDown={(event) => {
            if (
              event.key === 'Enter' &&
              !event.shiftKey
            ) {
              event.preventDefault();

              if (body.trim()) {
                formRef.current?.requestSubmit();
              }
            }
          }}
          required
          rows={2}
          maxLength={4096}
          autoComplete="off"
          placeholder="Reply on WhatsApp..."
          className="max-h-40 min-h-[58px] w-full resize-none bg-transparent px-2 py-2 text-sm leading-5 outline-none placeholder:text-slate-400"
        />

        <div className="flex flex-wrap items-center justify-between gap-3 px-1 pb-1">
          <div className="flex items-center gap-3 text-[10px] font-semibold text-slate-400">
            <span>
              Enter to send · Shift + Enter for new line
            </span>

            <span>
              {body.length}/4096
            </span>
          </div>

          <SubmitButton
            disabled={!body.trim()}
          />
        </div>
      </div>

      <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-[10px] font-semibold">
        <span className="text-emerald-600">
          {windowLabel}
        </span>

        <span className="text-slate-400">
          Sent through WhatsApp Cloud API + logged in CRM
        </span>
      </div>
    </form>
  );
}

function SubmitButton({
  disabled,
}: {
  disabled: boolean;
}) {
  const { pending } =
    useFormStatus();

  return (
    <button
      type="submit"
      disabled={
        disabled || pending
      }
      className="btn-primary !rounded-xl !px-4 !py-2 disabled:cursor-not-allowed disabled:opacity-50"
    >
      <Send size={14} />
      {pending
        ? 'Sending...'
        : 'Send'}
    </button>
  );
}
