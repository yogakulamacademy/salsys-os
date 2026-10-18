import "server-only";

import {
  createHash,
} from "crypto";

import {
  createAdminClient,
} from "@/lib/supabase/admin";

import {
  getMetaAccessTokenForConnection,
} from "@/lib/integrations/meta-connection";

import {
  metaGraphVersion,
} from "@/lib/integrations/meta";

import type {
  ClaimedConversionFeedbackDelivery,
  ConversionFeedbackProviderAdapter,
  ConversionFeedbackProviderResult,
  JsonObject,
} from "@/lib/conversion-feedback/types";


type MetaFeedbackAssetRow = {
  id: string;
  organization_id: string;
  connection_id: string;
  asset_type: string;
  external_id: string;
  status: string;
  is_selected: boolean;
};


type MetaFeedbackConnectionRow = {
  id: string;
  organization_id: string;
  provider: string;
  status: string;
};


type MetaConversionsApiError = {
  message?: string;
  type?: string;
  code?: number;
  error_subcode?: number;
  is_transient?: boolean;
  fbtrace_id?: string;
};


type MetaConversionsApiResponse = {
  events_received?: number;
  messages?: unknown[];
  fbtrace_id?: string;
  error?: MetaConversionsApiError;
};


type MetaActionSource =
  | "website"
  | "app"
  | "physical_store"
  | "chat"
  | "phone_call"
  | "email"
  | "other";


const META_ACTION_SOURCES =
  new Set<MetaActionSource>([
    "website",
    "app",
    "physical_store",
    "chat",
    "phone_call",
    "email",
    "other",
  ]);


function stringValue(
  value: unknown,
): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed =
    value.trim();

  return trimmed ||
    null;
}


function booleanValue(
  value: unknown,
): boolean | null {
  return typeof value === "boolean"
    ? value
    : null;
}


function sha256Hex(
  value: string,
) {
  return createHash(
    "sha256",
  )
    .update(
      value,
      "utf8",
    )
    .digest(
      "hex",
    );
}


function normalizeMetaEmail(
  input: string,
) {
  const value =
    input
      .trim()
      .toLowerCase()
      .replace(
        /\s+/g,
        "",
      );

  const at =
    value.lastIndexOf("@");

  if (
    at <= 0 ||
    at === value.length - 1
  ) {
    return null;
  }

  const domain =
    value.slice(
      at + 1,
    );

  return domain.includes(".")
    ? value
    : null;
}


function normalizeMetaPhone(
  input: string,
) {
  const value =
    input.trim();

  /*
   * Do not infer country codes.
   *
   * The CRM must already hold an explicitly international number.
   * Meta receives the normalized digits only, after hashing.
   */
  if (
    !/^\+[\d\s().-]+$/.test(
      value,
    )
  ) {
    return null;
  }

  const digits =
    value.replace(
      /\D/g,
      "",
    );

  return /^\d{7,15}$/.test(
    digits,
  )
    ? digits
    : null;
}


function hashedValues(
  values: readonly string[],
  normalizer:
    (
      value: string,
    ) => string | null,
) {
  const output:
    string[] = [];

  const seen =
    new Set<string>();

  for (const value of values) {
    const normalized =
      normalizer(value);

    if (!normalized) {
      continue;
    }

    const hashed =
      sha256Hex(
        normalized,
      );

    if (seen.has(hashed)) {
      continue;
    }

    seen.add(hashed);
    output.push(hashed);

    if (output.length >= 5) {
      break;
    }
  }

  return output;
}


function normalizeDatasetId(
  value:
    | string
    | null
    | undefined,
) {
  if (!value) {
    return null;
  }

  const trimmed =
    value.trim();

  const match =
    trimmed.match(
      /(?:^|\/)(\d+)$/,
    );

  return match?.[1] ??
    null;
}


function normalizeEventName(
  value:
    | string
    | null
    | undefined,
) {
  if (!value) {
    return null;
  }

  const trimmed =
    value.trim();

  return /^[A-Za-z0-9 _.-]{1,100}$/.test(
    trimmed,
  )
    ? trimmed
    : null;
}


function numericConversionValue(
  value:
    | number
    | string
    | null,
) {
  if (value === null) {
    return null;
  }

  const parsed =
    typeof value === "number"
      ? value
      : Number(value);

  return Number.isFinite(parsed)
    ? parsed
    : null;
}


function conversionUnixTime(
  value: string,
) {
  const milliseconds =
    Date.parse(value);

  if (!Number.isFinite(milliseconds)) {
    return null;
  }

  return Math.floor(
    milliseconds /
      1000,
  );
}


