import "server-only";

import { getLead, getLeadPayments } from "@/lib/data";
import {
  getPersonJourneyForLead,
  type Person360Summary,
  type PersonJourneyEvent,
} from "@/lib/person-journey-data";
import { createClient } from "@/lib/supabase/server";
import type { LeadDetail } from "@/types/crm";

export type LeadInspectorAvailability = "available" | "empty" | "unavailable";

export type LeadInspectorContactLog = {
  id: string;
  employee_name: string | null;
  method: string;
  direction: string;
  outcome: string;
  contacted_at: string;
  comment: string;
  call_duration_seconds: number | null;
  source: string | null;
};

export type LeadInspectorContactSummary = {
  total_contacts: number | null;
  successful_contacts: number | null;
  no_answer_contacts: number | null;
  follow_up_needed_contacts: number | null;
};

export type LeadInspectorPayment = {
  id: string;
  paymentKind: string;
  status: string;
  amount: number;
  currency: string;
  provider?: string;
  externalPaymentId?: string;
  paidAt?: string;
  createdAt: string;
  notes?: string;
};

export type LeadInspectorSalesIntelligence = {
  derived_intent: string | null;
  intent_confidence: string | null;
  intent_basis: string | null;
  intent_reason_codes: string[] | null;
  engagement_score: number | string | null;
  behaviour_temperature: string | null;
  high_intent_events_7d: number | string | null;
  whatsapp_clicks_7d: number | string | null;
  reservation_starts_7d: number | string | null;
  payment_starts_7d: number | string | null;
  days_since_last_visit: number | string | null;
  has_returned_after_becoming_lead: boolean | null;
  is_reengaged: boolean | null;
  priority_score: number | string | null;
  priority_band: string | null;
  priority_reason: string | null;
  next_action_code: string | null;
  next_best_action: string | null;
  payment_status: string | null;
  outstanding_balance: number | string | null;
  recommended_course_code: string | null;
  recommended_course_name: string | null;
  recommended_affinity_score: number | string | null;
  recommendation_basis: string | null;
  recommendation_reason_codes: string[] | null;
  last_inbound_at: string | null;
  last_outbound_at: string | null;
  next_followup_at: string | null;
};

export type LeadInspectorPayload = {
  schemaVersion: "lead_inspector_v1";
  generatedAt: string;
  lead: LeadDetail & Record<string, unknown>;
  payments: LeadInspectorPayment[];
  person: Person360Summary | null;
  journey: PersonJourneyEvent[];
  journeyTotal: number;
  contactLogs: LeadInspectorContactLog[];
  contactSummary: LeadInspectorContactSummary | null;
  salesIntelligence: LeadInspectorSalesIntelligence | null;
  availability: {
    payments: LeadInspectorAvailability;
    person360: LeadInspectorAvailability;
    journey: LeadInspectorAvailability;
    contactHistory: LeadInspectorAvailability;
    salesIntelligence: LeadInspectorAvailability;
  };
  warnings: string[];
};

const SALES_INTELLIGENCE_SELECT = `
  derived_intent,
  intent_confidence,
  intent_basis,
  intent_reason_codes,
  engagement_score,
  behaviour_temperature,
  high_intent_events_7d,
  whatsapp_clicks_7d,
  reservation_starts_7d,
  payment_starts_7d,
  days_since_last_visit,
  has_returned_after_becoming_lead,
  is_reengaged,
  priority_score,
  priority_band,
  priority_reason,
  next_action_code,
  next_best_action,
  payment_status,
  outstanding_balance,
  recommended_course_code,
  recommended_course_name,
  recommended_affinity_score,
  recommendation_basis,
  recommendation_reason_codes,
  last_inbound_at,
  last_outbound_at,
  next_followup_at
`;

