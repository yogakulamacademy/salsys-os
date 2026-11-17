import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  clusterQuestions,
  parseProposal,
  PROPOSAL_SCHEMA,
  proposalDedupeKey,
  proposalSystemPrompt,
  proposalUserPrompt,
  type KnowledgeDocBrief,
  type QuestionMessage,
  type TeamReply,
} from "@/lib/knowledge-proposals";

const LOOKBACK_DAYS = 14;
const MAX_MESSAGES = 3000;
const MAX_TOPICS_PER_RUN = 6;
const REPLY_WINDOW_MS = 48 * 3_600_000;

export type KnowledgeProposalRunSummary = {
  organizationId: string;
  questionsScanned: number;
  topics: number;
  created: number;
  noChangeNeeded: number;
  skipped: number;
  errors: number;
  claudeConfigured: boolean;
};

async function askClaude(system: string, user: string): Promise<unknown | null> {
  const apiKey = process.env.ANTHROPIC_API_KEY?.trim();
  const model = process.env.ANTHROPIC_SONNET_MODEL?.trim() || process.env.ANTHROPIC_HAIKU_MODEL?.trim();
  if (!apiKey || !model) return null;
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "x-api-key": apiKey, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({
      model,
      max_tokens: 1200,
      system,
      messages: [{ role: "user", content: user }],
      output_config: { format: { type: "json_schema", schema: PROPOSAL_SCHEMA } },
    }),
    cache: "no-store",
    signal: AbortSignal.timeout(45_000),
  });
  if (!response.ok) throw new Error(`Claude HTTP ${response.status}`);
  const payload = (await response.json()) as { content?: Array<{ text?: string }> };
  const text = payload.content?.find((b) => typeof b.text === "string")?.text ?? "";
  return JSON.parse(text);
}

export function claudeModelName() {
  return process.env.ANTHROPIC_SONNET_MODEL?.trim() || process.env.ANTHROPIC_HAIKU_MODEL?.trim() || null;
}

/** Proposes knowledge changes for ONE organization. Writes only ai_knowledge_proposals rows. */
export async function runKnowledgeProposals(
  admin: SupabaseClient,
  organizationId: string,
  now = new Date(),
): Promise<KnowledgeProposalRunSummary> {
  const summary: KnowledgeProposalRunSummary = {
    organizationId, questionsScanned: 0, topics: 0, created: 0, noChangeNeeded: 0, skipped: 0, errors: 0,
    claudeConfigured: Boolean(process.env.ANTHROPIC_API_KEY?.trim() && claudeModelName()),
  };
  if (!summary.claudeConfigured) return summary;

  const since = new Date(now.getTime() - LOOKBACK_DAYS * 86_400_000).toISOString();
  const { data: rows, error } = await admin
    .from("messages")
    .select("id, lead_id, conversation_id, body, created_at")
    .eq("organization_id", organizationId)
    .eq("direction", "inbound")
    .eq("sender_type", "lead")
    .gte("created_at", since)
    .not("body", "is", null)
    .order("created_at", { ascending: false })
    .limit(MAX_MESSAGES);
  if (error) throw new Error("Lead questions could not be loaded.");

  const messages: QuestionMessage[] = (rows ?? []).map((r) => ({
    id: String(r.id), leadId: String(r.lead_id), conversationId: String(r.conversation_id),
    body: String(r.body ?? ""), createdAt: String(r.created_at),
  }));
  summary.questionsScanned = messages.length;
  const clusters = clusterQuestions(messages).slice(0, MAX_TOPICS_PER_RUN);
  summary.topics = clusters.length;
  if (!clusters.length) return summary;

  const { data: docRows, error: docError } = await admin
    .from("knowledge_documents")
    .select("id, title, category, status, content")
    .eq("organization_id", organizationId)
    .in("status", ["approved", "draft", "review"])
    .order("updated_at", { ascending: false })
    .limit(80);
  if (docError) throw new Error("Knowledge could not be loaded.");
  const docs: KnowledgeDocBrief[] = (docRows ?? []).map((d) => ({
    id: String(d.id), title: String(d.title), category: String(d.category), status: String(d.status),
    excerpt: String(d.content ?? "").replace(/\s+/g, " ").slice(0, 500),
  }));
  const approvedIds = new Set(docs.filter((d) => d.status === "approved").map((d) => d.id));

  const system = proposalSystemPrompt();
  for (const cluster of clusters) {
    try {
      const teamReplies = await loadTeamReplies(admin, organizationId, cluster.samples);
      const raw = await askClaude(system, proposalUserPrompt({ cluster, docs, teamReplies }));
      const proposal = parseProposal(raw, approvedIds, cluster.topic);
      if (!proposal) { summary.errors += 1; continue; }
      if (proposal.action === "none") { summary.noChangeNeeded += 1; continue; }

      const { data, error: rpcError } = await admin.rpc("record_ai_knowledge_proposal_v1", {
        p_organization_id: organizationId,
        p_kind: proposal.action,
        p_target_document_id: proposal.targetDocumentId,
        p_title: proposal.title,
        p_category: proposal.category,
        p_proposed_content: proposal.content,
        p_why: proposal.why,
        p_expected_effect: proposal.expectedEffect,
        p_risk: proposal.risk || null,
        p_evidence: cluster.samples.map((s) => ({ message_id: s.messageId, quote: s.quote, at: s.at })),
        p_source: teamReplies.length ? "owner_replies" : "unanswered_questions",
        p_dedupe_key: proposalDedupeKey(cluster.topic, now),
        p_model: claudeModelName(),
      });
      if (rpcError) { summary.errors += 1; continue; }
      if ((data as { outcome?: string } | null)?.outcome === "created") summary.created += 1;
      else summary.skipped += 1;
    } catch (err) {
      summary.errors += 1;
      console.error("Knowledge proposal failed", { organizationId, topic: cluster.topic, error: err instanceof Error ? err.message : "unknown" });
    }
  }
  return summary;
}

/** The team's first human reply after each sample question, if the reply was captured. */
async function loadTeamReplies(
  admin: SupabaseClient,
  organizationId: string,
  samples: Array<{ conversationId: string; quote: string; at: string }>,
): Promise<TeamReply[]> {
  const replies: TeamReply[] = [];
  for (const sample of samples.slice(0, 5)) {
    const until = new Date(Date.parse(sample.at) + REPLY_WINDOW_MS).toISOString();
    const { data } = await admin
      .from("messages")
      .select("body")
      .eq("organization_id", organizationId)
      .eq("conversation_id", sample.conversationId)
      .eq("direction", "outbound")
      .eq("sender_type", "human")
      .gt("created_at", sample.at)
      .lte("created_at", until)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    const body = String((data as { body?: string } | null)?.body ?? "").trim();
    if (body) replies.push({ question: sample.quote, reply: body.replace(/\s+/g, " ").slice(0, 600) });
  }
  return replies;
}