function providerConfig(
  delivery:
    ClaimedConversionFeedbackDelivery,
) {
  const raw =
    delivery
      .providerConfigSnapshot;

  const actionSourceRaw =
    stringValue(
      raw[
        "action_source"
      ],
    )?.toLowerCase();

  const actionSource:
    MetaActionSource =
    actionSourceRaw &&
    META_ACTION_SOURCES.has(
      actionSourceRaw as
        MetaActionSource,
    )
      ? actionSourceRaw as
          MetaActionSource
      : "other";

  return {
    actionSource,

    eventSourceUrl:
      stringValue(
        raw[
          "event_source_url"
        ],
      ),

    testEventCode:
      stringValue(
        raw[
          "test_event_code"
        ],
      ),

    validateOnly:
      booleanValue(
        raw[
          "validate_only"
        ],
      ) === true,
  };
}


function retryAfterSeconds(
  response: Response,
) {
  const raw =
    response.headers.get(
      "retry-after",
    );

  if (!raw) {
    return null;
  }

  const numeric =
    Number(raw);

  if (
    Number.isFinite(numeric) &&
    numeric >= 0
  ) {
    return Math.min(
      86400,
      Math.round(numeric),
    );
  }

  const date =
    Date.parse(raw);

  if (!Number.isFinite(date)) {
    return null;
  }

  return Math.max(
    0,
    Math.min(
      86400,
      Math.round(
        (
          date -
          Date.now()
        ) /
        1000,
      ),
    ),
  );
}


function retryableHttpStatus(
  status: number,
) {
  return (
    status === 408 ||
    status === 429 ||
    status >= 500
  );
}


function safeMetaCode(
  value: unknown,
) {
  if (
    typeof value === "number" &&
    Number.isFinite(value)
  ) {
    return String(value);
  }

  const text =
    stringValue(value);

  return text &&
    /^[A-Za-z0-9_.:-]{1,100}$/.test(
      text,
    )
    ? text
    : null;
}


async function parseMetaResponse(
  response: Response,
): Promise<MetaConversionsApiResponse> {
  const text =
    await response.text();

  if (!text) {
    return {};
  }

  try {
    const parsed:
      unknown =
        JSON.parse(text);

    if (
      parsed &&
      typeof parsed === "object" &&
      !Array.isArray(parsed)
    ) {
      return parsed as
        MetaConversionsApiResponse;
    }
  } catch {
    // handled by empty response below
  }

  return {};
}


async function loadMetaDeliveryContext(
  delivery:
    ClaimedConversionFeedbackDelivery,
) {
  const admin =
    createAdminClient();

  const {
    data: rawAsset,
    error: assetError,
  } =
    await admin
      .from(
        "integration_assets",
      )
      .select(
        [
          "id",
          "organization_id",
          "connection_id",
          "asset_type",
          "external_id",
          "status",
          "is_selected",
        ].join(","),
      )
      .eq(
        "id",
        delivery
          .integrationAssetId,
      )
      .eq(
        "organization_id",
        delivery
          .organizationId,
      )
      .eq(
        "connection_id",
        delivery
          .connectionId,
      )
      .maybeSingle();

  if (
    assetError ||
    !rawAsset
  ) {
    return {
      ok:
        false as const,

      result: {
        outcome:
          "failed" as const,

        retryable:
          false,

        errorMessage:
          "Meta conversion feedback asset is unavailable.",

        errorCode:
          "meta_feedback_asset_missing",

        requestMetadata: {
          provider_call_state:
            "not_called",
        },
      },
    };
  }

  const asset =
    rawAsset as unknown as
      MetaFeedbackAssetRow;

  if (
    asset.organization_id !==
      delivery.organizationId ||
    asset.connection_id !==
      delivery.connectionId ||
    asset.asset_type !==
      "meta_ad_account" ||
    asset.is_selected !== true ||
    asset.status ===
      "unavailable"
  ) {
    return {
      ok:
        false as const,

      result: {
        outcome:
          "failed" as const,

        retryable:
          false,

        errorMessage:
          "Meta conversion feedback asset is not an active selected Meta ad account.",

        errorCode:
          "meta_feedback_asset_invalid",

        requestMetadata: {
          provider_call_state:
            "not_called",
        },
      },
    };
  }

  const {
    data: rawConnection,
    error: connectionError,
  } =
    await admin
      .from(
        "integration_connections",
      )
      .select(
        [
          "id",
          "organization_id",
          "provider",
          "status",
        ].join(","),
      )
      .eq(
        "id",
        delivery.connectionId,
      )
      .eq(
        "organization_id",
        delivery
          .organizationId,
      )
      .maybeSingle();

  if (
    connectionError ||
    !rawConnection
  ) {
    return {
      ok:
        false as const,

      result: {
        outcome:
          "failed" as const,

        retryable:
          false,

        errorMessage:
          "Meta integration connection is unavailable.",

        errorCode:
          "meta_connection_missing",

        requestMetadata: {
          provider_call_state:
            "not_called",
        },
      },
    };
  }

  const connection =
    rawConnection as unknown as
      MetaFeedbackConnectionRow;

  if (
    connection.organization_id !==
      delivery.organizationId ||
    connection.provider !==
      "meta" ||
    connection.status !==
      "connected"
  ) {
    return {
      ok:
        false as const,

      result: {
        outcome:
          "failed" as const,

        retryable:
          false,

        errorMessage:
          "Meta integration connection is not connected for this organization.",

        errorCode:
          "meta_connection_invalid",

        requestMetadata: {
          provider_call_state:
            "not_called",
        },
      },
    };
  }

  return {
    ok:
      true as const,
  };
}


