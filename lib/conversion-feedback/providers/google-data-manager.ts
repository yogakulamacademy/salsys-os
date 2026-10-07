import "server-only";

import {
  createHash,
} from "crypto";

import {
  createAdminClient,
} from "@/lib/supabase/admin";

import {
  getGoogleAccessTokenForConnection,
} from "@/lib/integrations/google-connection";

import type {
  ClaimedConversionFeedbackDelivery,
  ConversionFeedbackProviderAdapter,
  ConversionFeedbackProviderResult,
  JsonObject,
} from "@/lib/conversion-feedback/types";


export const GOOGLE_DATA_MANAGER_SCOPE =
  "https://www.googleapis.com/auth/datamanager";

export const GOOGLE_DATA_MANAGER_EVENTS_ENDPOINT =
  "https://datamanager.googleapis.com/v1/events:ingest";


type GoogleFeedbackAssetRow = {
  id: string;
  organization_id: string;
  connection_id: string;
  asset_type: string;
  external_id: string;
  status: string;
  is_selected: boolean;
};


type GoogleFeedbackConnectionRow = {
  id: string;
  organization_id: string;
  provider: string;
  status: string;
  scopes:
    | string[]
    | null;
};


type GoogleDataManagerResponse = {
  requestId?: string;
  fieldWarnings?: unknown[];

  error?: {
    code?: number;
    message?: string;
    status?: string;

    details?: unknown[];
  };
};


function objectValue(
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


function normalizeGoogleCustomerId(
  value:
    | string
    | null
    | undefined,
) {
  if (!value) {
    return null;
  }

  const digits =
    value.replace(
      /\D/g,
      "",
    );

  /*
   * Google Ads customer IDs are ten digits.
   *
   * Never guess or pad an invalid tenant account ID.
   */
  return /^\d{10}$/.test(
    digits,
  )
    ? digits
    : null;
}


function normalizeConversionActionId(
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
      /(?:^|\/conversionActions\/)(\d+)$/,
    );

  return match?.[1] ??
    null;
}


function normalizeGoogleEmail(
  input: string,
) {
  let value =
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

  let local =
    value.slice(
      0,
      at,
    );

  const domain =
    value.slice(
      at + 1,
    );

  if (
    domain === "gmail.com" ||
    domain === "googlemail.com"
  ) {
    const plus =
      local.indexOf("+");

    if (plus >= 0) {
      local =
        local.slice(
          0,
          plus,
        );
    }

    local =
      local.replace(
        /\./g,
        "",
      );
  }

  if (
    !local ||
    !domain.includes(".")
  ) {
    return null;
  }

  value =
    `${local}@${domain}`;

  return value;
}


