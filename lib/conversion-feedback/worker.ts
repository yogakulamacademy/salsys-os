import "server-only";

import {
  createAdminClient,
} from "@/lib/supabase/admin";

import type {
  ClaimedConversionFeedbackDelivery,
  ConversionFeedbackMatchContext,
  ConversionFeedbackProviderAdapter,
  ConversionFeedbackProviderResult,
  ConversionFeedbackWorkerReport,
  JsonObject,
  JsonValue,
  RunConversionFeedbackWorkerOptions,
} from "@/lib/conversion-feedback/types";


const DEFAULT_LIMIT =
  25;

const DEFAULT_LEASE_SECONDS =
  300;


/*
 * Attempt metadata is operational telemetry only.
 *
 * Match identifiers, credentials, headers and provider request
 * bodies must never be persisted in conversion feedback
 * deliveries / attempts.
 */
const SENSITIVE_METADATA_KEY =
  /(?:email|phone|token|secret|password|authorization|cookie|user[_-]?data|client[_-]?user[_-]?agent|user[_-]?agent|ip[_-]?address|fbc|fbp|gclid|gbraid|wbraid|fbclid|identifier|payload|request[_-]?body|response[_-]?body|headers)/i;

/*
 * Only operational, non-user metadata is allowed to retain
 * its value in delivery-attempt telemetry.
 *
 * Unknown adapter metadata keys default to REDACTED.
 */
const SAFE_METADATA_KEY =
  /^(?:provider|destination_kind|conversion_type|authority_level|attempt_number|provider_call_state|consent_result|operation|endpoint_kind|validate_only|provider_status|provider_error_category|retry_source)$/;


function recordValue(
  value: unknown,
): Record<string, unknown> | null {
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value)
  ) {
    return null;
  }

  return value as
    Record<string, unknown>;
}


function stringValue(
  value: unknown,
): string | null {
  return typeof value === "string"
    ? value
    : null;
}


function nullableBoolean(
  value: unknown,
): boolean | null {
  return typeof value === "boolean"
    ? value
    : null;
}


function numberValue(
  value: unknown,
): number | null {
  if (
    typeof value === "number" &&
    Number.isFinite(value)
  ) {
    return value;
  }

  if (
    typeof value === "string" &&
    value.trim() !== ""
  ) {
    const parsed =
      Number(value);

    return Number.isFinite(parsed)
      ? parsed
      : null;
  }

  return null;
}


function stringArray(
  value: unknown,
): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .filter(
      (entry):
        entry is string =>
          typeof entry === "string",
    )
    .map(
      (entry) =>
        entry.trim(),
    )
    .filter(Boolean)
    .slice(0, 20);
}


function jsonObject(
  value: unknown,
): JsonObject {
  const record =
    recordValue(value);

  if (!record) {
    return {};
  }

  return record as
    unknown as JsonObject;
}


function safeString(
  value: string,
  maxLength = 1000,
) {
  return value
    .replace(
      /Bearer\s+[A-Za-z0-9._~+/=-]+/gi,
      "Bearer [REDACTED]",
    )
    .replace(
      /((?:access_token|token|secret|password)=)([^&\s]+)/gi,
      "$1[REDACTED]",
    )
    .replace(
      /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi,
      "[REDACTED_EMAIL]",
    )
    .replace(
      /\+?\d[\d\s().-]{7,}\d/g,
      "[REDACTED_PHONE]",
    )
    .replace(
      /fb\.1\.\d+\.[A-Za-z0-9._-]+/g,
      "[REDACTED_META_ID]",
    )
    .slice(
      0,
      maxLength,
    );
}

