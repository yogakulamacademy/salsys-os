import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import type { AdActivationAction } from "@/lib/ad-activation/types";
import {
  hashedActivationEmails,
  hashedActivationPhones,
} from "@/lib/ad-activation/normalization";

export type HashedAdActivationIdentifiers = {
  emailsSha256: string[];
  phonesSha256: string[];
};

type CanonicalIdentifierRow = {
  identifier_type: string;
  normalized_value: string;
  verified: boolean;
  confidence: number | string | null;
  last_seen_at: string;
};

/**
 * Resolve first-party contact identifiers for a canonical Person and immediately
 * transform them into provider-safe SHA-256 values.
 *
 * Raw normalized values exist only in this function's local memory. They are not
 * returned, logged, copied into the activation outbox, or written to another table.
 */
export async function resolveHashedAdActivationIdentifiers(input: {
  organizationId: string;
  personId: string;
  action: AdActivationAction;
}): Promise<HashedAdActivationIdentifiers> {
  const organizationId = input.organizationId.trim();
  const personId = input.personId.trim();

  if (!organizationId || !personId) {
    throw new Error("organizationId and personId are required for identifier resolution.");
  }

  const admin = createAdminClient();

  const { data: person, error: personError } = await admin
    .from("persons")
    .select("id,status")
    .eq("organization_id", organizationId)
    .eq("id", personId)
    .maybeSingle();

  if (personError) {
    throw new Error(`Activation person lookup failed: ${personError.message}`);
  }
  if (!person) {
    return { emailsSha256: [], phonesSha256: [] };
  }
  if (input.action === "add" && person.status !== "active") {
    return { emailsSha256: [], phonesSha256: [] };
  }

  const { data, error } = await admin
    .from("person_identifiers")
    .select("identifier_type,normalized_value,verified,confidence,last_seen_at")
    .eq("organization_id", organizationId)
    .eq("person_id", personId)
    .in("identifier_type", ["email", "phone", "whatsapp"])
    .order("verified", { ascending: false })
    .order("confidence", { ascending: false })
    .order("last_seen_at", { ascending: false });

  if (error) {
    throw new Error(`Activation identifier lookup failed: ${error.message}`);
  }

  const rows = (data ?? []) as CanonicalIdentifierRow[];
  const emails: string[] = [];
  const phones: string[] = [];

  for (const row of rows) {
    if (row.identifier_type === "email") {
      emails.push(row.normalized_value);
    } else if (row.identifier_type === "phone" || row.identifier_type === "whatsapp") {
      phones.push(row.normalized_value);
    }
  }

  return {
    emailsSha256: hashedActivationEmails(emails),
    phonesSha256: hashedActivationPhones(phones),
  };
}
