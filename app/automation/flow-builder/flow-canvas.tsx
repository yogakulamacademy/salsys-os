'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import {
  GitBranch,
  MessageSquareReply,
  MessageSquareText,
  MousePointer2,
  Play,
  Plus,
  Settings2,
  Square,
  Trash2,
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
  if (
    type === 'action' &&
    stringConfig(config ?? null, 'action_type') === 'send_message' &&
    stringConfig(config ?? null, 'channel') === 'whatsapp'
  ) {
    return <MessageSquareText size={15} />;
  }
  return <Square size={15} />;
}

function nodeClass(type: string) {
  if (type === 'trigger') return 'border-emerald-200 bg-emerald-50';
  if (type === 'condition') return 'border-amber-200 bg-amber-50';
  if (type === 'wait_for_reply') return 'border-violet-200 bg-violet-50';
  if (type === 'human_handoff' || type === 'human_approval') return 'border-sky-200 bg-sky-50';
  if (type === 'action') return 'border-indigo-200 bg-indigo-50';
  if (type === 'wait') return 'border-fuchsia-200 bg-fuchsia-50';
  return 'border-slate-200 bg-white';
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
      <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-900">
        No active provider-approved WhatsApp template is synchronized for this workspace.{' '}
        <Link href="/automation/templates" className="font-bold underline underline-offset-2">
          Sync templates from Meta
        </Link>{' '}
        before configuring this customer-message action.
      </div>
    );
  }

  return (
    <form action={configureGuardedWhatsAppSendNodeAction} className="space-y-4 rounded-2xl border border-emerald-200 bg-emerald-50/60 p-4">
      <input type="hidden" name="workflow_id" value={workflowId} />
      <input type="hidden" name="version_number" value={versionNumber} />
      <input type="hidden" name="node_id" value={node.id} />

      <div className="flex items-start gap-3">
        <div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-emerald-100 text-emerald-700">
          <MessageSquareText size={16} />
        </div>
        <div>
          <div className="text-sm font-bold text-emerald-950">Guarded WhatsApp template</div>
          <p className="mt-1 text-xs leading-5 text-emerald-800">
            This stores an approved-template reference only. Human approval is forced ON and every send still rechecks suppression, frequency caps, quiet hours, messaging policy, pilot allowlist and the provider kill switch.
          </p>
        </div>
      </div>

      <label className="block">
        <span className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-slate-500">Label</span>
        <input
          name="label"
          defaultValue={node.label}
          maxLength={120}
          required
          className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900"
        />
      </label>

      <label className="block">
        <span className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-slate-500">Provider-approved template</span>
        <select
          name="template_id"
          defaultValue={selectedTemplate.id}
          className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900"
        >
          {templates.map((template) => (
            <option key={template.id} value={template.id}>
              {template.template_name} · {template.language_code}
              {template.category ? ` · ${template.category}` : ''}
            </option>
          ))}
        </select>
      </label>

      <div className="rounded-xl border border-emerald-200 bg-white px-3 py-3 text-xs leading-5 text-emerald-800">
        <strong>Human approval required.</strong> Saving this node does not enable runtime, open the provider boundary, or send a customer message.
      </div>

      <button type="submit" className="btn-primary">
        <MessageSquareText size={15} />
        Save guarded WhatsApp action
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
  const canvasWidth = Math.max(1180, ...nodes.map((node) => node.position_x + 260));
  const canvasHeight = Math.max(620, ...nodes.map((node) => node.position_y + 180));

  const layoutJson = JSON.stringify(
    nodes.map((node) => ({ id: node.id, x: node.position_x, y: node.position_y })),
  );

  function onDragStart(event: React.DragEvent<HTMLDivElement>, nodeId: string) {
    const node = nodeMap.get(nodeId);
    if (!node) return;
    setDraggingId(nodeId);
    setSelectedNodeId(nodeId);
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData(
      'text/plain',
      JSON.stringify({
        id: nodeId,
        offsetX: event.nativeEvent.offsetX,
        offsetY: event.nativeEvent.offsetY,
      }),
    );
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

    const nextX = Math.max(
      20,
      Math.min(Math.round(event.clientX - rect.left - (payload.offsetX || 0)), 3900),
    );
    const nextY = Math.max(
      20,
      Math.min(Math.round(event.clientY - rect.top - (payload.offsetY || 0)), 2300),
    );

    setNodes((current) =>
      current.map((node) =>
        node.id === payload?.id ? { ...node, position_x: nextX, position_y: nextY } : node,
      ),
    );
    setDraggingId(null);
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-sm text-slate-600">
          <MousePointer2 size={16} />
          Drag nodes to rearrange the flow. Click a node to edit its draft settings.
        </div>

        <form action={saveFlowLayoutAction}>
          <input type="hidden" name="workflow_id" value={workflowId} />
          <input type="hidden" name="version_number" value={versionNumber} />
          <input type="hidden" name="layout" value={layoutJson} />
          <button type="submit" className="btn-primary">
            Save layout
          </button>
        </form>
      </div>

      <section className="rounded-2xl border border-slate-200 bg-white p-4">
        <div className="flex items-center gap-2 text-sm font-bold text-slate-900">
          <Plus size={16} />
          Add draft node
        </div>
        <form action={createFlowNodeAction} className="mt-3 grid gap-3 md:grid-cols-[180px_1fr_auto]">
          <input type="hidden" name="workflow_id" value={workflowId} />
          <input type="hidden" name="version_number" value={versionNumber} />
          <select
            name="node_type"
            defaultValue="action"
            className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm"
          >
            <option value="action">Action</option>
            <option value="wait">Wait</option>
            <option value="wait_for_reply">Wait for reply</option>
            <option value="condition">Condition</option>
            <option value="human_approval">Human approval</option>
            <option value="human_handoff">Human handoff</option>
            <option value="end">End</option>
          </select>
          <input
            name="label"
            required
            maxLength={120}
            placeholder="Node label"
            className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm"
          />
          <button type="submit" className="btn-primary">
            Add node
          </button>
        </form>
      </section>

      <div className="overflow-auto rounded-2xl border border-slate-200 bg-slate-50">
        <div
          className="relative"
          style={{ width: canvasWidth, height: canvasHeight }}
          onDragOver={(event) => event.preventDefault()}
          onDrop={onDrop}
        >
          <svg
            className="pointer-events-none absolute inset-0 h-full w-full"
            width={canvasWidth}
            height={canvasHeight}
            aria-hidden="true"
          >
            <defs>
              <marker
                id="flow-arrow"
                markerWidth="10"
                markerHeight="10"
                refX="9"
                refY="3"
                orient="auto"
                markerUnits="strokeWidth"
              >
                <path d="M0,0 L0,6 L9,3 z" fill="currentColor" />
              </marker>
            </defs>
            {edges.map((edge) => {
              const source = nodeMap.get(edge.source_node_id);
              const target = nodeMap.get(edge.target_node_id);
              if (!source || !target) return null;

              const x1 = source.position_x + 210;
              const y1 = source.position_y + 46;
              const x2 = target.position_x;
              const y2 = target.position_y + 46;
              const midX = x1 + Math.max(55, (x2 - x1) / 2);
              const path = `M ${x1} ${y1} C ${midX} ${y1}, ${midX} ${y2}, ${x2} ${y2}`;

              return (
                <g key={edge.id} className="text-slate-300">
                  <path
                    d={path}
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    markerEnd="url(#flow-arrow)"
                  />
                  {edge.label ? (
                    <text
                      x={(x1 + x2) / 2}
                      y={(y1 + y2) / 2 - 8}
                      textAnchor="middle"
                      className="fill-slate-500 text-[11px] font-semibold"
                    >
                      {edge.label}
                    </text>
                  ) : null}
                </g>
              );
            })}
          </svg>

          {nodes.map((node) => {
            const whatsappAction = isGuardedWhatsAppAction(node);
            return (
              <div
                key={node.id}
                draggable
                onClick={() => setSelectedNodeId(node.id)}
                onDragStart={(event) => onDragStart(event, node.id)}
                onDragEnd={() => setDraggingId(null)}
                className={`absolute w-[210px] cursor-grab rounded-2xl border p-4 shadow-sm transition active:cursor-grabbing ${nodeClass(node.node_type)} ${draggingId === node.id ? 'opacity-60' : ''} ${selectedNodeId === node.id ? 'ring-2 ring-violet-400 ring-offset-2' : ''}`}
                style={{ left: node.position_x, top: node.position_y }}
              >
                <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-wide text-slate-500">
                  <NodeIcon type={node.node_type} config={node.config} />
                  {whatsappAction ? 'WhatsApp action' : node.node_type.replaceAll('_', ' ')}
                </div>
                <div className="mt-2 text-sm font-bold text-slate-950">{node.label}</div>
                {whatsappAction ? (
                  <div className="mt-1 truncate text-[11px] font-semibold text-emerald-700">
                    {stringConfig(node.config, 'template_name')} · human approval
                  </div>
                ) : null}
                <div className="mt-2 truncate text-[11px] text-slate-400">{node.node_key}</div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="grid gap-5 xl:grid-cols-[1.05fr_1fr]">
        <section className="rounded-2xl border border-slate-200 bg-white p-5">
          <div className="flex items-start gap-3">
            <div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-violet-50 text-violet-700">
              <Settings2 size={16} />
            </div>
            <div>
              <h3 className="font-bold text-slate-950">Node inspector</h3>
              <p className="mt-1 text-sm text-slate-500">
                Edit the selected node’s draft label and guarded structural settings.
              </p>
            </div>
          </div>

          {selectedNode ? (
            <>
              {selectedIsWhatsApp ? (
                <div className="mt-5 space-y-4">
                  <GuardedWhatsAppForm
                    workflowId={workflowId}
                    versionNumber={versionNumber}
                    node={selectedNode}
                    templates={whatsappTemplates}
                  />

                  <form
                    action={convertGuardedWhatsAppNodeToInternalAction}
                    className="space-y-3 rounded-2xl border border-slate-200 bg-slate-50 p-4"
                  >
                    <input type="hidden" name="workflow_id" value={workflowId} />
                    <input type="hidden" name="version_number" value={versionNumber} />
                    <input type="hidden" name="node_id" value={selectedNode.id} />
                    <input type="hidden" name="label" value={selectedNode.label} />
                    <div className="text-sm font-bold text-slate-900">Convert to internal action</div>
                    <p className="text-xs leading-5 text-slate-500">
                      Removes all WhatsApp/template/provider fields before saving the internal action.
                    </p>
                    <select
                      name="action_type"
                      defaultValue="create_followup"
                      className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900"
                    >
                      <option value="create_followup">Create follow-up</option>
                      <option value="assign_owner">Assign owner</option>
                      <option value="add_tag">Add tag</option>
                      <option value="notify_user">Notify user</option>
                    </select>
                    <button
                      type="submit"
                      className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-bold text-slate-700 hover:bg-slate-100"
                    >
                      Remove WhatsApp configuration
                    </button>
                  </form>
                </div>
              ) : (
                <>
                  <form action={updateFlowNodeAction} key={selectedNode.id} className="mt-5 space-y-4">
                    <input type="hidden" name="workflow_id" value={workflowId} />
                    <input type="hidden" name="version_number" value={versionNumber} />
                    <input type="hidden" name="node_id" value={selectedNode.id} />

                    <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-xs font-bold uppercase tracking-wide text-slate-500">
                      {selectedNode.node_type.replaceAll('_', ' ')} · {selectedNode.node_key}
                    </div>

                    <label className="block">
                      <span className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-slate-500">Label</span>
                      <input
                        name="label"
                        defaultValue={selectedNode.label}
                        maxLength={120}
                        required
                        className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900"
                      />
                    </label>

                    {selectedNode.node_type === 'trigger' ? (
                      <label className="block">
                        <span className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-slate-500">Event</span>
                        <select
                          name="event_name"
                          defaultValue={stringConfig(selectedNode.config, 'event_name', 'lead.created')}
                          className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900"
                        >
                          <option value="lead.created">New lead created</option>
                          <option value="message.received">Message received</option>
                          <option value="lead.stage_changed">Lead stage changed</option>
                          <option value="payment.pending">Payment pending</option>
                        </select>
                      </label>
                    ) : null}

                    {selectedNode.node_type === 'wait_for_reply' ? (
                      <>
                        <label className="block">
                          <span className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-slate-500">Timeout minutes</span>
                          <input
                            name="timeout_minutes"
                            type="number"
                            min={1}
                            max={10080}
                            defaultValue={numberConfig(selectedNode.config, 'timeout_minutes', 360)}
                            className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900"
                          />
                        </label>
                        <label className="flex items-center gap-2 text-sm text-slate-700">
                          <input
                            name="stop_on_reply"
                            type="checkbox"
                            defaultChecked={boolConfig(selectedNode.config, 'stop_on_reply', true)}
                          />
                          Stop the no-reply wait when the customer replies
                        </label>
                      </>
                    ) : null}

                    {selectedNode.node_type === 'wait' ? (
                      <label className="block">
                        <span className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-slate-500">Delay minutes</span>
                        <input
                          name="delay_minutes"
                          type="number"
                          min={1}
                          max={10080}
                          defaultValue={numberConfig(selectedNode.config, 'delay_minutes', 10)}
                          className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900"
                        />
                      </label>
                    ) : null}

                    {selectedNode.node_type === 'condition' ? (
                      <div className="grid gap-3 sm:grid-cols-2">
                        <label className="block">
                          <span className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-slate-500">Variable</span>
                          <input
                            name="variable"
                            defaultValue={stringConfig(selectedNode.config, 'variable', 'reply_outcome')}
                            maxLength={80}
                            className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900"
                          />
                        </label>
                        <label className="block">
                          <span className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-slate-500">Operator</span>
                          <select
                            name="operator"
                            defaultValue={stringConfig(selectedNode.config, 'operator', 'equals')}
                            className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900"
                          >
                            <option value="equals">Equals</option>
                            <option value="not_equals">Does not equal</option>
                            <option value="exists">Exists</option>
                          </select>
                        </label>
                      </div>
                    ) : null}

                    {selectedNode.node_type === 'action' ? (
                      <label className="block">
                        <span className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-slate-500">Safe internal action</span>
                        <select
                          name="action_type"
                          defaultValue={stringConfig(selectedNode.config, 'action_type', 'create_followup')}
                          className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900"
                        >
                          <option value="create_followup">Create follow-up</option>
                          <option value="assign_owner">Assign owner</option>
                          <option value="add_tag">Add tag</option>
                          <option value="notify_user">Notify user</option>
                        </select>
                      </label>
                    ) : null}

                    {selectedNode.node_type === 'human_handoff' ? (
                      <label className="block">
                        <span className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-slate-500">Handoff reason</span>
                        <input
                          name="reason"
                          defaultValue={stringConfig(selectedNode.config, 'reason', 'manual_review')}
                          maxLength={120}
                          className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900"
                        />
                      </label>
                    ) : null}

                    {selectedNode.node_type === 'human_approval' ? (
                      <div className="rounded-xl border border-sky-200 bg-sky-50 px-3 py-3 text-sm text-sky-800">
                        This node is locked to human review in the controlled builder.
                      </div>
                    ) : null}

                    {selectedNode.node_type === 'end' ? (
                      <label className="block">
                        <span className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-slate-500">Outcome</span>
                        <input
                          name="outcome"
                          defaultValue={stringConfig(selectedNode.config, 'outcome')}
                          maxLength={80}
                          className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900"
                        />
                      </label>
                    ) : null}

                    <button type="submit" className="btn-primary">
                      Save node settings
                    </button>
                  </form>

                  {selectedNode.node_type === 'action' ? (
                    <div className="mt-4">
                      <GuardedWhatsAppForm
                        workflowId={workflowId}
                        versionNumber={versionNumber}
                        node={selectedNode}
                        templates={whatsappTemplates}
                      />
                    </div>
                  ) : null}
                </>
              )}

              {selectedNode.node_type !== 'trigger' ? (
                <form action={deleteFlowNodeAction} className="mt-3">
                  <input type="hidden" name="workflow_id" value={workflowId} />
                  <input type="hidden" name="version_number" value={versionNumber} />
                  <input type="hidden" name="node_id" value={selectedNode.id} />
                  <button
                    type="submit"
                    className="inline-flex items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-bold text-rose-700 hover:bg-rose-100"
                  >
                    <Trash2 size={15} />
                    Delete draft node
                  </button>
                </form>
              ) : null}
            </>
          ) : (
            <div className="mt-5 text-sm text-slate-500">Select a node on the canvas.</div>
          )}
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-5">
          <h3 className="font-bold text-slate-950">Branch connections</h3>
          <p className="mt-1 text-sm text-slate-500">
            Edit labels, branch values, and reroute the target node.
          </p>

          <div className="mt-5 space-y-3">
            {edges.map((edge) => {
              const source = nodeMap.get(edge.source_node_id);
              const target = nodeMap.get(edge.target_node_id);
              const branchValue = stringConfig(edge.condition, 'equals');
              return (
                <form
                  action={updateFlowEdgeAction}
                  key={edge.id}
                  className="rounded-xl border border-slate-200 bg-slate-50 p-4"
                >
                  <input type="hidden" name="workflow_id" value={workflowId} />
                  <input type="hidden" name="version_number" value={versionNumber} />
                  <input type="hidden" name="edge_id" value={edge.id} />
                  <div className="text-sm font-semibold text-slate-900">
                    {source?.label || 'Unknown'} → {target?.label || 'Unknown'}
                  </div>
                  <div className="mt-3 grid gap-3 sm:grid-cols-3">
                    <label className="block">
                      <span className="mb-1 block text-[11px] font-bold uppercase tracking-wide text-slate-500">Label</span>
                      <input
                        name="label"
                        defaultValue={edge.label ?? ''}
                        maxLength={120}
                        className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
                      />
                    </label>
                    <label className="block">
                      <span className="mb-1 block text-[11px] font-bold uppercase tracking-wide text-slate-500">Branch value</span>
                      <input
                        name="branch_value"
                        defaultValue={branchValue}
                        maxLength={80}
                        placeholder="Optional"
                        className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
                      />
                    </label>
                    <label className="block">
                      <span className="mb-1 block text-[11px] font-bold uppercase tracking-wide text-slate-500">Target node</span>
                      <select
                        name="target_node_id"
                        defaultValue={edge.target_node_id}
                        className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
                      >
                        {nodes
                          .filter((node) => node.id !== edge.source_node_id)
                          .map((node) => (
                            <option key={node.id} value={node.id}>
                              {node.label}
                            </option>
                          ))}
                      </select>
                    </label>
                  </div>
                  <button
                    type="submit"
                    className="mt-3 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-100"
                  >
                    Save branch
                  </button>
                </form>
              );
            })}
          </div>
        </section>
      </div>
    </div>
  );
}