function sanitizeMetadataValue(
  value: JsonValue,
  depth = 0,
): JsonValue {
  if (depth >= 4) {
    return "[TRUNCATED]";
  }

  if (value === null) {
    return null;
  }

  if (
    typeof value === "boolean" ||
    typeof value === "number"
  ) {
    return value;
  }

  if (typeof value === "string") {
    return safeString(
      value,
      500,
    );
  }

  if (Array.isArray(value)) {
    return value
      .slice(0, 25)
      .map(
        (entry) =>
          sanitizeMetadataValue(
            entry,
            depth + 1,
          ),
      );
  }

  const output: JsonObject =
    {};

  for (
    const [key, entry]
    of Object.entries(value)
      .slice(0, 50)
  ) {
    if (
      SENSITIVE_METADATA_KEY.test(
        key,
      )
    ) {
      output[key] =
        "[REDACTED]";

      continue;
    }

    if (
      !SAFE_METADATA_KEY.test(
        key,
      )
    ) {
      output[key] =
        "[REDACTED]";

      continue;
    }

    output[key] =
      sanitizeMetadataValue(
        entry,
        depth + 1,
      );
  }

  return output;
}


function sanitizeMetadata(
  value:
    | JsonObject
    | undefined,
): JsonObject {
  if (!value) {
    return {};
  }

  const sanitized =
    sanitizeMetadataValue(
      value,
    );

  return (
    sanitized &&
    typeof sanitized === "object" &&
    !Array.isArray(sanitized)
  )
    ? sanitized
    : {};
}


function errorMessage(
  error: unknown,
) {
  if (error instanceof Error) {
    return safeString(
      error.message ||
        "Unknown conversion feedback error.",
    );
  }

  if (typeof error === "string") {
    return safeString(error);
  }

  return "Unknown conversion feedback error.";
}


function claimedDelivery(
  raw: unknown,
): ClaimedConversionFeedbackDelivery {
  const row =
    recordValue(raw);

  if (!row) {
    throw new Error(
      "Conversion feedback claim returned an invalid row.",
    );
  }

  const requiredStrings = {
    deliveryId:
      stringValue(row.delivery_id),

    leaseToken:
      stringValue(row.lease_token),

    organizationId:
      stringValue(row.organization_id),

    routeId:
      stringValue(row.route_id),

    leadId:
      stringValue(row.lead_id),

    conversionFactKey:
      stringValue(
        row.conversion_fact_key,
      ),

    conversionType:
      stringValue(row.conversion_type),

    authorityLevel:
      stringValue(row.authority_level),

    sourceTable:
      stringValue(row.source_table),

    sourceId:
      stringValue(row.source_id),

    conversionAt:
      stringValue(row.conversion_at),

    connectionId:
      stringValue(row.connection_id),

    integrationAssetId:
      stringValue(
        row.integration_asset_id,
      ),

    provider:
      stringValue(row.provider),

    destinationKind:
      stringValue(
        row.destination_kind,
      ),
  };

  for (
    const [name, value]
    of Object.entries(
      requiredStrings,
    )
  ) {
    if (!value) {
      throw new Error(
        `Conversion feedback claim is missing ${name}.`,
      );
    }
  }

  const attemptNumber =
    numberValue(
      row.attempt_number,
    );

  if (
    !attemptNumber ||
    attemptNumber < 1
  ) {
    throw new Error(
      "Conversion feedback claim has an invalid attempt number.",
    );
  }

  return {
    deliveryId:
      requiredStrings.deliveryId!,

    leaseToken:
      requiredStrings.leaseToken!,

    attemptNumber,

    organizationId:
      requiredStrings.organizationId!,

    routeId:
      requiredStrings.routeId!,

    leadId:
      requiredStrings.leadId!,

    conversionFactKey:
      requiredStrings
        .conversionFactKey!,

    conversionType:
      requiredStrings
        .conversionType!,

    authorityLevel:
      requiredStrings
        .authorityLevel!,

    sourceTable:
      requiredStrings.sourceTable!,

    sourceId:
      requiredStrings.sourceId!,

    conversionAt:
      requiredStrings.conversionAt!,

    amount:
      typeof row.amount === "number" ||
      typeof row.amount === "string"
        ? row.amount
        : null,

    currency:
      stringValue(row.currency),

    paymentKind:
      stringValue(row.payment_kind),

    connectionId:
      requiredStrings.connectionId!,

    integrationAssetId:
      requiredStrings
        .integrationAssetId!,

    provider:
      requiredStrings.provider!,

    destinationKind:
      requiredStrings
        .destinationKind!,

    destinationExternalId:
      stringValue(
        row.destination_external_id,
      ),

    destinationEventName:
      stringValue(
        row.destination_event_name,
      ),

    providerConfigSnapshot:
      jsonObject(
        row.provider_config_snapshot,
      ),
  };
}


