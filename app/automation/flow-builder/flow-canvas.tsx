'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import {
  CheckCircle2,
  CircleStop,
  GitBranch,
  Hand,
  MessageSquareReply,
  MessageSquareText,
  MousePointer2,
  Play,
  Plus,
  Save,
  Settings2,
  ShieldCheck,
  Square,
  Timer,
  Trash2,
  UserRound,
  Zap,
} from 'lucide-react';

import {
  createFlowNodeAction,
  deleteFlowNodeAction,
  saveFlowLayoutAction,
  updateFlowEdgeAction,
  updateFlowNodeAction,
} from '@/app/automation/flow-builder/actions';
import {
  configureGuardedWhatsAppSendNodeAction,
  convertGuardedWhatsAppNodeToInternalAction,
} from '@/app/automation/flow-builder/whatsapp-actions';

type FlowNode = {
  id: string;
  node_key: string;
  node_type: string;
  label: string;
  position_x: number;
  position_y: number;
  config: Record<string, unknown> | null;
};

type FlowEdge = {
  id: string;
  source_node_id: string;
  target_node_id: string;
  edge_key: string;
  label: string | null;
  condition: Record<string, unknown> | null;
};

type WhatsAppTemplate = {
  id: string;
  whatsapp_account_id: string;
  template_name: string;
  language_code: string;
  category: string | null;
};

function NodeIcon({ type, config }: { type: string; config?: Record<string, unknown> | null }) {
  if (type === 'trigger') return <Play size={15} />;
  if (type === 'condition') return <GitBranch size={15} />;
  if (type === 'wait_for_reply') return <MessageSquareReply size={15} />;
  if (type === 'wait') return <Timer size={15} />;
  if (type === 'human_handoff') return <UserRound size={15} />;
  if (type === 'human_approval') return <ShieldCheck size={15} />;
  if (type === 'end') return <CircleStop size={15} />;
  if (
    type === 'action' &&
    stringConfig(config ?? null, 'action_type') === 'send_message' &&
    stringConfig(config ?? null, 'channel') === 'whatsapp'
  ) {
    return <MessageSquareText size={15} />;
  }
  if (type === 'action') return <Zap size={15} />;
  return <Square size={15} />;
}

function nodeClass(type: string) {
  if (type === 'trigger') return 'border-violet-300 bg-violet-50';
  if (type === 'condition') return 'border-violet-200 bg-white';
  if (type === 'wait_for_reply') return 'border-violet-200 bg-white';
  if (type === 'human_handoff' || type === 'human_approval') return 'border-sky-200 bg-sky-50';
  if (type === 'action') return 'border-emerald-200 bg-emerald-50';
  if (type === 'wait') return 'border-amber-200 bg-amber-50';
  if (type === 'end') return 'border-rose-200 bg-rose-50';
  return 'border-slate-200 bg-white';
}

function iconClass(type: string) {
  if (type === 'trigger') return 'bg-violet-100 text-violet-700';
  if (type === 'condition' || type === 'wait_for_reply') return 'bg-violet-50 text-violet-700';
  if (type === 'human_handoff' || type === 'human_approval') return 'bg-sky-100 text-sky-700';
  if (type === 'action') return 'bg-emerald-100 text-emerald-700';
  if (type === 'wait') return 'bg-amber-100 text-amber-700';
  if (type === 'end') return 'bg-rose-100 text-rose-700';
  return 'bg-slate-100 text-slate-700';
}

function stringConfig(config: Record<string, unknown> | null, key: string, fallback = '') {
  const value = config?.[key];
  return typeof value === 'string' ? value : fallback;
}

function numberConfig(config: Record<string, unknown> | null, key: string, fallback: number) {
  const value = Number(config?.[key]);
  return Number.isFinite(value) ? value : fallback;
}

function boolConfig(config: Record<string, unknown> | null, key: string, fallback = false) {
  const value = config?.[key];
  return typeof value === 'boolean' ? value : fallback;
}

function isGuardedWhatsAppAction(node: FlowNode | null) {
  return Boolean(
    node?.node_type === 'action' &&
      stringConfig(node.config, 'action_type') === 'send_message' &&
      stringConfig(node.config, 'channel') === 'whatsapp',
  );
}