function buildMetaRequest(
  delivery:
    ClaimedConversionFeedbackDelivery,
  context: {
    emails: string[];
    phones: string[];
    fbc:
      | string
      | null;
    fbp:
      | string
      | null;
  },
) {
  const datasetId =
    normalizeDatasetId(
      delivery
        .destinationExternalId,
    );

  if (!datasetId) {
    return {
      ok:
        false as const,

      result: {
        outcome:
          "failed" as const,

        retryable:
          false,

        errorMessage:
          "Meta dataset destination ID is invalid.",

        errorCode:
          "meta_dataset_id_invalid",

        requestMetadata: {
          provider_call_state:
            "not_called",
        },
      },
    };
  }

  const eventName =
    normalizeEventName(
      delivery
        .destinationEventName,
    );

  if (!eventName) {
    return {
      ok:
        false as const,

      result: {
        outcome:
          "failed" as const,

        retryable:
          false,

        errorMessage:
          "Meta conversion feedback event name is invalid.",

        errorCode:
          "meta_event_name_invalid",

        requestMetadata: {
          provider_call_state:
            "not_called",
        },
      },
    };
  }

  const eventTime =
    conversionUnixTime(
      delivery.conversionAt,
    );

  if (!eventTime) {
    return {
      ok:
        false as const,

      result: {
        outcome:
          "failed" as const,

        retryable:
          false,

        errorMessage:
          "Meta conversion timestamp is invalid.",

        errorCode:
          "meta_conversion_time_invalid",

        requestMetadata: {
          provider_call_state:
            "not_called",
        },
      },
    };
  }

  const em =
    hashedValues(
      context.emails,
      normalizeMetaEmail,
    );

  const ph =
    hashedValues(
      context.phones,
      normalizeMetaPhone,
    );

  const userData: {
    em?: string[];
    ph?: string[];
    fbc?: string;
    fbp?: string;
  } = {};

  if (em.length > 0) {
    userData.em = em;
  }

  if (ph.length > 0) {
    userData.ph = ph;
  }

  if (context.fbc) {
    userData.fbc =
      context.fbc;
  }

  if (context.fbp) {
    userData.fbp =
      context.fbp;
  }

  if (
    Object.keys(userData)
      .length === 0
  ) {
    return {
      ok:
        false as const,

      result: {
        outcome:
          "skipped" as const,

        reason:
          "no_meta_match_identifiers",

        metadata: {
          provider_call_state:
            "not_called",
        },
      },
    };
  }

  const config =
    providerConfig(
      delivery,
    );

  const event: {
    event_name: string;
    event_time: number;
    event_id: string;
    action_source: MetaActionSource;
    user_data: typeof userData;
    event_source_url?: string;
    custom_data?: {
      value: number;
      currency: string;
    };
  } = {
    event_name:
      eventName,

    event_time:
      eventTime,

    event_id:
      delivery
        .conversionFactKey,

    action_source:
      config.actionSource,

    user_data:
      userData,
  };

  if (
    config.actionSource ===
      "website" &&
    config.eventSourceUrl
  ) {
    event.event_source_url =
      config.eventSourceUrl;
  }

  const amount =
    numericConversionValue(
      delivery.amount,
    );

  if (
    amount !== null &&
    delivery.currency &&
    /^[A-Z]{3}$/.test(
      delivery.currency,
    )
  ) {
    event.custom_data = {
      value:
        amount,

      currency:
        delivery.currency,
    };
  }

  const body: {
    data: typeof event[];
    test_event_code?: string;
  } = {
    data: [
      event,
    ],
  };

  if (
    config.testEventCode
  ) {
    body.test_event_code =
      config.testEventCode;
  }

  return {
    ok:
      true as const,

    datasetId,
    body,

    validateOnly:
      config.validateOnly,
  };
}


