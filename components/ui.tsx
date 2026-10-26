import { ReactNode } from 'react';
import { ArrowDownRight, ArrowUpRight, Minus } from 'lucide-react';
import { Channel, IntentLevel, PipelineStage } from '@/types/crm';

export function PageHeader({ eyebrow, title, description, actions }: { eyebrow?: string; title: string; description?: string; actions?: ReactNode }) {
  return (
    <div className="ui-page-header">
      <div className="min-w-0">
        {eyebrow && <div className="ui-page-kicker">{eyebrow}</div>}
        <h1 className="ui-page-title">{title}</h1>
        {description && <p className="ui-page-description">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function StatCard({ label, value, delta, note, icon }: { label: string; value: string; delta?: number; note?: string; icon?: ReactNode }) {
  const positive = typeof delta === 'number' && delta > 0;
  const negative = typeof delta === 'number' && delta < 0;
  return (
    <div className="card-pad">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="text-[12px] font-semibold text-copy-muted">{label}</div>
          <div className="mt-1.5 text-[28px] font-semibold tracking-[-0.035em] text-copy-strong">{value}</div>
        </div>
        {icon && <div className="grid h-10 w-10 shrink-0 place-items-center rounded-ui bg-brand-50 text-brand-700">{icon}</div>}
      </div>
      {(delta !== undefined || note) && (
        <div className="mt-3.5 flex items-center gap-2 text-xs">
          {delta !== undefined && (
            <span className={`inline-flex items-center gap-1 font-semibold ${positive ? 'text-emerald-600' : negative ? 'text-rose-600' : 'text-copy-muted'}`}>
              {positive ? <ArrowUpRight size={13} /> : negative ? <ArrowDownRight size={13} /> : <Minus size={13} />}
              {Math.abs(delta)}%
            </span>
          )}
          {note && <span className="text-copy-subtle">{note}</span>}
        </div>
      )}
    </div>
  );
}

const stageStyles: Record<PipelineStage, string> = {
  new: 'bg-sky-50 text-sky-700 ring-sky-200',
  contacted: 'bg-cyan-50 text-cyan-700 ring-cyan-200',
  engaged: 'bg-indigo-50 text-indigo-700 ring-indigo-200',
  qualified: 'bg-violet-50 text-violet-700 ring-violet-200',
  high_intent: 'bg-orange-50 text-orange-700 ring-orange-200',
  payment_pending: 'bg-amber-50 text-amber-700 ring-amber-200',
  closed_won: 'bg-emerald-100 text-emerald-800 ring-emerald-300',
  enrolled: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  nurture: 'bg-fuchsia-50 text-fuchsia-700 ring-fuchsia-200',
  not_now: 'bg-slate-100 text-slate-600 ring-slate-200',
  lost: 'bg-rose-50 text-rose-700 ring-rose-200',
  unqualified: 'bg-slate-100 text-slate-500 ring-slate-200',
  duplicate: 'bg-slate-100 text-slate-500 ring-slate-200',
};

export function StageBadge({ stage }: { stage: PipelineStage }) {
  return <span className={`inline-flex whitespace-nowrap rounded-full px-2.5 py-1 text-[11px] font-semibold capitalize ring-1 ring-inset ${stageStyles[stage]}`}>{stage.replaceAll('_', ' ')}</span>;
}

const intentStyles: Record<IntentLevel, string> = {
  unknown: 'text-copy-subtle',
  low: 'text-copy-muted',
  medium: 'text-sky-700',
  high: 'text-orange-700',
  very_high: 'text-rose-700',
};

export function IntentLabel({ intent }: { intent: IntentLevel }) {
  return <span className={`text-xs font-semibold capitalize ${intentStyles[intent]}`}>{intent.replace('_', ' ')}</span>;
}

export function ChannelBadge({ channel }: { channel: Channel }) {
  const names: Record<Channel, string> = {
    website: 'Website',
    instagram: 'Instagram',
    whatsapp: 'WhatsApp',
    email: 'Email',
    phone: 'Phone',
    meta_lead_form: 'Meta Form',
    other: 'Other',
  };

  return <span className="inline-flex rounded-ui bg-surface-muted px-2 py-1 text-[11px] font-semibold text-copy-muted">{names[channel]}</span>;
}

export function ProgressBar({ value, max = 100 }: { value: number; max?: number }) {
  const width = Math.max(3, Math.min(100, (value / max) * 100));
  return <div className="h-2 overflow-hidden rounded-full bg-surface-muted"><div className="h-full rounded-full bg-brand-700" style={{ width: `${width}%` }} /></div>;
}

export function EmptyState({ title, description }: { title: string; description: string }) {
  return (
    <div className="card-pad text-center">
      <div className="text-sm font-semibold text-copy-strong">{title}</div>
      <div className="mt-1 text-sm text-copy-muted">{description}</div>
    </div>
  );
}
