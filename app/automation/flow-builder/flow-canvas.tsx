'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import {
  CheckCircle2,
  CircleStop,
  GitBranch,
  Maximize2,
  MessageSquareReply,
  MessageSquareText,
  Minus,
  PanelRightClose,
  PanelRightOpen,
  Play,
  Plus,
  Save,
  Search,
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

function NodeIcon({ type, config }: { type: string; config?: Record<string, unknown> | null }) {
  if (type === 'trigger') return <Play size={16} />;
  if (type === 'condition') return <GitBranch size={16} />;
  if (type === 'wait_for_reply') return <MessageSquareReply size={16} />;
  if (type === 'wait') return <Timer size={16} />;
  if (type === 'human_handoff') return <UserRound size={16} />;
  if (type === 'human_approval') return <ShieldCheck size={16} />;
  if (type === 'end') return <CircleStop size={16} />;
  if (
    type === 'action' &&
    stringConfig(config ?? null, 'action_type') === 'send_message' &&
    stringConfig(config ?? null, 'channel') === 'whatsapp'
  ) {
    return <MessageSquareText size={16} />;
  }
  if (type === 'action') return <Zap size={16} />;
  return <Square size={16} />;
}

function nodeTone(type: string) {
  if (type === 'trigger') return 'bg-[#eff4f1] text-[#647a6d]';
  if (type === 'condition' || type === 'wait_for_reply') return 'bg-[#edf6fc] text-[#3a82ad]';
  if (type === 'human_handoff' || type === 'human_approval') return 'bg-[#f2eefb] text-[#7361a8]';
  if (type === 'wait') return 'bg-[#fff5e8] text-[#b77b2c]';
  if (type === 'end') return 'bg-[#fff0ed] text-[#b76558]';
  return 'bg-[#edf5ef] text-[#277159]';
}

function nodeEyebrow(type: string) {
  if (type === 'human_handoff') return 'Assign owner';
  if (type === 'human_approval') return 'Approval';
  if (type === 'wait_for_reply') return 'Wait for reply';
  return type.replaceAll('_', ' ');
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
      <div className="rounded-[10px] border border-amber-200 bg-amber-50 p-3 text-[11px] leading-5 text-amber-900">
        No approved WhatsApp template is available.{' '}
        <Link href="/automation/templates" className="font-bold underline underline-offset-2">
          Sync templates
        </Link>{' '}
        before adding a template send.
      </div>
    );
  }

  return (
    <form action={configureGuardedWhatsAppSendNodeAction} className="space-y-3 rounded-[10px] border border-[#dce9e1] bg-[#f7faf8] p-3">
      <input type="hidden" name="workflow_id" value={workflowId} />
      <input type="hidden" name="version_number" value={versionNumber} />
      <input type="hidden" name="node_id" value={node.id} />

      <div className="flex items-start gap-2.5">
        <div className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-[#e6f4eb] text-[#29745a]">
          <MessageSquareText size={15} />
        </div>
        <div>
          <div className="text-xs font-bold text-[#234c3b]">WhatsApp template send</div>
          <p className="mt-0.5 text-[10.5px] leading-4 text-[#71877b]">Human approval remains required.</p>
        </div>
      </div>

      <label className="block">
        <span className="mb-1.5 block text-[10px] font-bold uppercase tracking-[0.07em] text-[#779183]">Step label</span>
        <input name="label" defaultValue={node.label} maxLength={120} required className="w-full rounded-[9px] border border-[#dbe7df] bg-white px-3 py-2.5 text-xs text-[#294839]" />
      </label>

      <label className="block">
        <span className="mb-1.5 block text-[10px] font-bold uppercase tracking-[0.07em] text-[#779183]">Approved template</span>
        <select name="template_id" defaultValue={selectedTemplate.id} className="w-full rounded-[9px] border border-[#dbe7df] bg-white px-3 py-2.5 text-xs text-[#294839]">
          {templates.map((template) => (
            <option key={template.id} value={template.id}>
              {template.template_name} · {template.language_code}{template.category ? ` · ${template.category}` : ''}
            </option>
          ))}
        </select>
      </label>

      <button type="submit" className="inline-flex h-9 w-full items-center justify-center gap-2 rounded-[9px] bg-[#236950] px-3 text-xs font-bold text-white hover:bg-[#19533f]"><Save size={13} /> Save template action</button>
    </form>
  );
}