function matchContext(
  raw: unknown,
): ConversionFeedbackMatchContext {
  const root =
    recordValue(raw);

  if (!root) {
    throw new Error(
      "Conversion feedback match resolver returned invalid data.",
    );
  }

  const consent =
    recordValue(root.consent) ??
    {};

  const match =
    recordValue(root.match) ??
    {};

  const organizationId =
    stringValue(
      root.organization_id,
    );

  const leadId =
    stringValue(root.lead_id);

  const conversionAt =
    stringValue(root.conversion_at);

  if (
    !organizationId ||
    !leadId ||
    !conversionAt
  ) {
    throw new Error(
      "Conversion feedback match resolver returned incomplete identity context.",
    );
  }

  const eligibilityReasonRaw =
    stringValue(
      root.eligibility_reason,
    );

  const eligibilityReason =
    eligibilityReasonRaw ===
      "explicitly_granted" ||
    eligibilityReasonRaw ===
      "explicitly_denied"
      ? eligibilityReasonRaw
      : "unknown";

  return {
    organizationId,
    leadId,
    conversionAt,

    eligibleForAdUserData:
      root.eligible_for_ad_user_data ===
      true,

    eligibilityReason,

    consent: {
      analytics:
        nullableBoolean(
          consent.analytics,
        ),

      adUserData:
        nullableBoolean(
          consent.ad_user_data,
        ),

      adPersonalization:
        nullableBoolean(
          consent.ad_personalization,
        ),

      marketing:
        nullableBoolean(
          consent.marketing,
        ),

      adUserDataEventId:
        stringValue(
          consent.ad_user_data_event_id,
        ),

      adUserDataSourceEventId:
        stringValue(
          consent
            .ad_user_data_source_event_id,
        ),

      adUserDataOccurredAt:
        stringValue(
          consent
            .ad_user_data_occurred_at,
        ),
    },

    match: {
      emails:
        stringArray(match.emails),

      phones:
        stringArray(match.phones),

      gclid:
        stringValue(match.gclid),

      gbraid:
        stringValue(match.gbraid),

      wbraid:
        stringValue(match.wbraid),

      fbclid:
        stringValue(match.fbclid),

      fbc:
        stringValue(match.fbc),

      fbp:
        stringValue(match.fbp),
    },
  };
}


function updatedResult(
  value: unknown,
) {
  const result =
    recordValue(value);

  return result?.updated === true;
}


function adapterForDelivery(
  adapters:
    readonly ConversionFeedbackProviderAdapter[],
  delivery:
    ClaimedConversionFeedbackDelivery,
) {
  return adapters.find(
    (adapter) =>
      adapter.provider ===
        delivery.provider &&
      adapter.supports(delivery),
  );
}


function baseAttemptMetadata(
  delivery:
    ClaimedConversionFeedbackDelivery,
  providerCallState: string,
): JsonObject {
  return {
    provider:
      delivery.provider,

    destination_kind:
      delivery.destinationKind,

    conversion_type:
      delivery.conversionType,

    authority_level:
      delivery.authorityLevel,

    attempt_number:
      delivery.attemptNumber,

    provider_call_state:
      providerCallState,
  };
}


async function resolveMatchContext(
  admin:
    ReturnType<
      typeof createAdminClient
    >,
  delivery:
    ClaimedConversionFeedbackDelivery,
) {
  const {
    data,
    error,
  } =
    await admin.rpc(
      "resolve_conversion_feedback_match_context",
      {
        p_organization_id:
          delivery.organizationId,

        p_lead_id:
          delivery.leadId,

        p_conversion_at:
          delivery.conversionAt,
      },
    );

  if (error) {
    throw new Error(
      error.message,
    );
  }

  const resolved =
    matchContext(data);

  if (
    resolved.organizationId !==
      delivery.organizationId ||
    resolved.leadId !==
      delivery.leadId
  ) {
    throw new Error(
      "Conversion feedback match context does not match the claimed delivery.",
    );
  }

  return resolved;
}