function normalizeGooglePhone(
  input: string,
) {
  const value =
    input.trim();

  /*
   * Do not infer a country code.
   *
   * Only normalize punctuation when the stored number already
   * explicitly begins with "+".
   */
  if (
    !/^\+[\d\s().-]+$/.test(
      value,
    )
  ) {
    return null;
  }

  const compact =
    "+" +
    value
      .slice(1)
      .replace(
        /\D/g,
        "",
      );

  return /^\+\d{7,15}$/.test(
    compact,
  )
    ? compact
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


function userIdentifiers(
  emails:
    readonly string[],
  phones:
    readonly string[],
) {
  const identifiers:
    Array<
      | {
          emailAddress: string;
        }
      | {
          phoneNumber: string;
        }
    > = [];

  const seen =
    new Set<string>();

  for (const email of emails) {
    const normalized =
      normalizeGoogleEmail(
        email,
      );

    if (!normalized) {
      continue;
    }

    const hash =
      sha256Hex(
        normalized,
      );

    const key =
      `email:${hash}`;

    if (seen.has(key)) {
      continue;
    }

    seen.add(key);

    identifiers.push({
      emailAddress:
        hash,
    });

    if (
      identifiers.length >=
      10
    ) {
      return identifiers;
    }
  }

  for (const phone of phones) {
    const normalized =
      normalizeGooglePhone(
        phone,
      );

    if (!normalized) {
      continue;
    }

    const hash =
      sha256Hex(
        normalized,
      );

    const key =
      `phone:${hash}`;

    if (seen.has(key)) {
      continue;
    }

    seen.add(key);

    identifiers.push({
      phoneNumber:
        hash,
    });

    if (
      identifiers.length >=
      10
    ) {
      return identifiers;
    }
  }

  return identifiers;
}


function googleAdIdentifiers(
  match: {
    gclid:
      | string
      | null;

    gbraid:
      | string
      | null;

    wbraid:
      | string
      | null;
  },
) {
  /*
   * The resolver can independently return the latest value of
   * each identifier type. Do not combine identifiers that may
   * originate from different historical touchpoints.
   *
   * Prefer the strongest available single click identifier.
   */
  if (match.gclid) {
    return {
      gclid:
        match.gclid,
    };
  }

  if (match.gbraid) {
    return {
      gbraid:
        match.gbraid,
    };
  }

  if (match.wbraid) {
    return {
      wbraid:
        match.wbraid,
    };
  }

  return null;
}


function googleConsent(
  adPersonalization:
    | boolean
    | null,
) {
  const consent: {
    adUserData:
      "CONSENT_GRANTED";

    adPersonalization?:
      | "CONSENT_GRANTED"
      | "CONSENT_DENIED";
  } = {
    /*
     * The provider-neutral worker already hard-gates execution
     * on explicit ad_user_data grant at conversion time.
     */
    adUserData:
      "CONSENT_GRANTED",
  };

  if (
    adPersonalization === true
  ) {
    consent.adPersonalization =
      "CONSENT_GRANTED";
  } else if (
    adPersonalization === false
  ) {
    consent.adPersonalization =
      "CONSENT_DENIED";
  }

  return consent;
}


function providerConfig(
  delivery:
    ClaimedConversionFeedbackDelivery,
) {
  const raw =
    delivery
      .providerConfigSnapshot;

  const loginCustomerId =
    normalizeGoogleCustomerId(
      stringValue(
        raw[
          "login_customer_id"
        ],
      ),
    );

  const rawEventSource =
    stringValue(
      raw[
        "event_source"
      ],
    )?.toUpperCase();

  const eventSource:
    | "WEB"
    | "APP"
    | "IN_STORE"
    | "PHONE"
    | null =
    rawEventSource === "WEB"
      ? "WEB"
      : rawEventSource === "APP"
        ? "APP"
        : rawEventSource === "IN_STORE"
          ? "IN_STORE"
          : rawEventSource === "PHONE"
            ? "PHONE"
            : null;

  return {
    validateOnly:
      booleanValue(
        raw[
          "validate_only"
        ],
      ) === true,

    loginCustomerId,

    eventSource,
  };
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

  return Number.isFinite(
    parsed,
  )
    ? parsed
    : null;
}


function safeProviderCode(
  value: unknown,
) {
  const code =
    stringValue(value);

  if (
    !code ||
    !/^[A-Z0-9_.:-]{1,100}$/i.test(
      code,
    )
  ) {
    return null;
  }

  return code;
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


async function parseGoogleResponse(
  response: Response,
): Promise<
  GoogleDataManagerResponse
> {
  const text =
    await response.text();

  if (!text) {
    return {};
  }

  try {
    const parsed:
      unknown =
        JSON.parse(text);

    return (
      objectValue(parsed) ??
      {}
    ) as
      GoogleDataManagerResponse;
  } catch {
    return {};
  }
}


async function loadGoogleDeliveryContext(
  delivery:
    ClaimedConversionFeedbackDelivery,
) {
  const admin =
    createAdminClient();

  const {
    data:
      rawAsset,
    error:
      assetError,
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
          "Google conversion feedback asset is unavailable.",

        errorCode:
          "google_feedback_asset_missing",

        requestMetadata: {
          provider_call_state:
            "not_called",
        },
      },
    };
  }

  const asset =
    rawAsset as unknown as
      GoogleFeedbackAssetRow;

  if (
    asset.organization_id !==
      delivery.organizationId ||
    asset.connection_id !==
      delivery.connectionId ||
    asset.asset_type !==
      "google_ads_customer" ||
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
          "Google conversion feedback asset is not an active selected Google Ads customer.",

        errorCode:
          "google_feedback_asset_invalid",

        requestMetadata: {
          provider_call_state:
            "not_called",
        },
      },
    };
  }

  const customerId =
    normalizeGoogleCustomerId(
      asset.external_id,
    );

  if (!customerId) {
    return {
      ok:
        false as const,

      result: {
        outcome:
          "failed" as const,

        retryable:
          false,

        errorMessage:
          "Google Ads customer ID is invalid.",

        errorCode:
          "google_customer_id_invalid",

        requestMetadata: {
          provider_call_state:
            "not_called",
        },
      },
    };
  }

  const {
    data:
      rawConnection,
    error:
      connectionError,
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
          "scopes",
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
          "Google integration connection is unavailable.",

        errorCode:
          "google_connection_missing",

        requestMetadata: {
          provider_call_state:
            "not_called",
        },
      },
    };
  }

  const connection =
    rawConnection as unknown as
      GoogleFeedbackConnectionRow;

  if (
    connection.organization_id !==
      delivery.organizationId ||
    connection.provider !==
      "google" ||
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
          "Google integration connection is not connected for this organization.",

        errorCode:
          "google_connection_invalid",

        requestMetadata: {
          provider_call_state:
            "not_called",
        },
      },
    };
  }

  const scopes =
    Array.isArray(
      connection.scopes,
    )
      ? connection.scopes.filter(
          (
            value,
          ): value is string =>
            typeof value ===
            "string",
        )
      : [];

  if (
    !scopes.includes(
      GOOGLE_DATA_MANAGER_SCOPE,
    )
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
          "Google account must be reconnected to grant Data Manager authorization.",

        errorCode:
          "google_datamanager_scope_missing",

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

    customerId,
  };
}