function templateForNode(node: FlowNode | null, templates: WhatsAppTemplate[]) {
  if (!node) return templates[0] ?? null;
  const accountId = stringConfig(node.config, 'whatsapp_account_id');
  const name = stringConfig(node.config, 'template_name');
  const language = stringConfig(node.config, 'template_language');
  return (
    templates.find(
      (template) =>
        template.whatsapp_account_id === accountId &&
        template.template_name === name &&
        template.language_code === language,
    ) ??
    templates[0] ??
    null
  );
}

function GuardedWhatsAppForm({
  workflowId,
  versionNumber,
  node,
  templates,
}: {
  workflowId: string;
  versionNumber: number;
  node: FlowNode;
  templates: WhatsAppTemplate[];
}) {
  const selectedTemplate = templateForNode(node, templates);

  if (!selectedTemplate) {
    return (
      <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-900">
        No approved WhatsApp template is available.{' '}
        <Link href="/automation/templates" className="font-bold underline underline-offset-2">
          Sync templates
        </Link>{' '}
        before adding a template send.
      </div>
    );
  }

  return (
    <form action={configureGuardedWhatsAppSendNodeAction} className="space-y-3 rounded-xl border border-emerald-200 bg-emerald-50/60 p-3">
      <input type="hidden" name="workflow_id" value={workflowId} />
      <input type="hidden" name="version_number" value={versionNumber} />
      <input type="hidden" name="node_id" value={node.id} />

      <div className="flex items-start gap-2.5">
        <div className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-emerald-100 text-emerald-700">
          <MessageSquareText size={15} />
        </div>
        <div>
          <div className="text-xs font-bold text-emerald-950">WhatsApp template send</div>
          <p className="mt-0.5 text-[11px] leading-4 text-emerald-800">Human approval stays required.</p>
        </div>
      </div>

      <label className="block">
        <span className="mb-1 block text-[10px] font-bold uppercase tracking-wide text-slate-500">Label</span>
        <input name="label" defaultValue={node.label} maxLength={120} required className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-900" />
      </label>

      <label className="block">
        <span className="mb-1 block text-[10px] font-bold uppercase tracking-wide text-slate-500">Approved template</span>
        <select name="template_id" defaultValue={selectedTemplate.id} className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-900">
          {templates.map((template) => (
            <option key={template.id} value={template.id}>
              {template.template_name} · {template.language_code}{template.category ? ` · ${template.category}` : ''}
            </option>
          ))}
        </select>
      </label>

      <button type="submit" className="btn-primary !px-3 !py-2 text-xs"><MessageSquareText size={14} /> Save template action</button>
    </form>
  );
}