async function skipDelivery(
  admin:
    ReturnType<
      typeof createAdminClient
    >,
  delivery:
    ClaimedConversionFeedbackDelivery,
  reason: string,
  metadata: JsonObject,
) {
  const {
    data,
    error,
  } =
    await admin.rpc(
      "skip_conversion_feedback_delivery",
      {
        p_organization_id:
          delivery.organizationId,

        p_delivery_id:
          delivery.deliveryId,

        p_lease_token:
          delivery.leaseToken,

        p_reason:
          safeString(
            reason,
            500,
          ),

        p_metadata:
          sanitizeMetadata(
            metadata,
          ),
      },
    );

  if (error) {
    throw new Error(
      error.message,
    );
  }

  return updatedResult(data);
}


async function completeDelivery(
  admin:
    ReturnType<
      typeof createAdminClient
    >,
  delivery:
    ClaimedConversionFeedbackDelivery,
  result:
    Extract<
      ConversionFeedbackProviderResult,
      {
        outcome: "delivered";
      }
    >,
  durationMs: number,
) {
  const {
    data,
    error,
  } =
    await admin.rpc(
      "complete_conversion_feedback_delivery",
      {
        p_organization_id:
          delivery.organizationId,

        p_delivery_id:
          delivery.deliveryId,

        p_lease_token:
          delivery.leaseToken,

        p_provider_event_id:
          result.providerEventId ??
          null,

        p_http_status:
          result.httpStatus ??
          null,

        p_provider_request_id:
          result.providerRequestId ??
          null,

        p_provider_response_code:
          result.providerResponseCode ??
          null,

        p_request_metadata:
          sanitizeMetadata({
            ...baseAttemptMetadata(
              delivery,
              "completed",
            ),

            ...(
              result.requestMetadata ??
              {}
            ),
          }),

        p_response_metadata:
          sanitizeMetadata(
            result.responseMetadata,
          ),

        p_duration_ms:
          Math.max(
            0,
            Math.round(durationMs),
          ),
      },
    );

  if (error) {
    throw new Error(
      error.message,
    );
  }

  return updatedResult(data);
}


async function failDelivery(
  admin:
    ReturnType<
      typeof createAdminClient
    >,
  delivery:
    ClaimedConversionFeedbackDelivery,
  result: {
    retryable: boolean;
    errorMessage: string;

    errorCode?:
      | string
      | null;

    retryAfterSeconds?:
      | number
      | null;

    httpStatus?:
      | number
      | null;

    providerRequestId?:
      | string
      | null;

    providerResponseCode?:
      | string
      | null;

    requestMetadata?:
      JsonObject;

    responseMetadata?:
      JsonObject;
  },
  durationMs: number,
) {
  const {
    data,
    error,
  } =
    await admin.rpc(
      "fail_conversion_feedback_delivery",
      {
        p_organization_id:
          delivery.organizationId,

        p_delivery_id:
          delivery.deliveryId,

        p_lease_token:
          delivery.leaseToken,

        p_error_message:
          safeString(
            result.errorMessage,
            1000,
          ),

        p_retryable:
          result.retryable,

        p_error_code:
          result.errorCode ??
          null,

        p_retry_after_seconds:
          result.retryAfterSeconds ??
          null,

        p_http_status:
          result.httpStatus ??
          null,

        p_provider_request_id:
          result.providerRequestId ??
          null,

        p_provider_response_code:
          result.providerResponseCode ??
          null,

        p_request_metadata:
          sanitizeMetadata({
            ...baseAttemptMetadata(
              delivery,
              "failed",
            ),

            ...(
              result.requestMetadata ??
              {}
            ),
          }),

        p_response_metadata:
          sanitizeMetadata(
            result.responseMetadata,
          ),

        p_duration_ms:
          Math.max(
            0,
            Math.round(durationMs),
          ),
      },
    );

  if (error) {
    throw new Error(
      error.message,
    );
  }

  return updatedResult(data);
}


