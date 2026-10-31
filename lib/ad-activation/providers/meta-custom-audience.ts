import "server-only";

import type { AdActivationAction } from "@/lib/ad-activation/types";
import type { HashedAdActivationIdentifiers } from "@/lib/ad-activation/identifier-resolution";


function assertSha256Hex(values: readonly string[], label: string) {
  if (values.some((value) => !/^[a-f0-9]{64}$/.test(value))) {
    throw new Error(`${label} must contain SHA-256 hex identifiers only.`);
  }
}

export type MetaCustomAudienceDryRunOperation = {
  provider: "meta";
  action: AdActivationAction;
  method: "POST" | "DELETE";
  resourcePath: string;
  body: {
    payload: {
      schema: "EMAIL_SHA256" | "PHONE_SHA256";
      data: string[];
    };
  };
};

/**
 * Build Meta Custom Audience operations without performing a Graph API request.
 * Separate email/phone operations avoid ambiguous multi-key row alignment.
 */
export function buildMetaCustomAudienceDryRun(input: {
  audienceId: string;
  action: AdActivationAction;
  identifiers: HashedAdActivationIdentifiers;
}): MetaCustomAudienceDryRunOperation[] {
  const audienceId = input.audienceId.trim();
  if (!audienceId || !/^\d+$/.test(audienceId)) {
    throw new Error("A numeric Meta Custom Audience ID is required.");
  }

  assertSha256Hex(input.identifiers.emailsSha256, "Meta email identifiers");
  assertSha256Hex(input.identifiers.phonesSha256, "Meta phone identifiers");

  const method = input.action === "add" ? "POST" : "DELETE";
  const operations: MetaCustomAudienceDryRunOperation[] = [];

  if (input.identifiers.emailsSha256.length > 0) {
    operations.push({
      provider: "meta",
      action: input.action,
      method,
      resourcePath: `/${audienceId}/users`,
      body: {
        payload: {
          schema: "EMAIL_SHA256",
          data: input.identifiers.emailsSha256,
        },
      },
    });
  }

  if (input.identifiers.phonesSha256.length > 0) {
    operations.push({
      provider: "meta",
      action: input.action,
      method,
      resourcePath: `/${audienceId}/users`,
      body: {
        payload: {
          schema: "PHONE_SHA256",
          data: input.identifiers.phonesSha256,
        },
      },
    });
  }

  return operations;
}
