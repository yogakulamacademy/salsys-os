"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { AlertCircle, Check, ChevronDown, Clock3, MessageSquare, RefreshCw, Sparkles } from "lucide-react";

import { generateLeadInsightsAction } from "@/app/leads/insights-actions";
import { submitLeadInsightFeedbackAction } from "@/app/leads/insight-feedback-actions";
import type { LeadInsightV1 } from "@/lib/ai/lead-insight-validation";
import type {
  InsightFeedbackIssue,
  InsightFeedbackRating,
} from "@/lib/ai/lead-insight-feedback";

type InsightData = {
  schemaVersion: "lead_insights_v1";
  generatedAt: string;
  leadId: string;
  model: string | null;
  reviewRequired: true;
  runId?: string | null;
  insight: LeadInsightV1;
  evidence: Array<{ ref: string; kind: string; occurredAt: string | null }>;
  limitations: string[];
};

const issues: Array<{ key: InsightFeedbackIssue; title: string }> = [
  { key: "unsupported_claim", title: "Claim not supported" },
  { key: "wrong_intent", title: "Incorrect intent" },
  { key: "wrong_objection", title: "Incorrect objection" },
  { key: "wrong_next_action", title: "Poor next action" },
  { key: "missing_context", title: "Missing context" },
  { key: "outdated_context", title: "Outdated evidence" },
  { key: "privacy_concern", title: "Privacy concern" },
  { key: "other", title: "Other issue" },
];

const ratingOptions: Array<{ key: InsightFeedbackRating; title: string }> = [
  { key: "accurate", title: "Accurate" },
  { key: "partially_accurate", title: "Partly accurate" },
  { key: "inaccurate", title: "Incorrect" },
  { key: "unsure", title: "Unsure" },
];

function evidenceLabel(ref: string): string {
  const prefix = ref.split(":")[0];
  const labels: Record<string, string> = {
    lead: "Lead details",
    message: "Message",
    activity: "Activity",
    task: "Task",
    stage_change: "Stage history",
    payment: "Payment record",
  };
  return labels[prefix] ?? "CRM evidence";
}

function EvidenceLinks({
  leadId,
  ids,
  evidence,
}: {
  leadId: string;
  ids: string[];
  evidence: InsightData["evidence"];
}) {
  if (!ids.length) return null;
  const allowed = new Map(evidence.map((item) => [item.ref, item]));
  return (
    <div className="flex flex-wrap items-center gap-1.5" aria-label="Supporting evidence">
      {ids.map((ref) => {
        const item = allowed.get(ref);
        if (!item) return null;
        // The current CRM does not support direct message-row anchors. Open
        // the authorized lead's conversation/profile, not an invented deep link.
        const href = item.kind === "message"
          ? `/conversations?lead=${encodeURIComponent(leadId)}`
          : `/leads/${encodeURIComponent(leadId)}`;
        return (
          <Link
            key={ref}
            href={href}
            title={`Open ${evidenceLabel(ref).toLowerCase()} context`}
            className="inline-flex items-center rounded-md border border-line bg-surface px-2 py-1 text-[11px] font-medium text-copy-muted hover:text-copy focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
          >
            {evidenceLabel(ref)}
            {item.occurredAt ? ` · ${new Date(item.occurredAt).toLocaleDateString()}` : ""}
          </Link>
        );
      })}
    </div>
  );
}