async function finalizeProviderResult(
  admin:
    ReturnType<
      typeof createAdminClient
    >,
  delivery:
    ClaimedConversionFeedbackDelivery,
  result:
    ConversionFeedbackProviderResult,
  durationMs: number,
): Promise<
  | "delivered"
  | "skipped"
  | "retryable_failed"
  | "permanent_failed"
  | "lease_lost"
> {
  if (result.outcome === "delivered") {
    const updated =
      await completeDelivery(
        admin,
        delivery,
        result,
        durationMs,
      );

    return updated
      ? "delivered"
      : "lease_lost";
  }

  if (result.outcome === "skipped") {
    const updated =
      await skipDelivery(
        admin,
        delivery,
        result.reason,
        {
          ...baseAttemptMetadata(
            delivery,
            "not_called",
          ),

          ...(
            result.metadata ??
            {}
          ),
        },
      );

    return updated
      ? "skipped"
      : "lease_lost";
  }

  const updated =
    await failDelivery(
      admin,
      delivery,
      result,
      durationMs,
    );

  if (!updated) {
    return "lease_lost";
  }

  return result.retryable
    ? "retryable_failed"
    : "permanent_failed";
}


function incrementReport(
  report:
    ConversionFeedbackWorkerReport,
  outcome:
    | "delivered"
    | "skipped"
    | "retryable_failed"
    | "permanent_failed"
    | "lease_lost",
) {
  if (outcome === "delivered") {
    report.delivered += 1;
  } else if (
    outcome === "skipped"
  ) {
    report.skipped += 1;
  } else if (
    outcome ===
    "retryable_failed"
  ) {
    report.retryableFailed += 1;
  } else if (
    outcome ===
    "permanent_failed"
  ) {
    report.permanentFailed += 1;
  } else {
    report.leaseLost += 1;
  }
}


export async function runConversionFeedbackWorker(
  options:
    RunConversionFeedbackWorkerOptions,
): Promise<
  ConversionFeedbackWorkerReport
