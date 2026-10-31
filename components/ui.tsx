import type { ReactNode } from 'react';
import {
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  Info,
} from 'lucide-react';

import {
  DecisionMetricCard,
  type DecisionMetricCardProps,
} from '@/components/intelligence/decision-metric-card';
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

export function StatCard({
  label,
  value,
  delta,
  note,
  icon,
  href,
  comparisonLabel,
  deltaDirection = 'neutral',
  tone = 'neutral',
  statusLabel,
  definition,
  evidenceLabel,
  trend,
}: {
  label: string;
  value: string;
  delta?: number | null;
  note?: string;
  icon?: ReactNode;
  href?: string;
  comparisonLabel?: string;
  deltaDirection?: DecisionMetricCardProps['deltaDirection'];
  tone?: DecisionMetricCardProps['tone'];
  statusLabel?: string;
  definition?: string;
  evidenceLabel?: string;
  trend?: number[];
}) {
  return (
    <DecisionMetricCard
      label={label}
      value={value}
      detail={note}
      icon={icon}
      href={href}
      delta={delta}
      comparisonLabel={comparisonLabel}
      deltaDirection={deltaDirection}
      tone={tone}
      statusLabel={statusLabel}
      definition={definition}
      evidenceLabel={evidenceLabel}
      trend={trend}
    />
  );
}

type NoticeTone = 'success' | 'warning' | 'error' | 'info';

const noticeStyles: Record<NoticeTone, { container: string; icon: string }> = {
  success: {
    container: 'border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900/60 dark:bg-emerald-950/25 dark:text-emerald-200',
    icon: 'text-emerald-600 dark:text-emerald-300',
  },
  warning: {
    container: 'border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900/60 dark:bg-amber-950/25 dark:text-amber-200',
    icon: 'text-amber-600 dark:text-amber-300',
  },
  error: {
    container: 'border-rose-200 bg-rose-50 text-rose-800 dark:border-rose-900/60 dark:bg-rose-950/25 dark:text-rose-200',
    icon: 'text-rose-600 dark:text-rose-300',
  },
  info: {
    container: 'border-sky-200 bg-sky-50 text-sky-800 dark:border-sky-900/60 dark:bg-sky-950/25 dark:text-sky-200',
    icon: 'text-sky-600 dark:text-sky-300',
  },
};

const noticeIcons: Record<NoticeTone, ReactNode> = {
  success: <CheckCircle2 size={17} />,
  warning: <AlertTriangle size={17} />,
  error: <AlertCircle size={17} />,
  info: <Info size={17} />,
};

export function Notice({
  tone = 'info',
  title,
  children,
  action,
  className = '',
}: {
  tone?: NoticeTone;
  title?: string;
  children: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  const styles = noticeStyles[tone];

  return (
    <div
      role={tone === 'error' ? 'alert' : 'status'}
      className={`flex items-start gap-3 rounded-ui border px-4 py-3 text-sm ${styles.container} ${className}`}
    >
      <span className={`mt-0.5 shrink-0 ${styles.icon}`} aria-hidden="true">
        {noticeIcons[tone]}
      </span>
      <div className="min-w-0 flex-1">
        {title ? <div className="font-semibold">{title}</div> : null}
        <div className={`${title ? 'mt-0.5 text-xs leading-5 opacity-90' : 'text-xs font-semibold leading-5'}`}>
          {children}
        </div>
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
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

export function EmptyState({
  title,
  description,
  icon,
  action,
  compact = false,
}: {
  title: string;
  description: string;
  icon?: ReactNode;
  action?: ReactNode;
  compact?: boolean;
}) {
  return (
    <div className={`card-pad text-center ${compact ? '!p-5' : ''}`}>
      {icon ? (
        <div className="mx-auto mb-3 grid h-10 w-10 place-items-center rounded-xl bg-surface-muted text-copy-subtle">
          {icon}
        </div>
      ) : null}
      <div className="text-sm font-semibold text-copy-strong">{title}</div>
      <div className="mx-auto mt-1 max-w-md text-sm leading-5 text-copy-muted">{description}</div>
      {action ? <div className="mt-4 flex justify-center">{action}</div> : null}
    </div>
  );
}
