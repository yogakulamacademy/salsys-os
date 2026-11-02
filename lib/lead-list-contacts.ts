import "server-only";
import type { LeadOverview } from "@/types/crm";
import type { createClient } from "@/lib/supabase/server";

/** Hydrate visible rows through the same per-lead PII policy as the inspector.
 * Never fall back to unmasked overview columns when the secure read fails. */
export async function withAuthorizedLeadContacts(
  supabase: Awaited<ReturnType<typeof createClient>>,
  leads: LeadOverview[],
): Promise<LeadOverview[]> {
  if (!leads.length) return leads;
  try {
    const { data, error } = await supabase.rpc("get_admissions_lead_contacts_secure", {
      p_lead_ids: leads.map(lead => lead.id),
    });
    if (error) throw error;
    type ContactRow = { lead_id: string; email: string | null; phone: string | null; whatsapp: string | null; pii_masked: boolean };
    const contacts = new Map<string, ContactRow>((data ?? []).map((row: ContactRow) => [row.lead_id, row] as const));
    return leads.map(lead => {
      const contact = contacts.get(lead.id);
      const email = contact?.email || undefined;
      const phone = contact?.phone || contact?.whatsapp || undefined;
      return { ...lead, email, phone, contactAvailability: !contact ? "restricted" : email || phone ? "available" : "missing" };
    });
  } catch {
    return leads.map(lead => ({ ...lead, email: undefined, phone: undefined, contactAvailability: "unavailable" }));
  }
}
