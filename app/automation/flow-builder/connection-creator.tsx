'use client';

import { Link2 } from 'lucide-react';

import { createFlowEdgeAction } from '@/app/automation/flow-builder/edge-actions';

type FlowNode = {
  id: string;
  node_key: string;
  node_type: string;
  label: string;
};

export function ConnectionCreator({
  workflowId,
  versionNumber,
  nodes,
}: {
  workflowId: string;
  versionNumber: number;
  nodes: FlowNode[];
}) {
  const sources = nodes.filter((node) => node.node_type !== 'end');

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5">
      <div className="flex items-start gap-3">
        <div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-violet-50 text-violet-700">
          <Link2 size={16} />
        </div>
        <div>
          <h3 className="font-bold text-slate-950">Create draft connection</h3>
          <p className="mt-1 text-sm text-slate-500">
            Connect an existing source node to an existing target node. This only changes the draft graph.
          </p>
        </div>
      </div>

      <form action={createFlowEdgeAction} className="mt-5 grid gap-3 lg:grid-cols-2">
        <input type="hidden" name="workflow_id" value={workflowId} />
        <input type="hidden" name="version_number" value={versionNumber} />

        <label className="block">
          <span className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-slate-500">Source node</span>
          <select name="source_node_id" required defaultValue="" className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900">
            <option value="" disabled>Select source</option>
            {sources.map((node) => (
              <option key={node.id} value={node.id}>{node.label} · {node.node_type.replaceAll('_', ' ')}</option>
            ))}
          </select>
        </label>

        <label className="block">
          <span className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-slate-500">Target node</span>
          <select name="target_node_id" required defaultValue="" className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900">
            <option value="" disabled>Select target</option>
            {nodes.map((node) => (
              <option key={node.id} value={node.id}>{node.label} · {node.node_type.replaceAll('_', ' ')}</option>
            ))}
          </select>
        </label>

        <label className="block">
          <span className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-slate-500">Connection label</span>
          <input name="label" maxLength={120} placeholder="e.g. Continue after delay" className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900" />
        </label>

        <label className="block">
          <span className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-slate-500">Branch value</span>
          <input name="branch_value" maxLength={80} placeholder="Optional" className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900" />
        </label>

        <div className="lg:col-span-2 flex items-center justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
          <p className="text-xs leading-5 text-amber-800">
            Creating a connection does not publish or execute the flow and does not send any customer message.
          </p>
          <button type="submit" className="btn-primary shrink-0">Create connection</button>
        </div>
      </form>
    </section>
  );
}