function InsightDetails({ data }: { data: InsightData }) {
  const { insight, leadId, evidence } = data;
  if (insight.status === "insufficient_evidence") {
    return (
      <div role="status" className="rounded-lg border border-line bg-surface px-3 py-3">
        <p className="text-sm font-medium text-copy">Not enough evidence yet</p>
        <p className="mt-1 text-xs leading-5 text-copy-muted">
          No reliable buying intent or follow-up recommendation can be inferred from the available CRM record.
        </p>
      </div>
    );
  }
  return (
    <div className="space-y-3 text-sm">
      <div className="rounded-lg bg-surface p-3">
        <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-copy-muted">
          Conversation summary
        </p>
        <p className="leading-5 text-copy">{insight.summary.text}</p>
        <div className="mt-2"><EvidenceLinks leadId={leadId} ids={insight.summary.evidenceRefs} evidence={evidence}/></div>
      </div>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <section className="rounded-lg border border-line p-3" aria-label="Inferred intent">
          <p className="text-[11px] font-medium text-copy-muted">Inferred intent</p>
          <p className="mt-1 font-semibold capitalize text-copy">{insight.intent.level.replaceAll("_", " ")}</p>
          <p className="mt-1 text-xs leading-5 text-copy-muted">{insight.intent.reason || "Not established"}</p>
          <div className="mt-2"><EvidenceLinks leadId={leadId} ids={insight.intent.evidenceRefs} evidence={evidence}/></div>
        </section>
        <section className="rounded-lg border border-line p-3" aria-label="Recommended next action">
          <p className="text-[11px] font-medium text-copy-muted">Next action for staff</p>
          <p className="mt-1 font-semibold text-copy">{insight.nextAction.kind === "none" ? "No reliable action" : insight.nextAction.kind.replaceAll("_", " ")}</p>
          <p className="mt-1 text-xs leading-5 text-copy-muted">{insight.nextAction.description || "Staff should review the conversation."}</p>
          <div className="mt-2"><EvidenceLinks leadId={leadId} ids={insight.nextAction.evidenceRefs} evidence={evidence}/></div>
        </section>
      </div>
      {insight.interests.length > 0 && (
        <section className="space-y-2">
          <p className="text-xs font-semibold text-copy">Interests</p>
          {insight.interests.map((item, i) => (
            <div key={i} className="rounded-lg border border-line px-3 py-2">
              <p className="text-xs leading-5 text-copy">{item.description}</p>
              <div className="mt-1"><EvidenceLinks leadId={leadId} ids={item.evidenceRefs} evidence={evidence}/></div>
            </div>
          ))}
        </section>
      )}
      {insight.objections.length > 0 && (
        <section className="space-y-2">
          <p className="text-xs font-semibold text-copy">Possible blockers</p>
          {insight.objections.map((item, i) => (
            <div key={i} className="rounded-lg border border-line px-3 py-2">
              <p className="text-xs leading-5 text-copy"><span className="font-medium capitalize">{item.category}:</span> {item.description}</p>
              <div className="mt-1"><EvidenceLinks leadId={leadId} ids={item.evidenceRefs} evidence={evidence}/></div>
            </div>
          ))}
        </section>
      )}
      {insight.uncertainty.length > 0 && (
        <div className="rounded-lg bg-surface p-3">
          <p className="text-[11px] font-semibold text-copy-muted">Uncertainty / missing information</p>
          <ul className="mt-1 list-disc space-y-1 pl-4 text-xs leading-5 text-copy-muted">
            {insight.uncertainty.map((line, i) => <li key={i}>{line}</li>)}
          </ul>
        </div>
      )}
    </div>
  );
}