function PaletteItem({
  workflowId,
  versionNumber,
  type,
  label,
  description,
  icon: Icon,
  tone,
}: {
  workflowId: string;
  versionNumber: number;
  type: string;
  label: string;
  description: string;
  icon: React.ComponentType<{ size?: number }>;
  tone: string;
}) {
  return (
    <form action={createFlowNodeAction}>
      <input type="hidden" name="workflow_id" value={workflowId} />
      <input type="hidden" name="version_number" value={versionNumber} />
      <input type="hidden" name="node_type" value={type} />
      <input type="hidden" name="label" value={label} />
      <button type="submit" className="group flex w-full items-center gap-3 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-left transition hover:border-violet-200 hover:bg-violet-50/40">
        <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl ${tone}`}><Icon size={16} /></span>
        <span className="min-w-0">
          <span className="block text-xs font-bold text-slate-900">{label}</span>
          <span className="mt-0.5 block text-[10px] leading-4 text-slate-500">{description}</span>
        </span>
        <Plus size={13} className="ml-auto shrink-0 text-slate-300 group-hover:text-violet-600" />
      </button>
    </form>
  );
}

export function FlowCanvas({
  workflowId,
  versionNumber,
  initialNodes,
  edges,
  whatsappTemplates,
}: {
  workflowId: string;
  versionNumber: number;
  initialNodes: FlowNode[];
  edges: FlowEdge[];
  whatsappTemplates: WhatsAppTemplate[];
}) {
  const [nodes, setNodes] = useState(initialNodes);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(initialNodes[0]?.id ?? null);

  const nodeMap = useMemo(() => new Map(nodes.map((node) => [node.id, node])), [nodes]);
  const selectedNode = selectedNodeId ? nodeMap.get(selectedNodeId) ?? null : null;
  const selectedIsWhatsApp = isGuardedWhatsAppAction(selectedNode);
  const canvasWidth = Math.max(940, ...nodes.map((node) => node.position_x + 250));
  const canvasHeight = Math.max(640, ...nodes.map((node) => node.position_y + 170));

  const layoutJson = JSON.stringify(nodes.map((node) => ({ id: node.id, x: node.position_x, y: node.position_y })));

  function onDragStart(event: React.DragEvent<HTMLDivElement>, nodeId: string) {
    const node = nodeMap.get(nodeId);
    if (!node) return;
    setDraggingId(nodeId);
    setSelectedNodeId(nodeId);
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', JSON.stringify({ id: nodeId, offsetX: event.nativeEvent.offsetX, offsetY: event.nativeEvent.offsetY }));
  }

  function onDrop(event: React.DragEvent<HTMLDivElement>) {
    event.preventDefault();
    const rect = event.currentTarget.getBoundingClientRect();
    let payload: { id: string; offsetX: number; offsetY: number } | null = null;
    try {
      payload = JSON.parse(event.dataTransfer.getData('text/plain'));
    } catch {
      payload = null;
    }
    if (!payload?.id) return;

    const nextX = Math.max(20, Math.min(Math.round(event.clientX - rect.left - (payload.offsetX || 0)), 3900));
    const nextY = Math.max(20, Math.min(Math.round(event.clientY - rect.top - (payload.offsetY || 0)), 2300));

    setNodes((current) => current.map((node) => node.id === payload?.id ? { ...node, position_x: nextX, position_y: nextY } : node));
    setDraggingId(null);
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-3 xl:grid-cols-[220px_minmax(0,1fr)_300px]">
        <aside className="rounded-2xl border border-slate-200 bg-white p-3 xl:sticky xl:top-20 xl:self-start">
          <div className="px-1 pb-3">
            <h3 className="text-sm font-bold text-slate-950">Add nodes</h3>
            <p className="mt-0.5 text-[11px] leading-4 text-slate-500">Add a step, then connect it to the journey.</p>
          </div>

          <div className="space-y-4">
            <div>
              <div className="mb-2 px-1 text-[10px] font-bold uppercase tracking-[0.14em] text-slate-400">Actions</div>
              <div className="space-y-2">
                <PaletteItem workflowId={workflowId} versionNumber={versionNumber} type="action" label="Internal action" description="Follow up, assign, tag or notify" icon={Zap} tone="bg-emerald-50 text-emerald-700" />
                <PaletteItem workflowId={workflowId} versionNumber={versionNumber} type="wait" label="Wait" description="Delay for a specified time" icon={Timer} tone="bg-amber-50 text-amber-700" />
                <PaletteItem workflowId={workflowId} versionNumber={versionNumber} type="wait_for_reply" label="Wait for reply" description="Pause until reply or timeout" icon={MessageSquareReply} tone="bg-violet-50 text-violet-700" />
                <PaletteItem workflowId={workflowId} versionNumber={versionNumber} type="human_handoff" label="Assign to human" description="Hand over for manual review" icon={UserRound} tone="bg-sky-50 text-sky-700" />
              </div>
            </div>

            <div>
              <div className="mb-2 px-1 text-[10px] font-bold uppercase tracking-[0.14em] text-slate-400">Flow</div>
              <div className="space-y-2">
                <PaletteItem workflowId={workflowId} versionNumber={versionNumber} type="condition" label="Condition / branch" description="Split based on evidence" icon={GitBranch} tone="bg-violet-50 text-violet-700" />
                <PaletteItem workflowId={workflowId} versionNumber={versionNumber} type="human_approval" label="Human approval" description="Require a manual decision" icon={ShieldCheck} tone="bg-sky-50 text-sky-700" />
                <PaletteItem workflowId={workflowId} versionNumber={versionNumber} type="end" label="End flow" description="Stop the automation" icon={CircleStop} tone="bg-rose-50 text-rose-700" />
              </div>
            </div>
          </div>
        </aside>

        <section className="min-w-0 overflow-hidden rounded-2xl border border-slate-200 bg-white">
          <div className="flex flex-col gap-3 border-b border-slate-200 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-2 text-xs text-slate-500">
              <MousePointer2 size={15} /> Drag nodes to rearrange. Click a node to edit it.
            </div>
            <form action={saveFlowLayoutAction}>
              <input type="hidden" name="workflow_id" value={workflowId} />
              <input type="hidden" name="version_number" value={versionNumber} />
              <input type="hidden" name="layout" value={layoutJson} />
              <button type="submit" className="btn-secondary !px-3 !py-2 text-xs"><Save size={13} /> Save layout</button>
            </form>
          </div>

          <div className="overflow-auto bg-slate-50/50">
            <div
              className="relative"
              style={{
                width: canvasWidth,
                height: canvasHeight,
                backgroundImage: 'radial-gradient(circle, rgb(203 213 225 / 0.7) 1px, transparent 1px)',
                backgroundSize: '20px 20px',
              }}
              onDragOver={(event) => event.preventDefault()}
              onDrop={onDrop}
            >
              <svg className="pointer-events-none absolute inset-0 h-full w-full" width={canvasWidth} height={canvasHeight} aria-hidden="true">
                <defs>
                  <marker id="flow-arrow" markerWidth="10" markerHeight="10" refX="9" refY="3" orient="auto" markerUnits="strokeWidth">
                    <path d="M0,0 L0,6 L9,3 z" fill="currentColor" />
                  </marker>
                </defs>
                {edges.map((edge) => {
                  const source = nodeMap.get(edge.source_node_id);
                  const target = nodeMap.get(edge.target_node_id);
                  if (!source || !target) return null;
                  const x1 = source.position_x + 220;
                  const y1 = source.position_y + 42;
                  const x2 = target.position_x;
                  const y2 = target.position_y + 42;
                  const midX = x1 + Math.max(55, (x2 - x1) / 2);
                  const path = `M ${x1} ${y1} C ${midX} ${y1}, ${midX} ${y2}, ${x2} ${y2}`;
                  return (
                    <g key={edge.id} className="text-slate-400">
                      <path d={path} fill="none" stroke="currentColor" strokeWidth="1.8" markerEnd="url(#flow-arrow)" />
                      {edge.label ? (
                        <text x={(x1 + x2) / 2} y={(y1 + y2) / 2 - 8} textAnchor="middle" className="fill-slate-500 text-[10px] font-semibold">{edge.label}</text>
                      ) : null}
                    </g>
                  );
                })}
              </svg>

              {nodes.map((node) => {
                const whatsappAction = isGuardedWhatsAppAction(node);
                const selected = selectedNodeId === node.id;
                return (
                  <div
                    key={node.id}
                    draggable
                    onClick={() => setSelectedNodeId(node.id)}
                    onDragStart={(event) => onDragStart(event, node.id)}
                    onDragEnd={() => setDraggingId(null)}
                    className={`absolute w-[220px] cursor-grab rounded-xl border px-3.5 py-3 shadow-sm transition active:cursor-grabbing ${nodeClass(node.node_type)} ${draggingId === node.id ? 'opacity-60' : ''} ${selected ? 'ring-2 ring-violet-500 ring-offset-2' : 'hover:shadow-md'}`}
                    style={{ left: node.position_x, top: node.position_y }}
                  >
                    <div className="flex items-start gap-3">
                      <div className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl ${iconClass(node.node_type)}`}><NodeIcon type={node.node_type} config={node.config} /></div>
                      <div className="min-w-0 flex-1">
                        <div className="text-[10px] font-bold uppercase tracking-wide text-slate-400">{whatsappAction ? 'WhatsApp template' : node.node_type.replaceAll('_', ' ')}</div>
                        <div className="mt-0.5 text-xs font-bold leading-5 text-slate-950">{node.label}</div>
                        {whatsappAction ? <div className="mt-1 truncate text-[10px] font-semibold text-emerald-700">{stringConfig(node.config, 'template_name')} · approval required</div> : null}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        <aside className="rounded-2xl border border-slate-200 bg-white p-4 xl:sticky xl:top-20 xl:self-start">
          <div className="flex items-center gap-2">
            <Settings2 size={16} className="text-violet-600" />
            <h3 className="text-sm font-bold text-slate-950">Node settings</h3>
          </div>

          {selectedNode ? (
            <div className="mt-4 space-y-4">
              <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-3">
                <div className="flex items-center gap-2">
                  <div className={`grid h-8 w-8 place-items-center rounded-lg ${iconClass(selectedNode.node_type)}`}><NodeIcon type={selectedNode.node_type} config={selectedNode.config} /></div>
                  <div className="min-w-0">
                    <div className="truncate text-sm font-bold text-slate-900">{selectedNode.label}</div>
                    <div className="text-[10px] uppercase tracking-wide text-slate-400">{selectedNode.node_type.replaceAll('_', ' ')}</div>
                  </div>
                </div>
              </div>

              {selectedIsWhatsApp ? (
                <>
                  <GuardedWhatsAppForm workflowId={workflowId} versionNumber={versionNumber} node={selectedNode} templates={whatsappTemplates} />
                  <form action={convertGuardedWhatsAppNodeToInternalAction} className="space-y-2 rounded-xl border border-slate-200 bg-slate-50 p-3">
                    <input type="hidden" name="workflow_id" value={workflowId} />
                    <input type="hidden" name="version_number" value={versionNumber} />
                    <input type="hidden" name="node_id" value={selectedNode.id} />
                    <input type="hidden" name="label" value={selectedNode.label} />
                    <div className="text-xs font-bold text-slate-900">Convert to internal action</div>
                    <select name="action_type" defaultValue="create_followup" className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-900">
                      <option value="create_followup">Create follow-up</option>
                      <option value="assign_owner">Assign owner</option>
                      <option value="add_tag">Add tag</option>
                      <option value="notify_user">Notify user</option>
                    </select>
                    <button type="submit" className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-100">Remove WhatsApp configuration</button>
                  </form>
                </>
              ) : (
                <>
                  <form action={updateFlowNodeAction} key={selectedNode.id} className="space-y-3">
                    <input type="hidden" name="workflow_id" value={workflowId} />
                    <input type="hidden" name="version_number" value={versionNumber} />
                    <input type="hidden" name="node_id" value={selectedNode.id} />

                    <label className="block">
                      <span className="mb-1 block text-[10px] font-bold uppercase tracking-wide text-slate-500">Label</span>
                      <input name="label" defaultValue={selectedNode.label} maxLength={120} required className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-900" />
                    </label>

                    {selectedNode.node_type === 'trigger' ? (
                      <label className="block">
                        <span className="mb-1 block text-[10px] font-bold uppercase tracking-wide text-slate-500">Trigger event</span>
                        <select name="event_name" defaultValue={stringConfig(selectedNode.config, 'event_name', 'lead.created')} className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-900">
                          <option value="lead.created">New lead created</option>
                          <option value="message.received">Message received</option>
                          <option value="lead.stage_changed">Lead stage changed</option>
                          <option value="payment.pending">Payment pending</option>
                        </select>
                      </label>
                    ) : null}

                    {selectedNode.node_type === 'wait_for_reply' ? (
                      <>
                        <label className="block"><span className="mb-1 block text-[10px] font-bold uppercase tracking-wide text-slate-500">Timeout minutes</span><input name="timeout_minutes" type="number" min={1} max={10080} defaultValue={numberConfig(selectedNode.config, 'timeout_minutes', 360)} className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-900" /></label>
                        <label className="flex items-center gap-2 text-xs text-slate-700"><input name="stop_on_reply" type="checkbox" defaultChecked={boolConfig(selectedNode.config, 'stop_on_reply', true)} /> Stop no-reply path when customer replies</label>
                      </>
                    ) : null}

                    {selectedNode.node_type === 'wait' ? (
                      <label className="block"><span className="mb-1 block text-[10px] font-bold uppercase tracking-wide text-slate-500">Delay minutes</span><input name="delay_minutes" type="number" min={1} max={10080} defaultValue={numberConfig(selectedNode.config, 'delay_minutes', 10)} className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-900" /></label>
                    ) : null}

                    {selectedNode.node_type === 'condition' ? (
                      <div className="space-y-3">
                        <label className="block"><span className="mb-1 block text-[10px] font-bold uppercase tracking-wide text-slate-500">Variable</span><input name="variable" defaultValue={stringConfig(selectedNode.config, 'variable', 'reply_outcome')} maxLength={80} className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-900" /></label>
                        <label className="block"><span className="mb-1 block text-[10px] font-bold uppercase tracking-wide text-slate-500">Operator</span><select name="operator" defaultValue={stringConfig(selectedNode.config, 'operator', 'equals')} className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-900"><option value="equals">Equals</option><option value="not_equals">Does not equal</option><option value="exists">Exists</option></select></label>
                      </div>
                    ) : null}

                    {selectedNode.node_type === 'action' ? (
                      <label className="block"><span className="mb-1 block text-[10px] font-bold uppercase tracking-wide text-slate-500">Internal action</span><select name="action_type" defaultValue={stringConfig(selectedNode.config, 'action_type', 'create_followup')} className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-900"><option value="create_followup">Create follow-up</option><option value="assign_owner">Assign owner</option><option value="add_tag">Add tag</option><option value="notify_user">Notify user</option></select></label>
                    ) : null}

                    {selectedNode.node_type === 'human_handoff' ? (
                      <label className="block"><span className="mb-1 block text-[10px] font-bold uppercase tracking-wide text-slate-500">Handoff reason</span><input name="reason" defaultValue={stringConfig(selectedNode.config, 'reason', 'manual_review')} maxLength={120} className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-900" /></label>
                    ) : null}

                    {selectedNode.node_type === 'human_approval' ? (
                      <div className="rounded-lg border border-sky-200 bg-sky-50 px-3 py-2.5 text-[11px] leading-4 text-sky-800">This step requires human review.</div>
                    ) : null}

                    {selectedNode.node_type === 'end' ? (
                      <label className="block"><span className="mb-1 block text-[10px] font-bold uppercase tracking-wide text-slate-500">Outcome</span><input name="outcome" defaultValue={stringConfig(selectedNode.config, 'outcome')} maxLength={80} className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-900" /></label>
                    ) : null}

                    <button type="submit" className="btn-primary w-full justify-center !py-2 text-xs"><Save size={13} /> Save settings</button>
                  </form>

                  {selectedNode.node_type === 'action' ? (
                    <div className="border-t border-slate-100 pt-4">
                      <div className="mb-2 text-[10px] font-bold uppercase tracking-wide text-slate-400">Or send approved template</div>
                      <GuardedWhatsAppForm workflowId={workflowId} versionNumber={versionNumber} node={selectedNode} templates={whatsappTemplates} />
                    </div>
                  ) : null}
                </>
              )}

              {selectedNode.node_type !== 'trigger' ? (
                <form action={deleteFlowNodeAction} className="border-t border-slate-100 pt-3">
                  <input type="hidden" name="workflow_id" value={workflowId} />
                  <input type="hidden" name="version_number" value={versionNumber} />
                  <input type="hidden" name="node_id" value={selectedNode.id} />
                  <button type="submit" className="inline-flex w-full items-center justify-center gap-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-bold text-rose-700 hover:bg-rose-100"><Trash2 size={13} /> Delete node</button>
                </form>
              ) : null}
            </div>
          ) : (
            <div className="mt-5 rounded-xl border border-dashed border-slate-200 px-4 py-8 text-center text-xs text-slate-500">Select a node on the canvas.</div>
          )}
        </aside>
      </div>

      <section className="rounded-2xl border border-slate-200 bg-white p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="text-sm font-bold text-slate-950">Connections</h3>
            <p className="mt-0.5 text-xs text-slate-500">Edit branch labels, values and target nodes.</p>
          </div>
          <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-bold text-slate-500">{edges.length} connections</span>
        </div>

        {edges.length === 0 ? (
          <div className="mt-4 rounded-xl border border-dashed border-slate-200 px-4 py-8 text-center text-xs text-slate-500">No connections yet.</div>
        ) : (
          <div className="mt-4 grid gap-3 lg:grid-cols-2">
            {edges.map((edge) => {
              const source = nodeMap.get(edge.source_node_id);
              const target = nodeMap.get(edge.target_node_id);
              const branchValue = stringConfig(edge.condition, 'equals');
              return (
                <form action={updateFlowEdgeAction} key={edge.id} className="rounded-xl border border-slate-200 bg-slate-50/60 p-3">
                  <input type="hidden" name="workflow_id" value={workflowId} />
                  <input type="hidden" name="version_number" value={versionNumber} />
                  <input type="hidden" name="edge_id" value={edge.id} />
                  <div className="flex items-center gap-2 text-xs font-bold text-slate-900"><CheckCircle2 size={13} className="text-violet-500" /> {source?.label || 'Unknown'} <span className="text-slate-300">→</span> {target?.label || 'Unknown'}</div>
                  <div className="mt-3 grid gap-2 sm:grid-cols-3">
                    <input name="label" defaultValue={edge.label ?? ''} maxLength={120} placeholder="Label" className="rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-xs" />
                    <input name="branch_value" defaultValue={branchValue} maxLength={80} placeholder="Branch value" className="rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-xs" />
                    <select name="target_node_id" defaultValue={edge.target_node_id} className="rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-xs">
                      {nodes.filter((node) => node.id !== edge.source_node_id).map((node) => <option key={node.id} value={node.id}>{node.label}</option>)}
                    </select>
                  </div>
                  <button type="submit" className="mt-2 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-[11px] font-bold text-slate-700 hover:bg-slate-100">Save connection</button>
                </form>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