function buildGoogleRequest(
  delivery:
    ClaimedConversionFeedbackDelivery,
  context: {
    customerId: string;
    match: {
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
    };

    adPersonalization:
      | boolean
      | null;
  },
) {
  const config =
    providerConfig(
      delivery,
    );

  const conversionActionId =
    normalizeConversionActionId(
      delivery
        .destinationExternalId,
    );

  if (!conversionActionId) {
    return {
      ok:
        false as const,

      result: {
        outcome:
          "failed" as const,

        retryable:
          false,

        errorMessage:
          "Google conversion action destination ID is invalid.",

        errorCode:
          "google_conversion_action_invalid",

        requestMetadata: {
          provider_call_state:
            "not_called",
        },
      },
    };
  }

  const identifiers =
    userIdentifiers(
      context.match.emails,
      context.match.phones,
    );

  const adIdentifiers =
    googleAdIdentifiers(
      context.match,
    );

  if (
    identifiers.length === 0 &&
    !adIdentifiers
  ) {
    return {
      ok:
        false as const,

      result: {
        outcome:
          "skipped" as const,

        reason:
          "no_google_match_identifiers",

        metadata: {
          provider_call_state:
            "not_called",
        },
      },
    };
  }

  const operatingAccount = {
    accountType:
      "GOOGLE_ADS",

    accountId:
      context.customerId,
  };

  const destination: {
    operatingAccount: {
      accountType: string;
      accountId: string;
    };

    productDestinationId:
      string;

    loginAccount?: {
      accountType: string;
      accountId: string;
    };
  } = {
    operatingAccount,

    productDestinationId:
      conversionActionId,
  };

  if (
    config.loginCustomerId
  ) {
    destination.loginAccount = {
      accountType:
        "GOOGLE_ADS",

      accountId:
        config.loginCustomerId,
    };
  }

  const event: {
    transactionId: string;
    eventTimestamp: string;

    consent: {
      adUserData:
        "CONSENT_GRANTED";

      adPersonalization?:
        | "CONSENT_GRANTED"
        | "CONSENT_DENIED";
    };

    userData?: {
      userIdentifiers:
        ReturnType<
          typeof userIdentifiers
        >;
    };

    adIdentifiers?:
      NonNullable<
        ReturnType<
          typeof googleAdIdentifiers
        >
      >;

    currency?: string;

    conversionValue?: number;

    conversionCount: number;

    eventSource?:
      "WEB"
      | "APP"
      | "IN_STORE"
      | "PHONE";
  } = {
    transactionId:
      delivery
        .conversionFactKey,

    eventTimestamp:
      delivery
        .conversionAt,

    consent:
      googleConsent(
        context
          .adPersonalization,
      ),

    conversionCount:
      1,
  };

  if (
    identifiers.length > 0
  ) {
    event.userData = {
      userIdentifiers:
        identifiers,
    };
  }

  if (adIdentifiers) {
    event.adIdentifiers =
      adIdentifiers;
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
    event.conversionValue =
      amount;

    event.currency =
      delivery.currency;
  }

  if (config.eventSource) {
    event.eventSource =
      config.eventSource;
  }

  const body: {
    destinations:
      typeof destination[];

    events:
      typeof event[];

    validateOnly:
      boolean;

    encoding?: "HEX";
  } = {
    destinations: [
      destination,
    ],

    events: [
      event,
    ],

    validateOnly:
      config.validateOnly,
  };

  /*
   * Encoding is required whenever UserData is uploaded.
   * SHA-256 values above use hexadecimal output.
   */
  if (
    identifiers.length > 0
  ) {
    body.encoding =
      "HEX";
  }

  return {
    ok:
      true as const,

    body,

    validateOnly:
      config.validateOnly,
  };
}


