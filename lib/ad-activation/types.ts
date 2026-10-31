import "server-only";

export type AdActivationPlatform = "meta" | "google_ads";
export type AdActivationAction = "add" | "remove";
export type AdActivationDestinationKind = "custom_audience" | "customer_match";

export type AdActivationIdentifiers = {
  emails: string[];
  phones: string[];
  gclid: string | null;
  gbraid: string | null;
  wbraid: string | null;
  fbclid: string | null;
  fbc: string | null;
  fbp: string | null;
};

export type AdActivationSafeMetadata = {
  courseId?: string;
  courseName?: string;
  location?: string;
  stage?: string;
  intent?: string;
  source?: string;
  medium?: string;
  campaign?: string;
  campaignId?: string;
  adsetId?: string;
  adId?: string;
};

export type AdActivationConsent = {
  advertising: boolean | null;
  personalization: boolean | null;
  marketing: boolean | null;
  blockAdExports: boolean;
};

export type AdActivationEligibility = {
  eligible: boolean;
  reason:
    | "eligible"
    | "advertising_not_granted"
    | "personalization_not_granted"
    | "marketing_not_granted"
    | "ad_exports_blocked";
};

export type AdActivationDelivery = {
  id: string;
  organizationId: string;
  destinationId: string;
  audienceId: string;
  personId: string;
  leadId: string | null;
  action: AdActivationAction;
  safeMetadata: AdActivationSafeMetadata;
};

export type AdActivationProviderResult =
  | {
      status: "delivered";
      providerRequestId?: string;
      providerResponseCode?: string;
    }
  | {
      status: "retry";
      errorCode: string;
      errorMessage: string;
    }
  | {
      status: "skipped";
      reason: string;
    }
  | {
      status: "failed";
      errorCode: string;
      errorMessage: string;
    };

export type AdActivationProviderAdapter = {
  platform: AdActivationPlatform;
  addMember(input: {
    delivery: AdActivationDelivery;
    identifiers: AdActivationIdentifiers;
  }): Promise<AdActivationProviderResult>;
  removeMember(input: {
    delivery: AdActivationDelivery;
    identifiers: AdActivationIdentifiers;
  }): Promise<AdActivationProviderResult>;
};