export async function getLeadInspectorData(
  leadId: string,
): Promise<LeadInspectorPayload | null> {
  const normalizedLeadId = String(leadId ?? "").trim();
  if (!normalizedLeadId) {
    throw new Error("A lead ID is required to load the Lead Inspector.");
  }

  // getLead() is the authoritative authorization boundary. It verifies the
  // current user's ability to access this lead before any related records are
  // loaded. A denied lead deliberately resolves as null rather than leaking
  // whether the record exists.
  const lead = await getLead(normalizedLeadId);
  if (!lead) return null;

  const supabase = await createClient();
  const warnings: string[] = [];
  const db = supabase as any;

  const [
    paymentsResult,
    journeyResult,
    contactLogsResult,
    contactSummaryResult,
    salesIntelligenceResult,
  ] = await Promise.allSettled([
    getLeadPayments(normalizedLeadId),
    getPersonJourneyForLead(normalizedLeadId, { limit: 120 }),
    supabase
      .from("v_lead_contact_logs")
      .select(
        "id, employee_name, method, direction, outcome, contacted_at, comment, call_duration_seconds, source",
      )
      .eq("lead_id", normalizedLeadId)
      .order("contacted_at", { ascending: false })
      .limit(40),
    supabase
      .from("v_lead_contact_summary")
      .select(
        "total_contacts, successful_contacts, no_answer_contacts, follow_up_needed_contacts",
      )
      .eq("lead_id", normalizedLeadId)
      .maybeSingle(),
    db
      .from("v_lead_sales_intelligence")
      .select(SALES_INTELLIGENCE_SELECT)
      .eq("lead_id", normalizedLeadId)
      .maybeSingle(),
  ]);

  const payments =
    paymentsResult.status === "fulfilled" ? paymentsResult.value : [];
  if (paymentsResult.status === "rejected") {
    warnings.push("Payment history is temporarily unavailable.");
  }

  const personJourney =
    journeyResult.status === "fulfilled" ? journeyResult.value : null;
  if (journeyResult.status === "rejected") {
    warnings.push("Person 360 and journey intelligence are temporarily unavailable.");
  }

  let contactLogs: LeadInspectorContactLog[] = [];
  let contactHistoryUnavailable = false;
  if (contactLogsResult.status === "rejected") {
    contactHistoryUnavailable = true;
    warnings.push("Contact history is temporarily unavailable.");
  } else if (contactLogsResult.value.error) {
    contactHistoryUnavailable = true;
    warnings.push("Contact history is temporarily unavailable.");
  } else {
    contactLogs = (contactLogsResult.value.data ?? []) as LeadInspectorContactLog[];
  }

  let contactSummary: LeadInspectorContactSummary | null = null;
  if (contactSummaryResult.status === "rejected") {
    contactHistoryUnavailable = true;
    if (!warnings.includes("Contact history is temporarily unavailable.")) {
      warnings.push("Contact history is temporarily unavailable.");
    }
  } else if (contactSummaryResult.value.error) {
    contactHistoryUnavailable = true;
    if (!warnings.includes("Contact history is temporarily unavailable.")) {
      warnings.push("Contact history is temporarily unavailable.");
    }
  } else {
    contactSummary = (contactSummaryResult.value.data ??
      null) as LeadInspectorContactSummary | null;
  }

  let salesIntelligence: LeadInspectorSalesIntelligence | null = null;
  let salesIntelligenceUnavailable = false;
  if (salesIntelligenceResult.status === "rejected") {
    salesIntelligenceUnavailable = true;
    warnings.push("Canonical sales intelligence is temporarily unavailable.");
  } else if (salesIntelligenceResult.value.error) {
    salesIntelligenceUnavailable = true;
    warnings.push("Canonical sales intelligence is temporarily unavailable.");
  } else {
    salesIntelligence = (salesIntelligenceResult.value.data ??
      null) as LeadInspectorSalesIntelligence | null;
  }

  const person = personJourney?.person ?? null;
  const journey = personJourney?.journey ?? [];
  const journeyTotal = personJourney?.journeyTotal ?? 0;

  return {
    schemaVersion: "lead_inspector_v1",
    generatedAt: new Date().toISOString(),
    lead: lead as LeadDetail & Record<string, unknown>,
    payments: payments as LeadInspectorPayment[],
    person,
    journey,
    journeyTotal,
    contactLogs,
    contactSummary,
    salesIntelligence,
    availability: {
      payments:
        paymentsResult.status === "rejected"
          ? "unavailable"
          : payments.length > 0
            ? "available"
            : "empty",
      person360:
        journeyResult.status === "rejected"
          ? "unavailable"
          : person
            ? "available"
            : "empty",
      journey:
        journeyResult.status === "rejected"
          ? "unavailable"
          : journey.length > 0
            ? "available"
            : "empty",
      contactHistory: contactHistoryUnavailable
        ? "unavailable"
        : contactLogs.length > 0 || contactSummary
          ? "available"
          : "empty",
      salesIntelligence: salesIntelligenceUnavailable
        ? "unavailable"
        : salesIntelligence
          ? "available"
          : "empty",
    },
    warnings,
  };
}