export const googleDataManagerAdapter:
  ConversionFeedbackProviderAdapter = {
    provider:
      "google",

    supports(
      delivery,
    ) {
      return (
        delivery.provider ===
          "google" &&
        delivery.destinationKind ===
          "google_ads_conversion_action"
      );
    },

    async deliver({
      delivery,
      matchContext,
    }): Promise<
      ConversionFeedbackProviderResult
    > {
      const loaded =
        await loadGoogleDeliveryContext(
          delivery,
        );

      if (!loaded.ok) {
        return loaded.result;
      }

      const request =
        buildGoogleRequest(
          delivery,
          {
            customerId:
              loaded.customerId,

            match:
              matchContext.match,

            adPersonalization:
              matchContext
                .consent
                .adPersonalization,
          },
        );

      if (!request.ok) {
        return request.result;
      }

      let accessToken:
        string;

      try {
        accessToken =
          await getGoogleAccessTokenForConnection(
            delivery.connectionId,
            {
              organizationId:
                delivery
                  .organizationId,
            },
          );
      } catch {
        /*
         * The connection may require a reconnect, or Google's
         * token endpoint may be temporarily unavailable.
         *
         * Treat this as retryable here; connection/scope
         * configuration was already validated above.
         */
        return {
          outcome:
            "failed",

          retryable:
            true,

          errorMessage:
            "Unable to obtain a Google access token for Data Manager.",

          errorCode:
            "google_access_token_unavailable",

          requestMetadata: {
            operation:
              "events.ingest",

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

      let response:
        Response;

      try {
        response =
          await fetch(
            GOOGLE_DATA_MANAGER_EVENTS_ENDPOINT,
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
            },
          );
      } catch {
        return {
          outcome:
            "failed",

          retryable:
            true,

          errorMessage:
            "Google Data Manager request failed before a response was received.",

          errorCode:
            "google_datamanager_network_error",

          requestMetadata: {
            operation:
              "events.ingest",

            endpoint_kind:
              "conversion",

            validate_only:
              request
                .validateOnly,

            provider_call_state:
              "unknown",
          },
        };
      }

      const payload =
        await parseGoogleResponse(
          response,
        );

      const requestId =
        stringValue(
          payload.requestId,
        )?.slice(
          0,
          250,
        ) ??
        null;

      const providerCode =
        safeProviderCode(
          payload.error?.status,
        );

      const requestMetadata:
        JsonObject = {
          operation:
            "events.ingest",

          endpoint_kind:
            "conversion",

          validate_only:
            request.validateOnly,

          provider_call_state:
            "called",
        };

      if (response.ok) {
        const hasWarnings =
          Array.isArray(
            payload.fieldWarnings,
          ) &&
          payload.fieldWarnings.length >
            0;

        return {
          outcome:
            "delivered",

          providerEventId:
            null,

          httpStatus:
            response.status,

          providerRequestId:
            requestId,

          providerResponseCode:
            request.validateOnly
              ? "VALIDATED"
              : "ACCEPTED",

          requestMetadata,

          responseMetadata: {
            provider_status:
              hasWarnings
                ? "accepted_with_warnings"
                : request.validateOnly
                  ? "validated"
                  : "accepted",
          },
        };
      }

      const retryable =
        retryableHttpStatus(
          response.status,
        );

      return {
        outcome:
          "failed",

        retryable,

        errorMessage:
          retryable
            ? "Google Data Manager temporarily rejected the conversion event."
            : "Google Data Manager rejected the conversion event.",

        errorCode:
          retryable
            ? "google_datamanager_temporary_error"
            : "google_datamanager_request_rejected",

        retryAfterSeconds:
          retryable
            ? retryAfterSeconds(
                response,
              )
            : null,

        httpStatus:
          response.status,

        providerRequestId:
          requestId,

        providerResponseCode:
          providerCode,

        requestMetadata,

        responseMetadata: {
          provider_status:
            "rejected",

          provider_error_category:
            providerCode ??
            (
              retryable
                ? "temporary"
                : "request"
            ),
        },
      };
    },
  };
