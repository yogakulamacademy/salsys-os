'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import {
  ArrowRight,
  BellRing,
  CheckCircle2,
  ChevronRight,
  CirclePlus,
  Clock3,
  FileText,
  GitBranch,
  Info,
  Layers3,
  Play,
  Plus,
  Save,
  Search,
  ShieldCheck,
  Sparkles,
  Trash2,
  UserRound,
  Zap,
} from 'lucide-react';

import {
  archiveSmartTriggerWorkflowAction,
  createSmartTriggerWorkflowAction,
} from '@/app/automation/actions';

type Workflow = {
  id: string;
  name: string;
  description: string | null;
  status: 'draft' | 'active' | 'paused' | 'archived';
  updated_at: string;
};

type WorkflowTrigger = {
  workflow_id: string;
  event_name: string | null;
  enabled: boolean;
  config: Record<string, unknown> | null;
};

type WorkflowAction = {
  workflow_id: string;
  action_type: string;
  requires_approval: boolean;
  config: Record<string, unknown> | null;
};

type RuleField = 'source' | 'country' | 'stage' | 'priority' | 'course';
type RuleOperator = 'is' | 'is_not';
type JoinMode = 'AND' | 'OR';

type Rule = {
  id: number;
  field: RuleField;
  op: RuleOperator;
  value: string;
};

type Group = {
  id: number;
  join: JoinMode;
  rules: Rule[];
};

type SampleLead = {
  name: string;
  source: string;
  country: string;
  stage: string;
  priority: string;
  course: string;
};

const eventOptions = [
  { value: 'lead.created', label: 'New lead created', preview: 'A new lead is created', help: 'Example: a visitor submits an enquiry form and a new lead appears in your CRM.' },
  { value: 'lead.stage_changed', label: 'Lead stage changes', preview: 'A lead changes stage', help: 'Example: someone moves a lead from New to Qualified in your CRM pipeline.' },
  { value: 'message.received', label: 'New customer message received', preview: 'A customer sends a message', help: 'Example: a customer sends a new message to a connected inbox channel.' },
  { value: 'payment.pending', label: 'Payment pending', preview: 'A payment becomes pending', help: 'Example: a payment or booking reaches the pending-payment stage.' },
];

const actionOptions = [
  { value: 'create_followup', label: 'Create a follow-up task', detail: 'Follow-up task title' },
  { value: 'assign_owner', label: 'Assign the lead to a teammate', detail: 'Assignment note' },
  { value: 'notify_user', label: 'Notify an internal teammate', detail: 'Notification title' },
];

const fieldOptions: Record<RuleField, { label: string; values: string[] }> = {
  source: { label: 'Lead source', values: ['Website enquiry', 'WhatsApp', 'Instagram', 'Google Ads', 'Direct'] },
  country: { label: 'Country', values: ['India', 'UAE', 'USA', 'United Kingdom'] },
  stage: { label: 'CRM stage', values: ['New', 'Qualified', 'Engaged', 'Payment Pending', 'Enrolled'] },
  priority: { label: 'Priority', values: ['Urgent', 'High', 'Normal', 'Waiting'] },
  course: { label: 'Course', values: ['200-hour TTC Mysore', '300-hour TTC Mysore', '500-hour TTC Mysore', 'Sound Healing', 'Not selected'] },
};

const samples: Record<string, SampleLead> = {
  aarav: { name: 'Aarav Sharma', source: 'Website enquiry', country: 'India', stage: 'Qualified', priority: 'High', course: '200-hour TTC Mysore' },
  maya: { name: 'Maya Khan', source: 'Instagram', country: 'UAE', stage: 'Qualified', priority: 'Normal', course: '300-hour TTC Mysore' },
  olivia: { name: 'Olivia Baker', source: 'WhatsApp', country: 'USA', stage: 'New', priority: 'Normal', course: 'Not selected' },
  ravi: { name: 'Ravi Rao', source: 'Instagram', country: 'India', stage: 'Engaged', priority: 'Urgent', course: 'Sound Healing' },
};

function stringConfig(config: Record<string, unknown> | null, key: string, fallback = '') {
  const value = config?.[key];
  return typeof value === 'string' ? value : fallback;
}

function numberConfig(config: Record<string, unknown> | null, key: string, fallback = 0) {
  const value = Number(config?.[key]);
  return Number.isFinite(value) ? value : fallback;
}