/** Human-triggered staff review only. Server actions independently authorize. */
export function AILeadInsightPanel({
  leadId,
  compact = false,
}: {
  leadId: string;
  compact?: boolean;
}) {
  const [data, setData] = useState<InsightData | null>(null);
  const [working, setWorking] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rating, setRating] = useState<InsightFeedbackRating | "">("");
  const [issue, setIssue] = useState<InsightFeedbackIssue | "">("");
  const [feedbackSaved, setFeedbackSaved] = useState(false);
  const [expanded, setExpanded] = useState(!compact);
  const requestId = useRef(0);

  useEffect(() => {
    requestId.current += 1;
    setData(null);
    setWorking(false);
    setSubmitting(false);
    setError(null);
    setRating("");
    setIssue("");
    setFeedbackSaved(false);
  }, [leadId]);

  async function generate() {
    if (working || submitting) return;
    const current = ++requestId.current;
    setWorking(true);
    setError(null);
    setData(null);
    setRating("");
    setIssue("");
    setFeedbackSaved(false);
    try {
      const response = await generateLeadInsightsAction(leadId);
      if (requestId.current !== current) return;
      if (!response.ok) throw new Error(response.error);
      if (response.data.leadId !== leadId) throw new Error("The selected lead changed. Try again.");
      setData(response.data);
      setExpanded(true);
    } catch (reason) {
      if (requestId.current !== current) return;
      setError(reason instanceof Error ? reason.message : "Unable to generate insight.");
    } finally {
      if (requestId.current === current) setWorking(false);
    }
  }

  async function saveFeedback() {
    if (!data?.runId || !rating || submitting || feedbackSaved) return;
    if (rating === "inaccurate" && !issue) {
      setError("Choose a reason before marking an insight incorrect.");
      return;
    }
    setSubmitting(true);
    setError(null);
    const current = requestId.current;
    try {
      const response = await submitLeadInsightFeedbackAction({
        runId: data.runId,
        rating,
        issueCodes: issue ? [issue] : [],
      });
      if (requestId.current !== current) return;
      if (!response.ok) throw new Error(response.error);
      setFeedbackSaved(true);
    } catch (reason) {
      if (requestId.current !== current) return;
      setError(reason instanceof Error ? reason.message : "Unable to save review.");
    } finally {
      if (requestId.current === current) setSubmitting(false);
    }
  }

  return (
    <section
      className="rounded-xl border border-line bg-surface p-3.5 sm:p-4"
      aria-label="AI Lead Intelligence"
      aria-busy={working || submitting}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <Sparkles size={16} className="shrink-0 text-copy-muted" aria-hidden/>
          <div className="min-w-0">
            <h3 className="text-sm font-semibold text-copy">AI Lead Intelligence</h3>
            <p className="text-[11px] text-copy-muted">Evidence-backed staff suggestions · Manual review required</p>
          </div>
        </div>
        <button type="button" onClick={() => void generate()} disabled={working || submitting}
          className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-line bg-surface px-3 py-2 text-xs font-semibold text-copy hover:bg-surface-secondary disabled:cursor-not-allowed disabled:opacity-50">
          <RefreshCw size={13} className={working ? "animate-spin" : ""}/>
          {working ? "Analyzing…" : data ? "Regenerate" : "Generate"}
        </button>
      </div>

      {compact && (
        <Link href={`/leads/${encodeURIComponent(leadId)}/intelligence`}
          className="mt-2 inline-flex text-[11px] font-medium text-copy-muted underline-offset-2 hover:text-copy hover:underline">
          Open full review
        </Link>
      )}

      {error && <p role="alert" className="mt-3 flex gap-2 rounded-lg border border-line p-2 text-xs text-copy">
        <AlertCircle size={14} className="shrink-0"/>{error}
      </p>}

      {!data && !working && <p className="mt-3 text-xs leading-5 text-copy-muted">
        Generate a reviewable summary of the lead's available conversation and CRM evidence.
        No message will be sent, and no lead or payment record will be changed.
      </p>}
      {working && <p role="status" className="mt-3 text-xs text-copy-muted">
        Checking lead history and generating supported insights…
      </p>}

      {data && (
        <div className="mt-3 border-t border-line pt-3">
          <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-copy-muted">
            <span className="inline-flex items-center gap-1"><Clock3 size={12}/> Generated {new Date(data.generatedAt).toLocaleString()}</span>
            <button type="button" onClick={() => setExpanded(!expanded)}
              aria-expanded={expanded}
              className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-copy hover:bg-surface-secondary">
              {expanded ? "Hide detail" : "Show detail"} <ChevronDown size={13} className={expanded ? "rotate-180" : ""}/>
            </button>
          </div>
          {expanded && <div className="mt-3 space-y-3">
            <InsightDetails data={data}/>
            {data.limitations.length > 0 && (
              <details className="text-xs text-copy-muted">
                <summary className="cursor-pointer font-medium">Data limitations</summary>
                <ul className="mt-2 list-disc space-y-1 pl-4">
                  {data.limitations.map((x, i) => <li key={i}>{x}</li>)}
                </ul>
              </details>
            )}
            {data.runId ? (
              <div className="rounded-lg border border-line p-3">
                <p className="text-xs font-semibold text-copy">How accurate was this insight?</p>
                {feedbackSaved ? (
                  <p role="status" className="mt-2 inline-flex items-center gap-1.5 text-xs text-copy-muted"><Check size={14}/> Review saved</p>
                ) : (
                  <div className="mt-2 space-y-2">
                    <div className="flex flex-wrap gap-1.5" role="group" aria-label="Insight quality rating">
                      {ratingOptions.map(o => (
                        <button key={o.key} type="button" onClick={() => { setRating(o.key); setIssue(""); }}
                          disabled={submitting}
                          aria-pressed={rating === o.key}
                          className={`rounded-md border px-2.5 py-1.5 text-[11px] font-semibold disabled:opacity-50 ${rating === o.key ? "border-copy bg-surface-secondary text-copy" : "border-line text-copy-muted"}`}>
                          {o.title}
                        </button>
                      ))}
                    </div>
                    {(rating === "inaccurate" || rating === "partially_accurate") && (
                      <label className="block text-xs text-copy-muted">
                        Reason {rating === "inaccurate" ? "(required)" : "(optional)"}
                        <select value={issue} onChange={e => setIssue(e.target.value as InsightFeedbackIssue | "")}
                          className="mt-1 block w-full rounded-md border border-line bg-surface px-2 py-2 text-xs text-copy">
                          <option value="">Select a reason</option>
                          {issues.map(o => <option key={o.key} value={o.key}>{o.title}</option>)}
                        </select>
                      </label>
                    )}
                    <button type="button" onClick={() => void saveFeedback()} disabled={submitting || !rating || (rating === "inaccurate" && !issue)}
                      className="rounded-lg border border-line bg-surface-secondary px-3 py-2 text-xs font-semibold text-copy disabled:cursor-not-allowed disabled:opacity-50">
                      {submitting ? "Saving…" : "Save review"}
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <p className="text-[11px] text-copy-muted">
                Feedback capture is not enabled for this analysis.
              </p>
            )}
            <p className="text-[11px] leading-4 text-copy-muted">
              Suggestions are inferred from available records, not verified facts. All actions require staff review.
            </p>
          </div>}
        </div>
      )}
    </section>
  );
}