function PaletteItem({
  workflowId,
  versionNumber,
  type,
  label,
  description,
}: {
  workflowId: string;
  versionNumber: number;
  type: string;
  label: string;
  description: string;
}) {
  return (
    <form action={createFlowNodeAction} className="shrink-0">
      <input type="hidden" name="workflow_id" value={workflowId} />
      <input type="hidden" name="version_number" value={versionNumber} />
      <input type="hidden" name="node_type" value={type} />
      <input type="hidden" name="label" value={label} />
      <button
        type="submit"
        className="group flex h-[47px] min-w-[122px] items-center gap-2 rounded-[10px] border border-[#e0e8e1] bg-white px-2.5 text-left transition hover:-translate-y-px hover:border-[#a3cbb3] hover:bg-[#f8fcf9]"
      >
        <span className={`grid h-[30px] w-[30px] shrink-0 place-items-center rounded-[9px] ${nodeTone(type)}`}><NodeIcon type={type} /></span>
        <span className="min-w-0">
          <span className="block whitespace-nowrap text-[11px] font-bold text-[#294839]">{label}</span>
          <span className="mt-0.5 block whitespace-nowrap text-[9.5px] text-[#87978c]">{description}</span>
        </span>
        <Plus size={13} className="ml-auto text-[#8fa99a] transition group-hover:text-[#236950]" />
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
  const [libraryQuery, setLibraryQuery] = useState('');
  const [zoom, setZoom] = useState(100);
  const [inspectorOpen, setInspectorOpen] = useState(true);

  const nodeMap = useMemo(() => new Map(nodes.map((node) => [node.id, node])), [nodes]);
  const selectedNode = selectedNodeId ? nodeMap.get(selectedNodeId) ?? null : null;
  const selectedIsWhatsApp = isGuardedWhatsAppAction(selectedNode);
  const selectedOutgoingEdges = selectedNode ? edges.filter((edge) => edge.source_node_id === selectedNode.id) : [];
  const canvasWidth = Math.max(1000, ...nodes.map((node) => node.position_x + 280));
  const canvasHeight = Math.max(620, ...nodes.map((node) => node.position_y + 180));
  const scale = zoom / 100;
  const layoutJson = JSON.stringify(nodes.map((node) => ({ id: node.id, x: node.position_x, y: node.position_y })));

  const palette = [
    { type: 'action', label: 'Action', description: 'CRM / messaging' },
    { type: 'condition', label: 'Condition', description: 'Branch logic' },
    { type: 'wait', label: 'Delay', description: 'Wait or schedule' },
    { type: 'wait_for_reply', label: 'Wait for reply', description: 'Incoming message' },
    { type: 'human_handoff', label: 'Assign owner', description: 'Human handoff' },
    { type: 'human_approval', label: 'Approval', description: 'Human review' },
    { type: 'end', label: 'End flow', description: 'Stop journey' },
  ].filter((item) => `${item.label} ${item.description}`.toLowerCase().includes(libraryQuery.toLowerCase().trim()));

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

    const nextX = Math.max(20, Math.min(Math.round((event.clientX - rect.left) / scale - (payload.offsetX || 0)), 3900));
    const nextY = Math.max(20, Math.min(Math.round((event.clientY - rect.top) / scale - (payload.offsetY || 0)), 2300));

    setNodes((current) => current.map((node) => node.id === payload?.id ? { ...node, position_x: nextX, position_y: nextY } : node));
    setDraggingId(null);
  }

  function changeZoom(next: number) {
    setZoom(Math.max(65, Math.min(125, next)));
  }

  return (
    <section className="overflow-hidden rounded-[14px] border border-[#e0e9e3] bg-white shadow-[0_2px_12px_rgba(25,70,50,0.035)]">
      <div className="sticky top-0 z-20 border-b border-[#e0e9e3] bg-white px-4 py-3">
        <div className="mb-2.5 flex flex-col gap-2 sm:flex-row sm:items-center">
          <div>
            <h2 className="text-[13px] font-bold text-[#24483a]">Step library</h2>
            <p className="mt-0.5 text-[10.5px] text-[#899d90]">Add steps to your journey</p>
          </div>
          <div className="sm:ml-auto flex items-center gap-2">
            <span className="hidden rounded-md bg-[#eff7f2] px-2 py-1 text-[10px] text-[#70907f] lg:inline-flex">Stays visible while you build</span>
            <label className="flex h-8 items-center gap-1.5 rounded-lg border border-[#e0e9e3] bg-[#f8faf9] px-2.5 text-[#7b9887] focus-within:border-[#94c5a9]">
              <Search size={13} />
              <input
                value={libraryQuery}
                onChange={(event) => setLibraryQuery(event.target.value)}
                placeholder="Search steps..."
                className="w-[120px] bg-transparent text-[11px] outline-none placeholder:text-[#9aa9a1]"
              />
            </label>
          </div>
        </div>

        <div className="flex gap-2 overflow-x-auto pb-1">
          {palette.map((item) => (
            <PaletteItem key={item.type} workflowId={workflowId} versionNumber={versionNumber} {...item} />
          ))}
          <Link href="/automation/recipes" className="flex h-[47px] shrink-0 items-center gap-1.5 rounded-[9px] border border-dashed border-[#d7e3da] px-3 text-[11px] font-bold text-[#577664] hover:bg-[#f8fcf9]">More <Plus size={13} /></Link>
        </div>
      </div>

      <div className={`grid min-h-[620px] ${inspectorOpen ? 'xl:grid-cols-[minmax(0,1fr)_302px]' : 'xl:grid-cols-[minmax(0,1fr)_46px]'}`}>
        <div className="min-w-0 border-b border-[#e0e9e3] xl:border-b-0 xl:border-r">
          <div className="flex h-[46px] items-center gap-2 border-b border-[#e6ece7] bg-[#fdfefd] px-4">
            <GitBranch size={15} className="text-[#52906e]" />
            <strong className="text-[12.5px] text-[#294839]">Journey canvas</strong>
            <span className="rounded-md border border-[#d6eadc] bg-[#edf7f1] px-2 py-1 text-[10px] font-bold text-[#3c795e]">Visual builder</span>
            <span className="hidden text-[11px] text-[#8ca096] sm:inline">{nodes.length} steps · {edges.length} connections</span>
            <div className="ml-auto flex items-center gap-1.5">
              <form action={saveFlowLayoutAction}>
                <input type="hidden" name="workflow_id" value={workflowId} />
                <input type="hidden" name="version_number" value={versionNumber} />
                <input type="hidden" name="layout" value={layoutJson} />
                <button type="submit" title="Save layout" className="grid h-7 w-7 place-items-center rounded-lg border border-[#e1e9e3] bg-white text-[#5e7a6b] hover:bg-[#eff6f1]"><Save size={13} /></button>
              </form>
              <button type="button" onClick={() => changeZoom(100)} title="Reset zoom" className="grid h-7 w-7 place-items-center rounded-lg border border-[#e1e9e3] bg-white text-[#5e7a6b] hover:bg-[#eff6f1]"><Maximize2 size={13} /></button>
              <button type="button" onClick={() => changeZoom(zoom - 10)} aria-label="Zoom out" className="grid h-7 w-7 place-items-center rounded-lg border border-[#e1e9e3] bg-white text-[#5e7a6b] hover:bg-[#eff6f1]"><Minus size={13} /></button>
              <span className="min-w-[40px] text-center text-[11px] text-[#647e70]">{zoom}%</span>
              <button type="button" onClick={() => changeZoom(zoom + 10)} aria-label="Zoom in" className="grid h-7 w-7 place-items-center rounded-lg border border-[#e1e9e3] bg-white text-[#5e7a6b] hover:bg-[#eff6f1]"><Plus size={13} /></button>
            </div>
          </div>

          <div className="h-[574px] overflow-auto bg-[#fbfdfb]" style={{ backgroundImage: 'radial-gradient(#cddfd1 0.9px, transparent 0.9px)', backgroundSize: '20px 20px' }}>
            <div style={{ width: canvasWidth * scale, height: canvasHeight * scale, position: 'relative' }}>
              <div
                className="relative"
                style={{ width: canvasWidth, height: canvasHeight, transform: `scale(${scale})`, transformOrigin: 'top left' }}
                onDragOver={(event) => event.preventDefault()}
                onDrop={onDrop}
              >
                <svg className="pointer-events-none absolute inset-0 h-full w-full" width={canvasWidth} height={canvasHeight} aria-hidden="true">
                  <defs>
                    <marker id="flow-arrow-green" markerWidth="10" markerHeight="10" refX="9" refY="3" orient="auto" markerUnits="strokeWidth">
                      <path d="M0,0 L0,6 L9,3 z" fill="#9fb9ab" />
                    </marker>
                  </defs>
                  {edges.map((edge) => {
                    const source = nodeMap.get(edge.source_node_id);
                    const target = nodeMap.get(edge.target_node_id);
                    if (!source || !target) return null;
                    const x1 = source.position_x + 116;
                    const y1 = source.position_y + 88;
                    const x2 = target.position_x + 116;
                    const y2 = target.position_y;
                    const midY = y1 + Math.max(35, (y2 - y1) / 2);
                    const path = `M ${x1} ${y1} C ${x1} ${midY}, ${x2} ${midY}, ${x2} ${y2}`;
                    const labelX = x1 + (x2 - x1) / 2;
                    const labelY = midY - 7;
                    return (
                      <g key={edge.id}>
                        <path d={path} fill="none" stroke="#a2bdb0" strokeWidth="2" markerEnd="url(#flow-arrow-green)" />
                        {edge.label ? (
                          <text x={labelX} y={labelY} textAnchor="middle" fill="#6d8b79" fontSize="10" fontWeight="700">{edge.label}</text>
                        ) : null}
                      </g>
                    );
                  })}
                </svg>

                {nodes.map((node) => {
                  const whatsappAction = isGuardedWhatsAppAction(node);
                  const selected = selectedNodeId === node.id;
                  const hasTemplate = Boolean(stringConfig(node.config, 'template_name'));
                  return (
                    <div
                      key={node.id}
                      draggable
                      onClick={() => setSelectedNodeId(node.id)}
                      onDragStart={(event) => onDragStart(event, node.id)}
                      onDragEnd={() => setDraggingId(null)}
                      className={`absolute w-[232px] cursor-grab rounded-[12px] border bg-white p-3 shadow-[0_6px_22px_rgba(38,81,56,0.055)] transition active:cursor-grabbing ${draggingId === node.id ? 'opacity-60' : ''} ${selected ? 'border-[#2b8d6a] ring-4 ring-[rgba(41,139,97,0.12)]' : 'border-[#d8e7dc] hover:border-[#80bda0] hover:shadow-[0_6px_24px_rgba(38,81,56,0.12)]'}`}
                      style={{ left: node.position_x, top: node.position_y }}
                    >
                      <div className="flex items-start gap-2.5">
                        <div className={`grid h-[34px] w-[34px] shrink-0 place-items-center rounded-[10px] ${nodeTone(node.node_type)}`}><NodeIcon type={node.node_type} config={node.config} /></div>
                        <div className="min-w-0 flex-1">
                          <div className="text-[9px] font-extrabold uppercase tracking-[0.085em] text-[#8da398]">{whatsappAction ? 'Action · WhatsApp' : nodeEyebrow(node.node_type)}</div>
                          <div className="mt-1 text-[12.7px] font-bold leading-[1.25] text-[#294839]">{node.label}</div>
                          <div className="mt-1 text-[10.5px] leading-[1.35] text-[#7f9386]">
                            {whatsappAction ? (hasTemplate ? stringConfig(node.config, 'template_name') : 'Approved template required') : node.node_type === 'condition' ? 'Branch based on configured evidence' : 'Click to configure this step'}
                          </div>
                          <div className={`mt-2 flex items-center gap-1 text-[9.5px] font-bold ${whatsappAction && !hasTemplate ? 'text-[#b78237]' : 'text-[#4d9a6c]'}`}>
                            {whatsappAction && !hasTemplate ? 'Setup required' : selected ? 'Selected' : 'Configured'}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          <div className="flex h-[37px] items-center gap-2 border-t border-[#e0e9e3] bg-white px-4 text-[10.5px] text-[#83988c]">
            <span className="h-1.5 w-1.5 rounded-full bg-[#36ad7c]" />
            <span>Draft journey</span>
            <span>·</span>
            <strong className="font-bold text-[#557762]">{edges.length} connections</strong>
            <span className="ml-auto hidden sm:inline">Tip: select any step to edit its configuration</span>
          </div>
        </div>

        <aside className={`min-w-0 bg-white ${inspectorOpen ? 'block' : 'hidden xl:block'}`}>
          {inspectorOpen ? (
            <>
              <div className="flex h-[52px] items-center justify-between border-b border-[#e0e9e3] px-4">
                <div className="flex items-center gap-2"><Settings2 size={15} className="text-[#347e60]" /><strong className="text-sm text-[#294839]">Node settings</strong></div>
                <button type="button" onClick={() => setInspectorOpen(false)} title="Collapse settings" className="grid h-7 w-7 place-items-center rounded-lg border border-[#e0e9e3] text-[#647f70] hover:bg-[#f3f8f4]"><PanelRightClose size={14} /></button>
              </div>
              <div className="max-h-[654px] overflow-y-auto p-4">
                {selectedNode ? (
                  <div className="space-y-4">
                    <div className="flex items-center gap-2.5 rounded-[10px] border border-[#e1ebe3] bg-[#f6faf7] p-3">
                      <div className={`grid h-[37px] w-[37px] shrink-0 place-items-center rounded-[10px] ${nodeTone(selectedNode.node_type)}`}><NodeIcon type={selectedNode.node_type} config={selectedNode.config} /></div>
                      <div className="min-w-0"><div className="truncate text-xs font-bold text-[#294839]">{selectedNode.label}</div><div className="mt-0.5 text-[10px] uppercase tracking-[0.08em] text-[#87a090]">{nodeEyebrow(selectedNode.node_type)} · Selected step</div></div>
                    </div>

                    <div className="flex items-center justify-between"><span className="text-[10px] font-bold uppercase tracking-[0.12em] text-[#85968d]">Configuration</span><span className="text-[10px] text-[#779183]">Draft v{versionNumber}</span></div>

                    {selectedIsWhatsApp ? (
                      <>
                        <GuardedWhatsAppForm workflowId={workflowId} versionNumber={versionNumber} node={selectedNode} templates={whatsappTemplates} />
                        <form action={convertGuardedWhatsAppNodeToInternalAction} className="space-y-2 rounded-[10px] border border-[#e0e9e3] bg-[#f7faf8] p-3">
                          <input type="hidden" name="workflow_id" value={workflowId} />
                          <input type="hidden" name="version_number" value={versionNumber} />
                          <input type="hidden" name="node_id" value={selectedNode.id} />
                          <input type="hidden" name="label" value={selectedNode.label} />
                          <div className="text-xs font-bold text-[#294839]">Convert to internal action</div>
                          <select name="action_type" defaultValue="create_followup" className="w-full rounded-[9px] border border-[#dbe7df] bg-white px-3 py-2 text-xs text-[#294839]">
                            <option value="create_followup">Create follow-up</option>
                            <option value="assign_owner">Assign owner</option>
                            <option value="add_tag">Add tag</option>
                            <option value="notify_user">Notify user</option>
                          </select>
                          <button type="submit" className="w-full rounded-[9px] border border-[#dbe7df] bg-white px-3 py-2 text-xs font-bold text-[#587566] hover:bg-[#f0f6f2]">Remove WhatsApp configuration</button>
                        </form>
                      </>
                    ) : (
                      <>
                        <form action={updateFlowNodeAction} key={selectedNode.id} className="space-y-3">
                          <input type="hidden" name="workflow_id" value={workflowId} />
                          <input type="hidden" name="version_number" value={versionNumber} />
                          <input type="hidden" name="node_id" value={selectedNode.id} />

                          <label className="block">
                            <span className="mb-1.5 block text-[10px] font-bold uppercase tracking-[0.07em] text-[#779183]">Step label</span>
                            <input name="label" defaultValue={selectedNode.label} maxLength={120} required className="w-full rounded-[9px] border border-[#dbe7df] bg-white px-3 py-2.5 text-xs text-[#294839] focus:border-[#8dc4a4] focus:outline-none focus:ring-2 focus:ring-[#e1f0e7]" />
                          </label>

                          {selectedNode.node_type === 'trigger' ? (
                            <label className="block">
                              <span className="mb-1.5 block text-[10px] font-bold uppercase tracking-[0.07em] text-[#779183]">Trigger event</span>
                              <select name="event_name" defaultValue={stringConfig(selectedNode.config, 'event_name', 'lead.created')} className="w-full rounded-[9px] border border-[#dbe7df] bg-white px-3 py-2.5 text-xs text-[#294839]">
                                <option value="lead.created">New lead created</option>
                                <option value="message.received">Message received</option>
                                <option value="lead.stage_changed">Lead stage changed</option>
                                <option value="payment.pending">Payment pending</option>
                              </select>
                            </label>
                          ) : null}

                          {selectedNode.node_type === 'wait_for_reply' ? (
                            <>
                              <label className="block"><span className="mb-1.5 block text-[10px] font-bold uppercase tracking-[0.07em] text-[#779183]">Timeout minutes</span><input name="timeout_minutes" type="number" min={1} max={10080} defaultValue={numberConfig(selectedNode.config, 'timeout_minutes', 360)} className="w-full rounded-[9px] border border-[#dbe7df] bg-white px-3 py-2.5 text-xs text-[#294839]" /></label>
                              <label className="flex items-center gap-2 text-[11px] text-[#607e6b]"><input name="stop_on_reply" type="checkbox" defaultChecked={boolConfig(selectedNode.config, 'stop_on_reply', true)} /> Stop no-reply path when customer replies</label>
                            </>
                          ) : null}

                          {selectedNode.node_type === 'wait' ? (
                            <label className="block"><span className="mb-1.5 block text-[10px] font-bold uppercase tracking-[0.07em] text-[#779183]">Delay minutes</span><input name="delay_minutes" type="number" min={1} max={10080} defaultValue={numberConfig(selectedNode.config, 'delay_minutes', 10)} className="w-full rounded-[9px] border border-[#dbe7df] bg-white px-3 py-2.5 text-xs text-[#294839]" /></label>
                          ) : null}

                          {selectedNode.node_type === 'condition' ? (
                            <div className="space-y-3">
                              <label className="block"><span className="mb-1.5 block text-[10px] font-bold uppercase tracking-[0.07em] text-[#779183]">Variable</span><input name="variable" defaultValue={stringConfig(selectedNode.config, 'variable', 'reply_outcome')} maxLength={80} className="w-full rounded-[9px] border border-[#dbe7df] bg-white px-3 py-2.5 text-xs text-[#294839]" /></label>
                              <label className="block"><span className="mb-1.5 block text-[10px] font-bold uppercase tracking-[0.07em] text-[#779183]">Operator</span><select name="operator" defaultValue={stringConfig(selectedNode.config, 'operator', 'equals')} className="w-full rounded-[9px] border border-[#dbe7df] bg-white px-3 py-2.5 text-xs text-[#294839]"><option value="equals">Equals</option><option value="not_equals">Does not equal</option><option value="exists">Exists</option></select></label>
                            </div>
                          ) : null}

                          {selectedNode.node_type === 'action' ? (
                            <label className="block"><span className="mb-1.5 block text-[10px] font-bold uppercase tracking-[0.07em] text-[#779183]">Internal action</span><select name="action_type" defaultValue={stringConfig(selectedNode.config, 'action_type', 'create_followup')} className="w-full rounded-[9px] border border-[#dbe7df] bg-white px-3 py-2.5 text-xs text-[#294839]"><option value="create_followup">Create follow-up</option><option value="assign_owner">Assign owner</option><option value="add_tag">Add tag</option><option value="notify_user">Notify user</option></select></label>
                          ) : null}

                          {selectedNode.node_type === 'human_handoff' ? (
                            <label className="block"><span className="mb-1.5 block text-[10px] font-bold uppercase tracking-[0.07em] text-[#779183]">Handoff reason</span><input name="reason" defaultValue={stringConfig(selectedNode.config, 'reason', 'manual_review')} maxLength={120} className="w-full rounded-[9px] border border-[#dbe7df] bg-white px-3 py-2.5 text-xs text-[#294839]" /></label>
                          ) : null}

                          {selectedNode.node_type === 'human_approval' ? (
                            <div className="rounded-[9px] border border-[#d9e5f0] bg-[#f5f8fb] px-3 py-2.5 text-[11px] leading-4 text-[#59738a]">This step requires human review before the journey can continue.</div>
                          ) : null}

                          {selectedNode.node_type === 'end' ? (
                            <label className="block"><span className="mb-1.5 block text-[10px] font-bold uppercase tracking-[0.07em] text-[#779183]">Outcome</span><input name="outcome" defaultValue={stringConfig(selectedNode.config, 'outcome')} maxLength={80} className="w-full rounded-[9px] border border-[#dbe7df] bg-white px-3 py-2.5 text-xs text-[#294839]" /></label>
                          ) : null}

                          <button type="submit" className="inline-flex h-9 w-full items-center justify-center gap-2 rounded-[9px] bg-[#236950] px-3 text-xs font-bold text-white hover:bg-[#19533f]"><Save size={13} /> Save node settings</button>
                        </form>

                        {selectedNode.node_type === 'action' ? (
                          <div className="border-t border-[#e7ede9] pt-4">
                            <div className="mb-2 text-[10px] font-bold uppercase tracking-[0.08em] text-[#85968d]">Or send approved template</div>
                            <GuardedWhatsAppForm workflowId={workflowId} versionNumber={versionNumber} node={selectedNode} templates={whatsappTemplates} />
                          </div>
                        ) : null}
                      </>
                    )}

                    {selectedOutgoingEdges.length > 0 ? (
                      <div className="border-t border-[#e7ede9] pt-4">
                        <div className="mb-2 text-[10px] font-bold uppercase tracking-[0.12em] text-[#85968d]">Branch outcomes</div>
                        <div className="space-y-2">
                          {selectedOutgoingEdges.map((edge) => {
                            const target = nodeMap.get(edge.target_node_id);
                            return (
                              <form action={updateFlowEdgeAction} key={edge.id} className="rounded-[9px] border border-[#dceae0] bg-[#f5faf6] p-2.5">
                                <input type="hidden" name="workflow_id" value={workflowId} />
                                <input type="hidden" name="version_number" value={versionNumber} />
                                <input type="hidden" name="edge_id" value={edge.id} />
                                <div className="mb-2 flex items-center gap-1.5 text-[10px] font-bold text-[#688776]"><CheckCircle2 size={12} className="text-[#4d9a6c]" /> {selectedNode.label} → {target?.label || 'Unknown'}</div>
                                <div className="grid gap-2">
                                  <input name="label" defaultValue={edge.label ?? ''} maxLength={120} placeholder="Branch label" className="rounded-lg border border-[#dbe7df] bg-white px-2.5 py-2 text-[11px] text-[#294839]" />
                                  <input name="branch_value" defaultValue={stringConfig(edge.condition, 'equals')} maxLength={80} placeholder="Branch value" className="rounded-lg border border-[#dbe7df] bg-white px-2.5 py-2 text-[11px] text-[#294839]" />
                                  <select name="target_node_id" defaultValue={edge.target_node_id} className="rounded-lg border border-[#dbe7df] bg-white px-2.5 py-2 text-[11px] text-[#294839]">
                                    {nodes.filter((node) => node.id !== edge.source_node_id).map((node) => <option key={node.id} value={node.id}>{node.label}</option>)}
                                  </select>
                                </div>
                                <button type="submit" className="mt-2 text-[10px] font-bold text-[#347e60] hover:text-[#183f33]">Save connection</button>
                              </form>
                            );
                          })}
                        </div>
                      </div>
                    ) : null}

                    {selectedNode.node_type !== 'trigger' ? (
                      <form action={deleteFlowNodeAction} className="border-t border-[#e7ede9] pt-3">
                        <input type="hidden" name="workflow_id" value={workflowId} />
                        <input type="hidden" name="version_number" value={versionNumber} />
                        <input type="hidden" name="node_id" value={selectedNode.id} />
                        <button type="submit" className="inline-flex w-full items-center justify-center gap-2 rounded-[9px] border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-bold text-rose-700 hover:bg-rose-100"><Trash2 size={13} /> Delete node</button>
                      </form>
                    ) : null}

                    <div className="rounded-[10px] border border-[#dde9e2] bg-[#f8fbf9] p-3 text-[10.5px] leading-5 text-[#698276]">
                      <div className="mb-1 text-[10px] font-bold uppercase tracking-[0.08em] text-[#496959]">Before publishing</div>
                      Validate the current draft after structural or configuration changes. Provider eligibility and runtime safety remain enforced by the automation backend.
                    </div>
                  </div>
                ) : (
                  <div className="rounded-[10px] border border-dashed border-[#dce7df] px-4 py-8 text-center text-xs text-[#7c9187]">Select a step on the canvas to edit its configuration.</div>
                )}
              </div>
            </>
          ) : (
            <div className="hidden h-full flex-col items-center gap-3 pt-3 text-[#547565] xl:flex">
              <button type="button" onClick={() => setInspectorOpen(true)} title="Expand settings" className="grid h-7 w-7 place-items-center rounded-lg border border-[#e0e9e3] hover:bg-[#f3f8f4]"><PanelRightOpen size={14} /></button>
              <strong className="text-[10px] tracking-[0.09em] [writing-mode:vertical-rl] rotate-180">NODE SETTINGS</strong>
            </div>
          )}
        </aside>
      </div>
    </section>
  );
}
