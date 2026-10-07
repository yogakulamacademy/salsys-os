import "server-only";

export type JsonPrimitive =
  | string
  | number
  | boolean
  | null;

export type JsonValue =
  | JsonPrimitive
  | JsonValue[]
  | JsonObject;

export type JsonObject = {
  [key: string]: JsonValue;
};

export type ClaimedConversionFeedbackDelivery = {
  deliveryId: string;
  leaseToken: string;
  attemptNumber: number;

  organizationId: string;
  routeId: string;
  leadId: string;

  conversionFactKey: string;
  conversionType: string;
  authorityLevel: string;

  sourceTable: string;
  sourceId: string;

  conversionAt: string;

  amount:
    | number
    | string
    | null;

  currency:
    | string
    | null;

  paymentKind:
    | string
    | null;

  connectionId: string;
  integrationAssetId: string;

  provider: string;

  destinationKind: string;

  destinationExternalId:
    | string
    | null;

  destinationEventName:
    | string
    | null;

  providerConfigSnapshot: JsonObject;
};

export type ConversionFeedbackConsentContext = {
  analytics:
    | boolean
    | null;

  adUserData:
    | boolean
    | null;

  adPersonalization:
    | boolean
    | null;

  marketing:
    | boolean
    | null;

  adUserDataEventId:
    | string
    | null;

  adUserDataSourceEventId:
    | string
    | null;

  adUserDataOccurredAt:
    | string
    | null;
};

export type ConversionFeedbackMatchSignals = {
  emails: string[];
  phones: string[];

  gclid:
    | string
    | null;

  gbraid:
    | string
    | null;

  wbraid:
    | string
    | null;

  fbclid:
    | string
    | null;

  fbc:
    | string
    | null;

  fbp:
    | string
    | null;
};

export type ConversionFeedbackMatchContext = {
  organizationId: string;
  leadId: string;
  conversionAt: string;

  eligibleForAdUserData: boolean;

  eligibilityReason:
    | "explicitly_granted"
    | "explicitly_denied"
    | "unknown";

  consent: ConversionFeedbackConsentContext;

  match: ConversionFeedbackMatchSignals;
};

export type ConversionFeedbackDeliveredResult = {
  outcome: "delivered";

  providerEventId?: string | null;

  httpStatus?: number | null;

  providerRequestId?: string | null;

  providerResponseCode?: string | null;

  requestMetadata?: JsonObject;

  responseMetadata?: JsonObject;
};

export type ConversionFeedbackFailedResult = {
  outcome: "failed";

  retryable: boolean;

  errorMessage: string;

  errorCode?: string | null;

  retryAfterSeconds?: number | null;

  httpStatus?: number | null;

  providerRequestId?: string | null;

  providerResponseCode?: string | null;

  requestMetadata?: JsonObject;

  responseMetadata?: JsonObject;
};

export type ConversionFeedbackSkippedResult = {
  outcome: "skipped";

  reason: string;

  metadata?: JsonObject;
};

export type ConversionFeedbackProviderResult =
  | ConversionFeedbackDeliveredResult
  | ConversionFeedbackFailedResult
  | ConversionFeedbackSkippedResult;

export type ConversionFeedbackProviderContext = {
  delivery: ClaimedConversionFeedbackDelivery;

  matchContext: ConversionFeedbackMatchContext;
};

export type ConversionFeedbackProviderAdapter = {
  provider: string;

  supports(
    delivery:
      ClaimedConversionFeedbackDelivery,
  ): boolean;

  deliver(
    context:
      ConversionFeedbackProviderContext,
  ): Promise<ConversionFeedbackProviderResult>;
};

export type RunConversionFeedbackWorkerOptions = {
  organizationId: string;

  limit?: number;

  leaseSeconds?: number;

  adapters:
    readonly ConversionFeedbackProviderAdapter[];
};

export type ConversionFeedbackWorkerReport = {
  organizationId: string;

  claimed: number;

  delivered: number;

  skipped: number;

  retryableFailed: number;

  permanentFailed: number;

  leaseLost: number;

  finalizationErrors: number;
};
