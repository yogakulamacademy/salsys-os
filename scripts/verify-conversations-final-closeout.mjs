import fs from "node:fs";
import path from "node:path";

const root = process.cwd();

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

function requireText(source, needle, label) {
  if (!source.includes(needle)) {
    throw new Error(`Conversations final closeout verification failed: ${label}`);
  }
}

function forbidText(source, needle, label) {
  if (source.includes(needle)) {
    throw new Error(`Conversations final closeout verification failed: ${label}`);
  }
}

const layout = read("app/conversations/layout.tsx");
const page = read("app/conversations/page.tsx");
const data = read("lib/conversations-data.ts");
const core = read("lib/conversations-data-core.ts");
const copilot = read("components/conversation-copilot.tsx");
const copilotActions = read("app/conversations/copilot-actions.ts");
const whatsappActions = read("app/conversations/actions.ts");
const instagramActions = read("app/conversations/instagram-actions.ts");
const currentWorkspaceMigration = read(
  "supabase/migrations/20261029093000_current_conversations_workspace_v1.sql",
);

requireText(layout, 'hasCurrentWorkspaceAccess("sales")', "Conversations route tree must remain Sales-workspace guarded");
requireText(core, '"get_current_conversations_workspace_v1"', "optimized Conversations hot path must use the current-workspace RPC");
requireText(currentWorkspaceMigration.toLowerCase(), "security invoker", "current Conversations wrapper must remain SECURITY INVOKER");
requireText(currentWorkspaceMigration, "get_current_workspace_context_v1", "current Conversations wrapper must bind the active tenant server-side");
requireText(currentWorkspaceMigration, "from public, anon", "current Conversations wrapper must deny anonymous execution");
requireText(core, "__legacyFallbackRequired", "compatibility fallback marker must remain explicit in the core loader");

for (const [needle, label] of [
  ['workspaceSource: "canonical_rpc" | "legacy_compatibility"', "workspace evidence source must distinguish canonical and compatibility reads"],
  ['contactGrouping: "person" | "lead_fallback" | "not_applicable"', "contact grouping evidence must distinguish Person and Lead fallback semantics"],
  ["The canonical Conversations read model is unavailable.", "legacy compatibility fallback must carry an operator warning"],
  ["Contact identity grouping could not be verified.", "identity grouping fallback must carry an operator warning"],
]) {
  requireText(data, needle, label);
}

requireText(page, "workspace.evidence.warnings", "Conversations page must surface workspace evidence warnings");
requireText(page, 'tone="warning" title="Compatibility evidence active"', "degraded evidence must be visibly labelled in the UI");
requireText(page, 'label="Lead creation"', "lead-creation channel must be labelled by its canonical meaning");
forbidText(page, 'label="Source"\n            value={selected.leadCreationChannel', "lead-creation channel must never be relabelled as acquisition Source");
requireText(page, '"Compatibility inbox"', "legacy workspace mode must be visible in the inbox mode badge");

requireText(copilotActions, "search_organization_knowledge_v1", "Co-Pilot must use canonical approved organization knowledge retrieval");
forbidText(copilotActions, '.from("knowledge_documents")', "Co-Pilot must not bypass approved knowledge retrieval with direct document reads");
forbidText(copilotActions, '.from("knowledge_chunks")', "Co-Pilot must not bypass approved knowledge retrieval with direct chunk reads");
requireText(copilotActions, "can_work_lead", "Co-Pilot generation must retain per-lead work authorization");
requireText(copilotActions, "You never send messages yourself.", "Co-Pilot must remain draft-only for human review");
requireText(copilot, "approved organization knowledge match", "provenance must describe retrieval hits as matches rather than independent sources");
requireText(copilot, "conversation history is conversational context only", "provenance must keep conversation history non-authoritative");
requireText(copilot, "AI never sends the message.", "Co-Pilot UI must retain explicit human-send semantics");

requireText(whatsappActions, "requireLeadWorkAccess(leadId)", "WhatsApp sends must recheck per-lead work authorization at action time");
requireText(whatsappActions, "CUSTOMER_SERVICE_WINDOW_MS", "WhatsApp free-form sends must retain the server-side customer-service-window check");
requireText(whatsappActions, "getApprovedWhatsAppTemplates(organizationId)", "WhatsApp template sends must revalidate the approved tenant template catalog");
requireText(whatsappActions, "validate_lead_telephone_identity", "WhatsApp template sends must retain telephone identity validation");
requireText(instagramActions, "can_work_lead", "Instagram sends must recheck per-lead work authorization at action time");
requireText(instagramActions, "evaluate_instagram_dm_send_policy_v1", "Instagram sends must recheck provider policy immediately before send");
requireText(instagramActions, "p_automated: false", "manual Instagram replies must stay distinct from autonomous-send policy");
requireText(instagramActions, "p_human_approved: true", "manual Instagram replies must remain human-approved");

console.log("Conversations final closeout contracts verified.");
