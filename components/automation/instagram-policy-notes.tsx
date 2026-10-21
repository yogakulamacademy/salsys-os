import { ShieldCheck } from 'lucide-react';

export function InstagramPolicyNotes() {
  return (
    <details className="group rounded-2xl border border-slate-200 bg-white">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3.5 text-sm font-semibold text-slate-800 [&::-webkit-details-marker]:hidden">
        <span className="flex items-center gap-2.5">
          <span className="grid h-8 w-8 place-items-center rounded-xl bg-violet-50 text-violet-700">
            <ShieldCheck size={15} />
          </span>
          Instagram messaging rules
        </span>
        <span className="text-xs font-semibold text-violet-700 group-open:hidden">View rules</span>
        <span className="hidden text-xs font-semibold text-violet-700 group-open:inline">Hide rules</span>
      </summary>
      <div className="grid gap-3 border-t border-slate-100 p-4 text-xs leading-5 text-slate-600 md:grid-cols-2">
        <div className="rounded-xl bg-slate-50 p-3">
          <strong className="text-slate-900">24-hour reply window</strong>
          <p className="mt-1">Customer-initiated DM replies must remain inside the permitted conversation window.</p>
        </div>
        <div className="rounded-xl bg-slate-50 p-3">
          <strong className="text-slate-900">one-time private reply</strong>
          <p className="mt-1">A comment can receive only the permitted private-reply action before normal messaging rules apply.</p>
        </div>
        <div className="rounded-xl bg-slate-50 p-3">
          <strong className="text-slate-900">Comment permission</strong>
          <p className="mt-1">Comment-to-DM automation requires the Meta comment-management permission and fails closed when it is unavailable.</p>
        </div>
        <div className="rounded-xl bg-slate-50 p-3">
          <strong className="text-slate-900">No cold broadcast</strong>
          <p className="mt-1">Instagram is not treated as a cold/bulk broadcast channel. Automation remains tied to supported customer or engagement events.</p>
        </div>
      </div>
    </details>
  );
}