function relativeTime(value: string) {
  const diff = Date.now() - new Date(value).getTime();
  const minutes = Math.max(0, Math.floor(diff / 60000));
  if (minutes < 1) return 'Updated just now';
  if (minutes < 60) return `Updated ${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `Updated ${hours}h ago`;
  return `Updated ${Math.floor(hours / 24)}d ago`;
}

function prettyEvent(value: string | null) {
  return eventOptions.find((option) => option.value === value)?.label ?? 'Automation event';
}

function prettyAction(value: string) {
  return actionOptions.find((option) => option.value === value)?.label ?? value.replaceAll('_', ' ');
}

function Metric({ label, value, note, icon: Icon, tone = 'green' }: { label: string; value: number; note: string; icon: React.ComponentType<{ size?: number }>; tone?: 'green' | 'amber' | 'blue' }) {
  const toneClass = tone === 'amber' ? 'bg-[#fff7ec] text-[#b17c32]' : tone === 'blue' ? 'bg-[#eff7fb] text-[#4782a9]' : 'bg-[#edf6f0] text-[#23654f]';
  return (
    <div className="flex min-w-0 items-center gap-3 rounded-[12px] border border-[#dde7e0] bg-white px-4 py-3 shadow-[0_2px_8px_rgba(16,50,38,0.035)]">
      <div className={`grid h-9 w-9 shrink-0 place-items-center rounded-[10px] ${toneClass}`}><Icon size={17} /></div>
      <div className="min-w-0"><div className="text-[11px] font-semibold text-[#6c8176]">{label}</div><div className="text-[23px] font-bold leading-7 tracking-[-0.04em] text-[#153e32]">{value}</div><div className="truncate text-[10.5px] text-[#8b9c93]">{note}</div></div>
    </div>
  );
}

export function SmartTriggerBuilder({
  workflows,
  triggers,
  actions,
  runs,
  canManage,
}: {
  workflows: Workflow[];
  triggers: WorkflowTrigger[];
  actions: WorkflowAction[];
  runs: number;
  canManage: boolean;
}) {
  const [view, setView] = useState<'builder' | 'library'>('builder');
  const [name, setName] = useState('Follow up with new leads');
  const [eventName, setEventName] = useState('lead.created');
  const [conditionMode, setConditionMode] = useState<'all' | 'specific'>('specific');
  const [groupsJoin, setGroupsJoin] = useState<JoinMode>('OR');
  const [actionType, setActionType] = useState('create_followup');
  const [actionOwner, setActionOwner] = useState('lead_owner');
  const [actionTitle, setActionTitle] = useState('Contact the new lead');
  const [delayMinutes, setDelayMinutes] = useState(0);
  const [search, setSearch] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [sampleKey, setSampleKey] = useState('aarav');
  const [simulation, setSimulation] = useState<{ matched: boolean; detail: string } | null>(null);
  const [serial, setSerial] = useState(100);
  const [groups, setGroups] = useState<Group[]>([
    { id: 1, join: 'AND', rules: [{ id: 11, field: 'source', op: 'is', value: 'Website enquiry' }, { id: 12, field: 'country', op: 'is', value: 'India' }] },
    { id: 2, join: 'AND', rules: [{ id: 21, field: 'source', op: 'is', value: 'Instagram' }, { id: 22, field: 'stage', op: 'is', value: 'Qualified' }] },
  ]);

  const visibleWorkflows = workflows.filter((workflow) => workflow.status !== 'archived');
  const active = visibleWorkflows.filter((workflow) => workflow.status === 'active').length;
  const drafts = visibleWorkflows.filter((workflow) => workflow.status === 'draft').length;
  const event = eventOptions.find((option) => option.value === eventName) ?? eventOptions[0];
  const action = actionOptions.find((option) => option.value === actionType) ?? actionOptions[0];

  const conditionExpression = useMemo(() => ({
    mode: conditionMode,
    groupsJoin,
    groups: conditionMode === 'specific' ? groups.map((group) => ({ join: group.join, rules: group.rules.map(({ field, op, value }) => ({ field, op, value })) })) : [],
  }), [conditionMode, groups, groupsJoin]);

  const ruleSummary = useMemo(() => {
    if (conditionMode === 'all') return 'Every lead qualifies — no additional filters.';
    return groups.map((group) => `(${group.rules.map((rule) => `${fieldOptions[rule.field].label} ${rule.op === 'is' ? 'is' : 'is not'} ${rule.value}`).join(` ${group.join} `)})`).join(` ${groupsJoin} `);
  }, [conditionMode, groups, groupsJoin]);

  const filteredWorkflows = visibleWorkflows.filter((workflow) => {
    const trigger = triggers.find((row) => row.workflow_id === workflow.id);
    const actionRow = actions.find((row) => row.workflow_id === workflow.id);
    return `${workflow.name} ${prettyEvent(trigger?.event_name ?? null)} ${prettyAction(actionRow?.action_type ?? '')}`.toLowerCase().includes(search.toLowerCase());
  });

  function nextId() {
    const next = serial + 1;
    setSerial(next);
    return next;
  }

  function addGroup() {
    if (groups.length >= 4) return;
    const id = nextId();
    setGroups((current) => [...current, { id, join: 'AND', rules: [{ id: id + 1000, field: 'country', op: 'is', value: 'India' }] }]);
  }

  function addRule(groupId: number) {
    setGroups((current) => current.map((group) => group.id !== groupId || group.rules.length >= 6 ? group : { ...group, rules: [...group.rules, { id: nextId(), field: 'stage', op: 'is', value: 'Qualified' }] }));
  }

  function updateRule(groupId: number, ruleId: number, patch: Partial<Rule>) {
    setGroups((current) => current.map((group) => group.id !== groupId ? group : {
      ...group,
      rules: group.rules.map((rule) => {
        if (rule.id !== ruleId) return rule;
        if (patch.field && patch.field !== rule.field) return { ...rule, ...patch, value: fieldOptions[patch.field].values[0] };
        return { ...rule, ...patch };
      }),
    }));
  }

  function removeRule(groupId: number, ruleId: number) {
    setGroups((current) => current.map((group) => group.id !== groupId || group.rules.length <= 1 ? group : { ...group, rules: group.rules.filter((rule) => rule.id !== ruleId) }));
  }

  function removeGroup(groupId: number) {
    if (groups.length <= 1) return;
    setGroups((current) => current.filter((group) => group.id !== groupId));
  }

  function evaluateSample() {
    const lead = samples[sampleKey];
    const evaluateRule = (rule: Rule) => {
      const matched = String(lead[rule.field]) === rule.value;
      return rule.op === 'is' ? matched : !matched;
    };
    const groupMatches = groups.map((group) => group.join === 'AND' ? group.rules.every(evaluateRule) : group.rules.some(evaluateRule));
    const matched = conditionMode === 'all' || (groupsJoin === 'AND' ? groupMatches.every(Boolean) : groupMatches.some(Boolean));
    setSimulation({ matched, detail: matched ? `${lead.name} matches this draft. If the trigger were runtime-ready and activated, SalsysOS would ${action.label.toLowerCase()}. No real record was changed.` : `${lead.name} does not satisfy the full condition expression. Nothing would run.` });
  }

  return (
    <div className="space-y-4">
      <header className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
        <div><div className="text-[10px] font-bold uppercase tracking-[0.14em] text-[#80958a]">Automation Studio / Smart Triggers</div><h1 className="mt-1 text-[27px] font-bold tracking-[-0.035em] text-[#153e32]">Smart Triggers</h1><p className="mt-1 max-w-3xl text-[12.5px] text-[#667d71]">Set up simple automations in a few steps. Tell SalsysOS <b>when</b> something happens and <b>what</b> should happen next.</p></div>
        <div className="flex flex-wrap gap-2"><Link href="/automation/recipes" className="inline-flex h-9 items-center gap-2 rounded-[9px] border border-[#dde7e0] bg-white px-3 text-xs font-bold text-[#153e32]"><Sparkles size={14} /> Starter recipes</Link><button type="button" onClick={() => { setView('builder'); document.getElementById('trigger-name')?.focus(); }} className="inline-flex h-9 items-center gap-2 rounded-[9px] bg-[#23654f] px-3 text-xs font-bold text-white"><Plus size={14} /> Create trigger</button></div>
      </header>

      <div className="flex items-start gap-3 rounded-[11px] border border-[#caead7] bg-[#f0faf4] px-3.5 py-3"><div className="grid h-8 w-8 shrink-0 place-items-center rounded-[9px] bg-[#d4f1e0] text-[#168558]"><ShieldCheck size={16} /></div><div><div className="text-xs font-bold text-[#234c3b]">Safe by default</div><p className="mt-0.5 text-[11.5px] text-[#417763]">New triggers are saved as drafts. Nothing runs or sends customer messages until reviewed and activated.</p></div><Link href="/automation/readiness" className="ml-auto hidden h-8 items-center gap-1 rounded-lg border border-[#caead7] bg-white px-3 text-[11px] font-bold text-[#2f7558] sm:inline-flex">How activation works <ArrowRight size={12} /></Link></div>

      <section className="grid gap-2.5 sm:grid-cols-2 xl:grid-cols-4"><Metric label="Total triggers" value={visibleWorkflows.length} note="Created in this workspace" icon={GitBranch} /><Metric label="Active" value={active} note="Currently running" icon={CheckCircle2} /><Metric label="Drafts" value={drafts} note="Not live yet" icon={FileText} tone="amber" /><Metric label="Runs" value={runs} note="Recorded executions" icon={Zap} tone="blue" /></section>

      <div className="flex flex-wrap items-center justify-between gap-3"><div className="flex rounded-[10px] border border-[#e2e9e3] bg-[#ebf1ec] p-1"><button type="button" onClick={() => setView('builder')} className={`flex items-center gap-1.5 rounded-[7px] px-3.5 py-2 text-xs font-bold ${view === 'builder' ? 'bg-white text-[#153e32] shadow-sm' : 'text-[#718578]'}`}><Plus size={14} /> Build a trigger</button><button type="button" onClick={() => setView('library')} className={`flex items-center gap-1.5 rounded-[7px] px-3.5 py-2 text-xs font-bold ${view === 'library' ? 'bg-white text-[#153e32] shadow-sm' : 'text-[#718578]'}`}><Layers3 size={14} /> My triggers ({visibleWorkflows.length})</button></div><div className="hidden text-[11px] text-[#7b9183] sm:block"><b className="text-[#416851]">New to automations?</b> Follow the four steps below.</div></div>

      {view === 'library' ? (
        <section className="rounded-[14px] border border-[#dde7e0] bg-white p-5"><div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div><h2 className="text-base font-bold text-[#153e32]">My triggers <span className="ml-1 rounded-full bg-[#fff6e9] px-2 py-1 text-[10px] text-[#9d6420]">{drafts} drafts</span></h2><p className="mt-1 text-[11.5px] text-[#859788]">Review existing automations, open their flow, or archive an old draft.</p></div><label className="flex h-9 items-center gap-2 rounded-lg border border-[#dde7e0] px-3 text-[#7d9187]"><Search size={14} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search triggers..." className="w-52 text-xs outline-none" /></label></div><div className="mt-4 grid gap-3 lg:grid-cols-2">{filteredWorkflows.length ? filteredWorkflows.map((workflow) => { const trigger = triggers.find((row) => row.workflow_id === workflow.id); const actionRow = actions.find((row) => row.workflow_id === workflow.id); return <article key={workflow.id} className="rounded-xl border border-[#dde7e0] p-4"><div className="flex items-start justify-between gap-3"><div className="grid h-9 w-9 place-items-center rounded-lg bg-[#edf6f1] text-[#23654f]"><GitBranch size={16} /></div><span className="rounded-full border border-[#f2e3c9] bg-[#fdf6e7] px-2 py-1 text-[9px] font-bold text-[#966b36]">{workflow.status}</span></div><h3 className="mt-3 text-sm font-bold text-[#153e32]">{workflow.name}</h3><p className="mt-1 text-[11px] text-[#74877a]">{relativeTime(workflow.updated_at)}</p><div className="mt-3 rounded-lg border border-[#e4ece5] bg-[#f9fbf9] p-3 text-[10.5px] text-[#5a7767]">{prettyEvent(trigger?.event_name ?? null)} <b>→</b> {prettyAction(actionRow?.action_type ?? 'create_followup')}</div><div className="mt-3 flex flex-wrap items-center justify-between gap-2"><span className="text-[10.5px] text-[#88998e]">{workflow.status === 'active' ? 'Active workflow' : 'Draft · Needs review'}</span><div className="flex gap-2"><Link href={`/automation/flow-builder?workflow=${workflow.id}`} className="inline-flex h-8 items-center gap-1 rounded-lg border border-[#dde7e0] px-2.5 text-[10.5px] font-bold text-[#347e60]">Open flow <ChevronRight size={11} /></Link>{canManage ? <form action={archiveSmartTriggerWorkflowAction}><input type="hidden" name="workflow_id" value={workflow.id} /><button type="submit" className="inline-flex h-8 items-center gap-1 rounded-lg border border-rose-200 bg-rose-50 px-2.5 text-[10.5px] font-bold text-rose-700"><Trash2 size={11} /> Archive</button></form> : null}</div></div></article>; }) : <div className="col-span-full rounded-xl border border-dashed border-[#dce6df] px-6 py-10 text-center text-[#7e9285]"><h3 className="font-bold">No matching triggers</h3><p className="mt-1 text-xs">Try searching for an event or action, or create a new trigger.</p></div>}</div></section>
      ) : (
        <>
          <section className="flex gap-2 overflow-x-auto rounded-[13px] border border-[#dde7e0] bg-white px-4 py-3">{[['1','When','Choose an event'],['2','Only if','Set optional filters'],['3','Then','Choose an action'],['4','Review','Test & save draft']].map(([number,title,subtitle], index) => <div key={number} className="flex min-w-[190px] flex-1 items-center gap-2"><div className="grid h-7 w-7 place-items-center rounded-lg bg-[#eef7f1] text-[11px] font-bold text-[#297054]">{number}</div><div><strong className="block text-[11px] text-[#153e32]">{title}</strong><span className="text-[10px] text-[#829487]">{subtitle}</span></div>{index < 3 ? <ArrowRight size={13} className="ml-auto text-[#a2b5a6]" /> : null}</div>)}</section>

          <div className="grid gap-3 xl:grid-cols-[minmax(0,1.46fr)_minmax(310px,.88fr)]">
            <form action={createSmartTriggerWorkflowAction} className="overflow-hidden rounded-[14px] border border-[#dde7e0] bg-white shadow-[0_2px_8px_rgba(16,50,38,0.035)]">
              <input type="hidden" name="condition_expression" value={JSON.stringify(conditionExpression)} />
              <input type="hidden" name="action_type" value={actionType} />
              <input type="hidden" name="action_owner" value={actionOwner} />
              <input type="hidden" name="action_title" value={actionTitle} />
              <input type="hidden" name="followup_delay_minutes" value={String(delayMinutes)} />
              <div className="flex items-start justify-between border-b border-[#e9efeb] px-5 py-4"><div><h2 className="text-base font-bold text-[#153e32]">Configure your trigger</h2><p className="mt-1 text-[11.5px] text-[#819386]">A guided setup for a single event and one internal action.</p></div><span className="rounded-full border border-[#f4e6cb] bg-[#fff6e9] px-2.5 py-1 text-[10px] font-bold text-[#9d6420]">● Draft mode</span></div>

              <div className="px-5">
                <div className="border-b border-[#e9efeb] py-4"><div className="mb-3 flex gap-3"><div className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-[#e9f5ed] text-xs font-bold text-[#23654f]">1</div><div><h3 className="text-[13.5px] font-bold text-[#153e32]">When should this happen?</h3><p className="mt-1 text-[11px] text-[#88978e]">Pick the event that starts this automation.</p></div></div><div className="grid gap-3 sm:grid-cols-2"><label><span className="mb-1.5 block text-[11.5px] font-bold text-[#435d4e]">Trigger name *</span><input id="trigger-name" name="name" value={name} onChange={(event) => setName(event.target.value)} required maxLength={180} className="h-10 w-full rounded-lg border border-[#dce7df] px-3 text-xs outline-none focus:border-[#88baa0]" /></label><label><span className="mb-1.5 block text-[11.5px] font-bold text-[#435d4e]">Starting event *</span><select name="event_name" value={eventName} onChange={(event) => setEventName(event.target.value)} className="h-10 w-full rounded-lg border border-[#dce7df] px-3 text-xs">{eventOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label></div><div className="mt-3 flex items-start gap-2 rounded-lg border border-[#e6eee8] bg-[#f4f8f5] px-3 py-2.5 text-[11px] text-[#657d6d]"><Info size={14} className="mt-0.5 text-[#4e856b]" /> {event.help}</div></div>

                <div className="border-b border-[#e9efeb] py-4"><div className="mb-3 flex gap-3"><div className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-[#e9f5ed] text-xs font-bold text-[#23654f]">2</div><div><h3 className="text-[13.5px] font-bold text-[#153e32]">Which leads should qualify?</h3><p className="mt-1 text-[11px] text-[#88978e]">Build simple or advanced rules. Combine conditions with AND or OR without code.</p></div></div><div className="flex flex-wrap gap-2"><button type="button" onClick={() => setConditionMode('all')} className={`rounded-lg border px-3 py-2 text-[11.5px] font-bold ${conditionMode === 'all' ? 'border-[#8dc8a3] bg-[#f2faf5] text-[#21654c]' : 'border-[#dfe7e0] text-[#536a5c]'}`}>Every lead</button><button type="button" onClick={() => setConditionMode('specific')} className={`rounded-lg border px-3 py-2 text-[11.5px] font-bold ${conditionMode === 'specific' ? 'border-[#8dc8a3] bg-[#f2faf5] text-[#21654c]' : 'border-[#dfe7e0] text-[#536a5c]'}`}>Only when conditions match</button></div>{conditionMode === 'specific' ? <div className="mt-3 rounded-[10px] border border-[#e9efeb] bg-[#f8faf8] p-3"><div className="flex flex-wrap items-center justify-between gap-2"><div><div className="text-xs font-bold text-[#153e32]">Condition groups</div><p className="mt-1 text-[10.5px] text-[#7a9182]">Rules inside a group can use AND or OR. Combine groups for complex logic.</p></div><div className="flex rounded-lg bg-[#e1ece5] p-1"><button type="button" onClick={() => setGroupsJoin('OR')} className={`rounded-md px-2.5 py-1.5 text-[10.5px] font-bold ${groupsJoin === 'OR' ? 'bg-white text-[#1e6f4f]' : 'text-[#6d8274]'}`}>ANY group OR</button><button type="button" onClick={() => setGroupsJoin('AND')} className={`rounded-md px-2.5 py-1.5 text-[10.5px] font-bold ${groupsJoin === 'AND' ? 'bg-white text-[#1e6f4f]' : 'text-[#6d8274]'}`}>ALL groups AND</button></div></div><div className="mt-3 space-y-3">{groups.map((group, groupIndex) => <div key={group.id}>{groupIndex > 0 ? <div className="my-2 flex items-center gap-2 text-[10px] font-bold text-[#296e4e]"><div className="h-px flex-1 bg-[#d4e5d8]" /><span className="rounded-full border border-[#d0e6d7] bg-[#e4f4e9] px-2 py-1">{groupsJoin}</span><div className="h-px flex-1 bg-[#d4e5d8]" /></div> : null}<div className="overflow-hidden rounded-[11px] border border-[#dbe8df] bg-white"><div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#e2ece5] bg-[#f2f8f4] px-3 py-2"><div className="flex items-center gap-2"><span className="rounded-md border border-[#c9e5d3] bg-[#ddf1e4] px-2 py-1 text-[10px] font-bold text-[#247455]">GROUP {groupIndex + 1}</span><span className="text-[11px] font-bold text-[#435d4e]">Match {group.join === 'AND' ? 'all' : 'any'} conditions</span></div><div className="flex items-center gap-2"><select value={group.join} onChange={(event) => setGroups((current) => current.map((candidate) => candidate.id === group.id ? { ...candidate, join: event.target.value as JoinMode } : candidate))} className="h-7 rounded-md border border-[#cbded1] bg-white px-2 text-[10.5px] font-bold text-[#205f46]"><option value="AND">AND</option><option value="OR">OR</option></select><button type="button" disabled={groups.length === 1} onClick={() => removeGroup(group.id)} className="grid h-7 w-7 place-items-center rounded-md border border-[#e3ebe5] text-[#87988d] disabled:opacity-30"><Trash2 size={12} /></button></div></div><div className="space-y-2 p-3">{group.rules.map((rule, ruleIndex) => <div key={rule.id}>{ruleIndex > 0 ? <div className="py-1 text-[9.5px] font-bold text-[#528266]">{group.join}</div> : null}<div className="grid gap-2 sm:grid-cols-[1.15fr_.7fr_1.2fr_32px]"><select value={rule.field} onChange={(event) => updateRule(group.id, rule.id, { field: event.target.value as RuleField })} className="h-9 rounded-lg border border-[#dce7df] px-2 text-[11px]">{Object.entries(fieldOptions).map(([key, field]) => <option key={key} value={key}>{field.label}</option>)}</select><select value={rule.op} onChange={(event) => updateRule(group.id, rule.id, { op: event.target.value as RuleOperator })} className="h-9 rounded-lg border border-[#dce7df] px-2 text-[11px]"><option value="is">is</option><option value="is_not">is not</option></select><select value={rule.value} onChange={(event) => updateRule(group.id, rule.id, { value: event.target.value })} className="h-9 rounded-lg border border-[#dce7df] px-2 text-[11px]">{fieldOptions[rule.field].values.map((value) => <option key={value} value={value}>{value}</option>)}</select><button type="button" disabled={group.rules.length === 1} onClick={() => removeRule(group.id, rule.id)} className="grid h-9 w-8 place-items-center rounded-lg border border-[#e3ebe5] text-[#87988d] disabled:opacity-30"><Trash2 size={12} /></button></div></div>)}<div className="flex items-center gap-2 pt-1"><button type="button" disabled={group.rules.length >= 6} onClick={() => addRule(group.id)} className="inline-flex items-center gap-1 rounded-lg border border-dashed border-[#b7d2c0] bg-[#f4faf5] px-2.5 py-2 text-[10.5px] font-bold text-[#286d50]"><Plus size={12} /> Add condition</button><span className="ml-auto text-[10px] text-[#819588]">{group.rules.length} of 6 rules</span></div></div></div></div>)}</div><button type="button" disabled={groups.length >= 4} onClick={addGroup} className="mt-3 inline-flex w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-[#b7d2c0] bg-[#f7fbf8] px-3 py-2.5 text-[11px] font-bold text-[#236e4f]"><CirclePlus size={13} /> Add condition group</button><div className="mt-3 rounded-lg border border-[#cae4d4] bg-[#f0f8f2] p-3"><div className="text-[10px] font-bold uppercase tracking-[0.06em] text-[#367456]">Plain-language rule summary</div><p className="mt-1.5 text-[11px] leading-5 text-[#365a43]">{ruleSummary}</p></div></div> : null}</div>

                <div className="border-b border-[#e9efeb] py-4"><div className="mb-3 flex gap-3"><div className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-[#e9f5ed] text-xs font-bold text-[#23654f]">3</div><div><h3 className="text-[13.5px] font-bold text-[#153e32]">What should SalsysOS do next?</h3><p className="mt-1 text-[11px] text-[#88978e]">Choose one internal action. Build multi-step sequences in Flow Builder.</p></div></div><div className="grid gap-3 sm:grid-cols-2"><label><span className="mb-1.5 block text-[11.5px] font-bold text-[#435d4e]">Action *</span><select value={actionType} onChange={(event) => setActionType(event.target.value)} className="h-10 w-full rounded-lg border border-[#dce7df] px-3 text-xs">{actionOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label><label><span className="mb-1.5 block text-[11.5px] font-bold text-[#435d4e]">Person responsible</span><select value={actionOwner} onChange={(event) => setActionOwner(event.target.value)} className="h-10 w-full rounded-lg border border-[#dce7df] px-3 text-xs"><option value="lead_owner">Lead owner (recommended)</option><option value="admissions_team">Admissions team</option><option value="available_agent">Available agent</option></select></label></div><div className="mt-3 grid gap-3 sm:grid-cols-2"><label><span className="mb-1.5 block text-[11.5px] font-bold text-[#435d4e]">{action.detail}</span><input value={actionTitle} onChange={(event) => setActionTitle(event.target.value)} className="h-10 w-full rounded-lg border border-[#dce7df] px-3 text-xs" /></label><label><span className="mb-1.5 block text-[11.5px] font-bold text-[#435d4e]">When should it happen?</span><select value={delayMinutes} onChange={(event) => setDelayMinutes(Number(event.target.value))} className="h-10 w-full rounded-lg border border-[#dce7df] px-3 text-xs"><option value={0}>Immediately</option><option value={15}>After 15 minutes</option><option value={60}>After 1 hour</option><option value={1440}>After 1 day</option></select></label></div><div className="mt-3 flex items-start gap-2 rounded-lg border border-[#e6eee8] bg-[#f4f8f5] px-3 py-2.5 text-[11px] text-[#657d6d]"><ShieldCheck size={14} className="mt-0.5 text-[#4e856b]" /> Internal action only. This screen does not send WhatsApp, Instagram, or email messages.</div></div>

                <div className="py-4"><div className="mb-3 flex gap-3"><div className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-[#e9f5ed] text-xs font-bold text-[#23654f]">4</div><div><h3 className="text-[13.5px] font-bold text-[#153e32]">Review and test before saving</h3><p className="mt-1 text-[11px] text-[#88978e]">Check the journey preview on the right, then try a sample lead.</p></div></div><div className="flex items-start gap-2 rounded-lg border border-[#e6eee8] bg-[#f4f8f5] px-3 py-2.5 text-[11px] text-[#657d6d]"><CheckCircle2 size={14} className="mt-0.5 text-[#31a777]" /><span><b>Safe to test:</b> the simulation checks your choices locally without updating a real lead or sending any messages.</span></div></div>
              </div>

              <div className="flex flex-col gap-3 border-t border-[#e9efeb] bg-[#fafcfb] px-5 py-3 sm:flex-row sm:items-center sm:justify-between"><p className="text-[10.7px] text-[#819386]"><ShieldCheck size={12} className="mr-1 inline text-[#4d9470]" /> Saving a draft does not activate it.</p><div className="flex gap-2"><button type="button" onClick={() => { setModalOpen(true); setSimulation(null); }} className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-[#dde7e0] bg-white px-3 text-xs font-bold text-[#153e32]"><Play size={13} /> Test with sample</button><button disabled={!canManage || !name.trim()} type="submit" className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-[#23654f] px-3 text-xs font-bold text-white disabled:opacity-40"><Save size={13} /> Save draft</button></div></div>
            </form>

            <aside className="space-y-3 xl:sticky xl:top-0 xl:self-start"><section className="rounded-[14px] border border-[#dde7e0] bg-white p-4"><div className="flex items-center justify-between gap-2"><h3 className="text-sm font-bold text-[#153e32]">Live journey preview</h3><span className="inline-flex items-center gap-1 rounded-md bg-[#eaf7ef] px-2 py-1 text-[10px] font-bold text-[#3c8b60]"><span className="h-1.5 w-1.5 rounded-full bg-[#24ad73]" /> Updates as you edit</span></div><p className="mt-1 text-[11px] text-[#809285]">This is what your trigger is configured to do once runtime-ready and activated.</p><div className="mt-3 flex flex-col items-center rounded-xl border border-dashed border-[#dae8df] bg-[#f8fbf9] p-3">{[[Zap,'WHEN · STARTING EVENT',event.preview,'CRM event'],[GitBranch,'ONLY IF · CONDITIONS',conditionMode === 'all' ? 'Every lead qualifies' : `Match ${groupsJoin === 'OR' ? 'any' : 'all'} groups`,conditionMode === 'all' ? 'No filters added' : `${groups.length} groups · ${groups.reduce((sum, group) => sum + group.rules.length, 0)} conditions`],[CheckCircle2,'THEN · ACTION',action.label,`${actionOwner.replaceAll('_',' ')} · ${delayMinutes === 0 ? 'Immediately' : `${delayMinutes} min`}`]].map(([Icon,cap,title,sub], index) => { const C = Icon as React.ComponentType<{ size?: number }>; return <div key={String(cap)} className="contents"><div className="flex w-full max-w-[330px] items-center gap-2.5 rounded-[10px] border border-[#d9e7dc] bg-white p-3"><div className="grid h-8 w-8 place-items-center rounded-lg bg-[#e8f6ec] text-[#258354]"><C size={15} /></div><div><div className="text-[9px] font-bold tracking-[0.1em] text-[#80988b]">{String(cap)}</div><strong className="mt-0.5 block text-xs text-[#153e32]">{String(title)}</strong><small className="mt-0.5 block text-[10px] text-[#829588]">{String(sub)}</small></div></div>{index < 2 ? <div className="h-6 border-l-2 border-[#a9c6b3]" /> : null}</div>; })}<div className="mt-2 rounded-full border border-[#d4e2d7] bg-white px-2.5 py-1 text-[10px] font-bold text-[#627e68]">End journey</div></div>{conditionMode === 'specific' ? <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-[10.5px] leading-5 text-amber-900"><b>Runtime safety:</b> AND/OR groups are saved in the draft, but activation remains blocked until the nested-condition evaluator is enabled.</div> : null}<div className="mt-3 border-t border-[#e9efeb] pt-3"><h4 className="text-[11.5px] font-bold text-[#153e32]">Before this can go live</h4><div className="mt-2 space-y-2 text-[10.8px] text-[#64786b]"><div className="flex gap-2"><CheckCircle2 size={13} className="text-[#31a777]" /> Define the event, conditions and action</div><div className="flex gap-2"><CheckCircle2 size={13} className="text-[#31a777]" /> Run a safe test with sample data</div><div className="flex gap-2"><Clock3 size={13} className="text-[#cb9b54]" /> Review readiness and activate separately</div></div></div></section><section className="rounded-[14px] border border-[#dde7e0] bg-white p-4"><div className="flex items-center justify-between"><h3 className="text-sm font-bold text-[#153e32]">Your saved triggers</h3><button type="button" onClick={() => setView('library')} className="text-[10.5px] font-bold text-[#347e60]">View all →</button></div><div className="mt-3 space-y-2">{visibleWorkflows.slice(0,3).map((workflow) => <div key={workflow.id} className="flex items-center gap-2 rounded-lg border border-[#dde7e0] p-2"><div className="grid h-8 w-8 place-items-center rounded-lg bg-[#edf6f1] text-[#23654f]"><GitBranch size={14} /></div><div className="min-w-0 flex-1"><div className="truncate text-[11px] font-bold text-[#153e32]">{workflow.name}</div><div className="text-[9.5px] text-[#889a8d]">{workflow.status} · {relativeTime(workflow.updated_at)}</div></div></div>)}</div></section><div className="rounded-[13px] border border-[#e4eae2] bg-[#f0f6f2] p-4"><h4 className="flex items-center gap-2 text-xs font-bold text-[#153e32]"><Sparkles size={14} /> Need a longer customer journey?</h4><p className="mt-1.5 text-[11px] text-[#62806d]">Smart Triggers handle simple one-event actions. Use <b>Flow Builder</b> for branching paths, waiting for replies, approvals and multiple steps.</p><Link href="/automation/flow-builder" className="mt-2 inline-flex text-[11px] font-bold text-[#247253]">Open Flow Builder →</Link></div></aside>
          </div>
        </>
      )}

      {modalOpen ? <div className="fixed inset-0 z-[80] grid place-items-center bg-[#193b2d55] p-4" onMouseDown={(event) => { if (event.target === event.currentTarget) setModalOpen(false); }}><div className="w-full max-w-lg rounded-2xl bg-white p-5 shadow-2xl"><div className="flex items-center justify-between"><h2 className="text-lg font-bold text-[#153e32]">Test your trigger safely</h2><button type="button" onClick={() => setModalOpen(false)} className="rounded-lg border border-[#dde7e0] px-2 py-1 text-xs">Close</button></div><p className="mt-2 text-xs text-[#516a5d]">Run this example against sample data. <b>No real records are changed and nothing is sent.</b></p><label className="mt-4 block"><span className="mb-1.5 block text-[11px] font-bold text-[#435d4e]">Choose a sample lead</span><select value={sampleKey} onChange={(event) => { setSampleKey(event.target.value); setSimulation(null); }} className="h-10 w-full rounded-lg border border-[#dce7df] px-3 text-xs">{Object.entries(samples).map(([key, lead]) => <option key={key} value={key}>{lead.name} — {lead.country} · {lead.source}</option>)}</select></label><div className="mt-3 rounded-lg border border-[#dde7e0] bg-[#fbfcfb] p-3 text-[11px]">{Object.entries({ Source: samples[sampleKey].source, Country: samples[sampleKey].country, 'CRM stage': samples[sampleKey].stage, Priority: samples[sampleKey].priority, 'Event (assumed)': event.label }).map(([label, value]) => <div key={label} className="flex justify-between border-b border-[#edf1ed] py-1.5 last:border-0"><span>{label}</span><b>{value}</b></div>)}</div>{simulation ? <div className={`mt-3 rounded-lg border p-3 ${simulation.matched ? 'border-emerald-200 bg-emerald-50 text-emerald-900' : 'border-amber-200 bg-amber-50 text-amber-900'}`}><b className="text-xs">{simulation.matched ? 'Matched — action would run' : 'Not matched — no action'}</b><p className="mt-1 text-[11px] leading-5">{simulation.detail}</p></div> : null}<div className="mt-4 flex justify-end gap-2"><button type="button" onClick={() => setModalOpen(false)} className="h-9 rounded-lg border border-[#dde7e0] px-3 text-xs font-bold">Cancel</button><button type="button" onClick={evaluateSample} className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-[#23654f] px-3 text-xs font-bold text-white"><Play size={13} /> Run simulation</button></div></div></div> : null}
    </div>
  );
}