export const metaConversionsApiAdapter:
  ConversionFeedbackProviderAdapter = {
    provider:
      "meta",

    supports(
      delivery,
    ) {
      return (
        delivery.provider ===
          "meta" &&
        delivery.destinationKind ===
          "meta_dataset_event"
      );
    },

    async deliver({
      delivery,
      matchContext,
    }): Promise<
      ConversionFeedbackProviderResult
    > {
      const loaded =
        await loadMetaDeliveryContext(
          delivery,
        );

      if (!loaded.ok) {
        return loaded.result;
      }

      const request =
        buildMetaRequest(
          delivery,
          {
            emails:
              matchContext
                .match
                .emails,

            phones:
              matchContext
                .match
                .phones,

            fbc:
              matchContext
                .match
                .fbc,

            fbp:
              matchContext
                .match
                .fbp,
          },
        );

      if (!request.ok) {
        return request.result;
      }

      /*
       * Meta does not expose a provider-side validate-only switch
       * equivalent to Google Data Manager. A route marked
       * validate_only must therefore never create a real provider
       * side effect unless an explicit Meta test event code exists.
       */
      if (
        request.validateOnly &&
        !request.body
          .test_event_code
      ) {
        return {
          outcome:
            "skipped",

          reason:
            "meta_validate_only_requires_test_event_code",

          metadata: {
            provider_call_state:
              "not_called",

            validate_only:
              true,
          },
        };
      }

      let accessToken:
        string;

      try {
        accessToken =
          await getMetaAccessTokenForConnection(
            delivery.connectionId,
            {
              organizationId:
                delivery
                  .organizationId,
            },
          );
      } catch {
        return {
          outcome:
            "failed",

          retryable:
            true,

          errorMessage:
            "Unable to obtain an access token for the Meta integration connection.",

          errorCode:
            "meta_access_token_unavailable",

          requestMetadata: {
            operation:
              "dataset.events",

            endpoint_kind:
              "conversion",

            validate_only:
              request
                .validateOnly,

            provider_call_state:
              "not_called",
          },
        };
      }

      const version =
        metaGraphVersion();

      const endpoint =
        `https://graph.facebook.com/${version}/${request.datasetId}/events`;

      const startedAt =
        Date.now();

      let response:
        Response;

      try {
        response =
          await fetch(
            endpoint,
            {
              method:
                "POST",

              headers: {
                Authorization:
                  `Bearer ${accessToken}`,

                "Content-Type":
                  "application/json",
              },

              body:
                JSON.stringify(
                  request.body,
                ),

              cache:
                "no-store",
            },
          );
      } catch {
        return {
          outcome:
            "failed",

          retryable:
            true,

          errorMessage:
            "Meta Conversions API request could not be completed.",

          errorCode:
            "meta_network_error",

          requestMetadata: {
            operation:
              "dataset.events",

            endpoint_kind:
              "conversion",

            validate_only:
              request
                .validateOnly,

            provider_call_state:
              "called",
          },
        };
      }

      const payload =
        await parseMetaResponse(
          response,
        );

      const durationMs =
        Date.now() -
        startedAt;

      const traceId =
        stringValue(
          payload.fbtrace_id ??
          payload.error
            ?.fbtrace_id,
        );

      if (
        response.ok &&
        !payload.error
      ) {
        return {
          outcome:
            "delivered",

          httpStatus:
            response.status,

          providerRequestId:
            traceId,

          providerResponseCode:
            typeof payload
              .events_received ===
              "number"
              ? `events_received:${payload.events_received}`
              : "accepted",

          requestMetadata: {
            operation:
              "dataset.events",

            endpoint_kind:
              "conversion",

            validate_only:
              request
                .validateOnly,

            provider_call_state:
              "completed",
          },

          responseMetadata: {
            provider_status:
              "accepted",
          },
        };
      }

      const providerCode =
        safeMetaCode(
          payload.error?.code,
        );

      const retryable =
        payload.error
          ?.is_transient === true ||
        retryableHttpStatus(
          response.status,
        );

      const retryAfter =
        retryAfterSeconds(
          response,
        );

      return {
        outcome:
          "failed",

        retryable,

        errorMessage:
          payload.error
            ?.message?.trim() ||
          `Meta Conversions API returned HTTP ${response.status}.`,

        errorCode:
          providerCode
            ? `meta_${providerCode}`
            : "meta_provider_error",

        retryAfterSeconds:
          retryAfter,

        httpStatus:
          response.status,

        providerRequestId:
          traceId,

        providerResponseCode:
          providerCode,

        requestMetadata: {
          operation:
            "dataset.events",

          endpoint_kind:
            "conversion",

          validate_only:
            request
              .validateOnly,

          provider_call_state:
            "completed",
        },

        responseMetadata: {
          provider_status:
            response.ok
              ? "error"
              : "http_error",

          provider_error_category:
            retryable
              ? "retryable"
              : "permanent",

          retry_source:
            payload.error
              ?.is_transient === true
              ? "provider"
              : retryableHttpStatus(
                    response.status,
                  )
                ? "http_status"
                : "none",
        },
      };
    },
  };
