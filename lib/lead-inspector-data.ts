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
  availability: {
    payments: LeadInspectorAvailability;
    person360: LeadInspectorAvailability;
    journey: LeadInspectorAvailability;
    contactHistory: LeadInspectorAvailability;
  };
  warnings: string[];
};

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

  const [paymentsResult, journeyResult, contactLogsResult, contactSummaryResult] =
    await Promise.allSettled([
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
    },
    warnings,
  };
}
