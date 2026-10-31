import "server-only";

import type { AdActivationAction } from "@/lib/ad-activation/types";
import type { HashedAdActivationIdentifiers } from "@/lib/ad-activation/identifier-resolution";


function assertSha256Hex(values: readonly string[], label: string) {
  if (values.some((value) => !/^[a-f0-9]{64}$/.test(value))) {
    throw new Error(`${label} must contain SHA-256 hex identifiers only.`);
  }
}

export type GoogleDataManagerDryRun = {
  provider: "google_ads";
  action: AdActivationAction;
  rpc: "IngestAudienceMembers" | "RemoveAudienceMembers";
  validateOnly: true;
  request: {
    destinations: Array<{
      operatingAccount: { accountType: "GOOGLE_ADS"; accountId: string };
      productDestinationId: string;
      loginAccount?: { accountType: "GOOGLE_ADS" | "DATA_PARTNER"; accountId: string };
      linkedAccount?: { accountType: "DATA_PARTNER"; accountId: string };
    }>;
    audienceMembers: Array<{
      compositeData: {
        userData: {
          userIdentifiers: Array<
            | { emailAddress: string }
            | { phoneNumber: string }
          >;
        };
      };
    }>;
    encoding: "HEX";
    validateOnly: true;
    consent?: {
      adUserData: "CONSENT_GRANTED";
      adPersonalization: "CONSENT_GRANTED";
    };
    termsOfService?: {
      customerMatchTermsOfServiceStatus: "ACCEPTED";
    };
  };
};

export function buildGoogleDataManagerDryRun(input: {
  audienceId: string;
  operatingAccountId: string;
  action: AdActivationAction;
  identifiers: HashedAdActivationIdentifiers;
  customerMatchTermsAccepted: boolean;
  loginAccount?: { accountType: "GOOGLE_ADS" | "DATA_PARTNER"; accountId: string };
  linkedDataPartnerAccountId?: string;
}): GoogleDataManagerDryRun {
  const audienceId = input.audienceId.trim();
  const operatingAccountId = input.operatingAccountId.replace(/\D/g, "");
  if (!audienceId || !/^\d+$/.test(audienceId)) {
    throw new Error("A numeric Google Customer Match audience ID is required.");
  }
  if (!operatingAccountId) {
    throw new Error("A Google Ads operating account ID is required.");
  }
  if (input.action === "add" && !input.customerMatchTermsAccepted) {
    throw new Error("Customer Match terms must be explicitly accepted before add validation.");
  }

  assertSha256Hex(input.identifiers.emailsSha256, "Google email identifiers");
  assertSha256Hex(input.identifiers.phonesSha256, "Google phone identifiers");

  const userIdentifiers: Array<{ emailAddress: string } | { phoneNumber: string }> = [
    ...input.identifiers.emailsSha256.map((emailAddress) => ({ emailAddress })),
    ...input.identifiers.phonesSha256.map((phoneNumber) => ({ phoneNumber })),
  ];

  const destination: GoogleDataManagerDryRun["request"]["destinations"][number] = {
    operatingAccount: { accountType: "GOOGLE_ADS", accountId: operatingAccountId },
    productDestinationId: audienceId,
  };

  if (input.loginAccount?.accountId.trim()) {
    destination.loginAccount = {
      accountType: input.loginAccount.accountType,
      accountId: input.loginAccount.accountId.replace(/\D/g, ""),
    };
  }
  if (input.linkedDataPartnerAccountId?.trim()) {
    destination.linkedAccount = {
      accountType: "DATA_PARTNER",
      accountId: input.linkedDataPartnerAccountId.replace(/\D/g, ""),
    };
  }

  const request: GoogleDataManagerDryRun["request"] = {
    destinations: [destination],
    audienceMembers: userIdentifiers.length > 0
      ? [{ compositeData: { userData: { userIdentifiers } } }]
      : [],
    encoding: "HEX",
    validateOnly: true,
  };

  if (input.action === "add") {
    request.consent = {
      adUserData: "CONSENT_GRANTED",
      adPersonalization: "CONSENT_GRANTED",
    };
    request.termsOfService = {
      customerMatchTermsOfServiceStatus: "ACCEPTED",
    };
  }

  return {
    provider: "google_ads",
    action: input.action,
    rpc: input.action === "add" ? "IngestAudienceMembers" : "RemoveAudienceMembers",
    validateOnly: true,
    request,
  };
}
