'use client';

import { useMemo, useState } from 'react';
import { GitBranch, MessageSquareReply, MousePointer2, Play, Square } from 'lucide-react';

import { saveFlowLayoutAction } from '@/app/automation/flow-builder/actions';

type FlowNode = {
  id: string;
  node_key: string;
  node_type: string;
  label: string;
  position_x: number;
  position_y: number;
};

type FlowEdge = {
  id: string;
  source_node_id: string;
  target_node_id: string;
  edge_key: string;
  label: string | null;
};

function NodeIcon({ type }: { type: string }) {
  if (type === 'trigger') return <Play size={15} />;
  if (type === 'condition') return <GitBranch size={15} />;
  if (type === 'wait_for_reply') return <MessageSquareReply size={15} />;
  return <Square size={15} />;
}

function nodeClass(type: string) {
  if (type === 'trigger') return 'border-emerald-200 bg-emerald-50';
  if (type === 'condition') return 'border-amber-200 bg-amber-50';
  if (type === 'wait_for_reply') return 'border-violet-200 bg-violet-50';
  return 'border-slate-200 bg-white';
}

export function FlowCanvas({
  workflowId,
  versionNumber,
  initialNodes,
  edges,
}: {
  workflowId: string;
  versionNumber: number;
  initialNodes: FlowNode[];
  edges: FlowEdge[];
}) {
  const [nodes, setNodes] = useState(initialNodes);
  const [draggingId, setDraggingId] = useState<string | null>(null);

  const nodeMap = useMemo(() => new Map(nodes.map((node) => [node.id, node])), [nodes]);
  const canvasWidth = Math.max(1180, ...nodes.map((node) => node.position_x + 260));
  const canvasHeight = Math.max(620, ...nodes.map((node) => node.position_y + 180));

  const layoutJson = JSON.stringify(
    nodes.map((node) => ({ id: node.id, x: node.position_x, y: node.position_y })),
  );

  function onDragStart(event: React.DragEvent<HTMLDivElement>, nodeId: string) {
    const node = nodeMap.get(nodeId);
    if (!node) return;
    setDraggingId(nodeId);
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', JSON.stringify({
      id: nodeId,
      offsetX: event.nativeEvent.offsetX,
      offsetY: event.nativeEvent.offsetY,
    }));
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

    setNodes((current) => current.map((node) => (
      node.id === payload?.id ? { ...node, position_x: nextX, position_y: nextY } : node
    )));
    setDraggingId(null);
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-sm text-slate-600">
          <MousePointer2 size={16} />
          Drag nodes to rearrange the flow. Saving only persists layout positions.
        </div>

        <form action={saveFlowLayoutAction}>
          <input type="hidden" name="workflow_id" value={workflowId} />
          <input type="hidden" name="version_number" value={versionNumber} />
          <input type="hidden" name="layout" value={layoutJson} />
          <button type="submit" className="btn-primary">Save layout</button>
        </form>
      </div>

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
              <marker id="flow-arrow" markerWidth="10" markerHeight="10" refX="9" refY="3" orient="auto" markerUnits="strokeWidth">
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
                  <path d={path} fill="none" stroke="currentColor" strokeWidth="2" markerEnd="url(#flow-arrow)" />
                  {edge.label ? (
                    <text x={(x1 + x2) / 2} y={(y1 + y2) / 2 - 8} textAnchor="middle" className="fill-slate-500 text-[11px] font-semibold">
                      {edge.label}
                    </text>
                  ) : null}
                </g>
              );
            })}
          </svg>

          {nodes.map((node) => (
            <div
              key={node.id}
              draggable
              onDragStart={(event) => onDragStart(event, node.id)}
              onDragEnd={() => setDraggingId(null)}
              className={`absolute w-[210px] cursor-grab rounded-2xl border p-4 shadow-sm transition active:cursor-grabbing ${nodeClass(node.node_type)} ${draggingId === node.id ? 'opacity-60' : ''}`}
              style={{ left: node.position_x, top: node.position_y }}
            >
              <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-wide text-slate-500">
                <NodeIcon type={node.node_type} />
                {node.node_type.replaceAll('_', ' ')}
              </div>
              <div className="mt-2 text-sm font-bold text-slate-950">{node.label}</div>
              <div className="mt-2 truncate text-[11px] text-slate-400">{node.node_key}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