> {
  const organizationId =
    options.organizationId?.trim();

  if (!organizationId) {
    throw new Error(
      "organizationId is required.",
    );
  }

  const limit =
    options.limit ??
    DEFAULT_LIMIT;

  const leaseSeconds =
    options.leaseSeconds ??
    DEFAULT_LEASE_SECONDS;

  if (
    !Number.isInteger(limit) ||
    limit < 1 ||
    limit > 100
  ) {
    throw new Error(
      "limit must be an integer between 1 and 100.",
    );
  }

  if (
    !Number.isInteger(
      leaseSeconds,
    ) ||
    leaseSeconds < 30 ||
    leaseSeconds > 3600
  ) {
    throw new Error(
      "leaseSeconds must be an integer between 30 and 3600.",
    );
  }

  const admin =
    createAdminClient();

  const {
    data: rawClaims,
    error: claimError,
  } =
    await admin.rpc(
      "claim_conversion_feedback_deliveries",
      {
        p_organization_id:
          organizationId,

        p_limit:
          limit,

        p_lease_seconds:
          leaseSeconds,
      },
    );

  if (claimError) {
    throw new Error(
      claimError.message,
    );
  }

  const claims =
    Array.isArray(rawClaims)
      ? rawClaims.map(
          claimedDelivery,
        )
      : [];

  const report:
    ConversionFeedbackWorkerReport = {
      organizationId,

      claimed:
        claims.length,

      delivered:
        0,

      skipped:
        0,

      retryableFailed:
        0,

      permanentFailed:
        0,

      leaseLost:
        0,

      finalizationErrors:
        0,
    };

  for (const delivery of claims) {
    /*
     * Defensive tenant assertion on the RPC response.
     */
    if (
      delivery.organizationId !==
      organizationId
    ) {
      throw new Error(
        "Claimed conversion feedback delivery crossed the requested organization boundary.",
      );
    }

    let resolved:
      ConversionFeedbackMatchContext;

    /*
     * Match/consent resolution happens before any provider
     * request. Failure here is retryable because no external
     * side effect has occurred.
     */
    try {
      resolved =
        await resolveMatchContext(
          admin,
          delivery,
        );
    } catch (error) {
      const startedAt =
        Date.now();

      try {
        const finalized =
          await failDelivery(
            admin,
            delivery,
            {
              retryable:
                true,

              errorMessage:
                errorMessage(error),

              errorCode:
                "match_context_resolution_failed",

              requestMetadata:
                baseAttemptMetadata(
                  delivery,
                  "not_called",
                ),
            },
            Date.now() -
              startedAt,
          );

        if (finalized) {
          report.retryableFailed +=
            1;
        } else {
          report.leaseLost +=
            1;
        }
      } catch {
        /*
         * Do not attempt another state transition after a
         * finalization failure. The lease recovery RPC is the
         * authority for uncertain worker state.
         */
        report.finalizationErrors +=
          1;
      }

      continue;
    }


    /*
     * Privacy boundary.
     *
     * Analytics consent alone is not enough.
     * Unknown and explicitly denied ad_user_data both mean:
     *
     *   NO provider request.
     *
     * A later consent grant cannot make this historical
     * conversion eligible because the resolver evaluates
     * consent at conversion_at.
     */
    if (
      !resolved
        .eligibleForAdUserData
    ) {
      try {
        const finalized =
          await skipDelivery(
            admin,
            delivery,
            resolved
              .eligibilityReason ===
                "explicitly_denied"
              ? "ad_user_data_explicitly_denied"
              : "ad_user_data_consent_unknown",
            {
              ...baseAttemptMetadata(
                delivery,
                "not_called",
              ),

              consent_result:
                resolved
                  .eligibilityReason,
            },
          );

        if (finalized) {
          report.skipped += 1;
        } else {
          report.leaseLost +=
            1;
        }
      } catch {
        report.finalizationErrors +=
          1;
      }

      continue;
    }


    const adapter =
      adapterForDelivery(
        options.adapters,
        delivery,
      );

    /*
     * An active route without a deployed provider adapter is a
     * configuration/runtime incompatibility, not a retryable
     * provider outage.
     */
    if (!adapter) {
      try {
        const finalized =
          await failDelivery(
            admin,
            delivery,
            {
              retryable:
                false,

              errorMessage:
                `No conversion feedback adapter supports provider=${delivery.provider} destination=${delivery.destinationKind}.`,

              errorCode:
                "unsupported_provider_adapter",

              requestMetadata:
                baseAttemptMetadata(
                  delivery,
                  "not_called",
                ),
            },
            0,
          );

        if (finalized) {
          report.permanentFailed +=
            1;
        } else {
          report.leaseLost +=
            1;
        }
      } catch {
        report.finalizationErrors +=
          1;
      }

      continue;
    }


    const startedAt =
      Date.now();

    let providerResult:
      ConversionFeedbackProviderResult;

    try {
      providerResult =
        await adapter.deliver({
          delivery,
          matchContext:
            resolved,
        });
    } catch (error) {
      /*
       * An adapter exception can mean the provider-call state is
       * uncertain. D4 adapters therefore must use stable provider
       * deduplication/idempotency identifiers.
       */
      providerResult = {
        outcome:
          "failed",

        retryable:
          true,

        errorMessage:
          errorMessage(error),

        errorCode:
          "provider_adapter_exception",

        requestMetadata: {
          provider_call_state:
            "unknown",
        },
      };
    }

    const durationMs =
      Date.now() -
      startedAt;

    try {
      const outcome =
        await finalizeProviderResult(
          admin,
          delivery,
          providerResult,
          durationMs,
        );

      incrementReport(
        report,
        outcome,
      );
    } catch {
      /*
       * Do not issue another finalizer after a completion/failure
       * RPC itself errors. The provider may already have accepted
       * the event or the database RPC may have committed.
       *
       * Let the lease expire and allow stale-lease recovery to
       * preserve immutable attempt semantics.
       */
      report.finalizationErrors +=
        1;
    }
  }

  return report;
}
