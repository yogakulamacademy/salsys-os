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


const META_DESTINATION_KIND =
  "meta_dataset_event";

const META_ACTION_SOURCES =
  new Set([
    "website",
    "app",
    "phone_call",
    "chat",
    "email",
    "physical_store",
    "system_generated",
    "other",
  ]);


type MetaFeedbackConnectionRow = {
  id: string;
  organization_id: string;
  provider: string;
  status: string;
};


type MetaFeedbackAssetRow = {
  id: string;
  organization_id: string;
  connection_id: string;
  asset_type: string;
  external_id: string;
  status: string;
  is_selected: boolean;
};


type MetaConversionsApiEnvelope = {
  events_received?: unknown;
  messages?: unknown[];
  fbtrace_id?: unknown;
  error?: {
    message?: unknown;
    type?: unknown;
    code?: unknown;
    error_subcode?: unknown;
    is_transient?: unknown;
    fbtrace_id?: unknown;
  };
};


function stringValue(
  value: unknown,
) {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed =
    value.trim();

  return trimmed ||
    null;
}


function numberValue(
  value: unknown,
) {
  if (
    typeof value === "number" &&
    Number.isFinite(value)
  ) {
    return value;
  }

  if (
    typeof value === "string" &&
    value.trim()
  ) {
    const parsed =
      Number(value);

    return Number.isFinite(parsed)
      ? parsed
      : null;
  }

  return null;
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
      .toLowerCase();

  const at =
    value.lastIndexOf("@");

  if (
    at <= 0 ||
    at === value.length - 1
  ) {
    return null;
  }

  const local =
    value.slice(
      0,
      at,
    );

  const domain =
    value.slice(
      at + 1,
    );

  if (
    !local ||
    !domain.includes(".") ||
    /\s/.test(value)
  ) {
    return null;
  }

  return value;
}


function normalizeMetaPhone(
  input: string,
) {
  const value =
    input.trim();

  /*
   * Never infer a country code. Only accept numbers that were captured with an
   * explicit leading "+", then normalize them to Meta's digits-only format.
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

  return /^[1-9]\d{6,14}$/.test(
    digits,
  )
    ? digits
    : null;
}


function safeMetaBrowserIdentifier(
  value:
    | string
    | null,
) {
  if (!value) {
    return null;
  }

  const trimmed =
    value.trim();

  if (
    trimmed.length > 300 ||
    !trimmed.startsWith("fb.") ||
    /\s/.test(trimmed)
  ) {
    return null;
  }

  return trimmed;
}


function metaUserData(
  match: {
    emails: string[];
    phones: string[];
    fbc: string | null;
    fbp: string | null;
  },
) {
  const emailHashes =
    Array.from(
      new Set(
        match.emails
          .map(
            normalizeMetaEmail,
          )
          .filter(
            (
              value,
            ): value is string =>
              Boolean(value),
          )
          .map(
            sha256Hex,
          ),
      ),
    )
      .slice(
        0,
        5,
      );

  const phoneHashes =
    Array.from(
      new Set(
        match.phones
          .map(
            normalizeMetaPhone,
          )
          .filter(
            (
              value,
            ): value is string =>
              Boolean(value),
          )
          .map(
            sha256Hex,
          ),
      ),
    )
      .slice(
        0,
        5,
      );

  const fbc =
    safeMetaBrowserIdentifier(
      match.fbc,
    );

  const fbp =
    safeMetaBrowserIdentifier(
      match.fbp,
    );

  const userData: {
    em?: string[];
    ph?: string[];
    fbc?: string;
    fbp?: string;
  } = {};

  if (emailHashes.length) {
    userData.em =
      emailHashes;
  }

  if (phoneHashes.length) {
    userData.ph =
      phoneHashes;
  }

  if (fbc) {
    userData.fbc =
      fbc;
  }

  if (fbp) {
    userData.fbp =
      fbp;
  }

  return userData;
}


function hasMetaMatchSignal(
  userData: {
    em?: string[];
    ph?: string[];
    fbc?: string;
    fbp?: string;
  },
) {
  return Boolean(
    userData.em?.length ||
    userData.ph?.length ||
    userData.fbc ||
    userData.fbp,
  );
}


function providerConfig(
  delivery:
    ClaimedConversionFeedbackDelivery,
) {
  const raw =
    delivery.providerConfigSnapshot;

  const configuredActionSource =
    stringValue(
      raw[
        "action_source"
      ],
    )?.toLowerCase() ??
    "system_generated";

  const actionSource =
    META_ACTION_SOURCES.has(
      configuredActionSource,
    )
      ? configuredActionSource
      : null;

  const testEventCodeRaw =
    stringValue(
      raw[
        "test_event_code"
      ],
    );

  const testEventCode =
    testEventCodeRaw &&
    /^[A-Za-z0-9_-]{1,100}$/.test(
      testEventCodeRaw,
    )
      ? testEventCodeRaw
      : null;

  const eventSourceUrlRaw =
    stringValue(
      raw[
        "event_source_url"
      ],
    );

  let eventSourceUrl:
    | string
    | null =
    null;

  if (eventSourceUrlRaw) {
    try {
      const parsed =
        new URL(
          eventSourceUrlRaw,
        );

      if (
        parsed.protocol ===
          "https:" ||
        parsed.protocol ===
          "http:"
      ) {
        eventSourceUrl =
          parsed.toString();
      }
    } catch {
      eventSourceUrl =
        null;
    }
  }

  return {
    actionSource,
    testEventCode,
    eventSourceUrl,
  };
}


function normalizeDatasetId(
  value:
    | string
    | null,
) {
  if (!value) {
    return null;
  }

  const trimmed =
    value.trim();

  return /^\d{5,30}$/.test(
    trimmed,
  )
    ? trimmed
    : null;
}


function normalizeEventName(
  value:
    | string
    | null,
) {
  if (!value) {
    return null;
  }

  const trimmed =
    value.trim();

  if (
    !trimmed ||
    trimmed.length > 100 ||
    /[\u0000-\u001F\u007F]/.test(
      trimmed,
    )
  ) {
    return null;
  }

  return trimmed;
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


function normalizeCurrency(
  value:
    | string
    | null,
) {
  if (!value) {
    return null;
  }

  const normalized =
    value
      .trim()
      .toUpperCase();

  return /^[A-Z]{3}$/.test(
    normalized,
  )
    ? normalized
    : null;
}


function stableMetaEventId(
  delivery:
    ClaimedConversionFeedbackDelivery,
) {
  return (
    "salsys_" +
    sha256Hex(
      [
        delivery.organizationId,
        delivery.routeId,
        delivery.conversionFactKey,
      ].join(":"),
    ).slice(
      0,
      48,
    )
  );
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
    status === 425 ||
    status === 429 ||
    status >= 500
  );
}


function providerResponseCode(
  payload:
    MetaConversionsApiEnvelope | null,
) {
  const code =
    payload?.error?.code;

  const subcode =
    payload?.error
      ?.error_subcode;

  const codeString =
    typeof code === "number" ||
    typeof code === "string"
      ? String(code)
      : null;

  const subcodeString =
    typeof subcode === "number" ||
    typeof subcode === "string"
      ? String(subcode)
      : null;

  if (!codeString) {
    return null;
  }

  return subcodeString
    ? `${codeString}:${subcodeString}`
    : codeString;
}


function providerRequestId(
  payload:
    MetaConversionsApiEnvelope | null,
) {
  return (
    stringValue(
      payload?.fbtrace_id,
    ) ??
    stringValue(
      payload?.error
        ?.fbtrace_id,
    )
  );
}


async function parseMetaResponse(
  response: Response,
): Promise<
  MetaConversionsApiEnvelope | null
> {
  try {
    const payload =
      await response.json();

    if (
      !payload ||
      typeof payload !== "object" ||
      Array.isArray(payload)
    ) {
      return null;
    }

    return payload as
      MetaConversionsApiEnvelope;
  } catch {
    return null;
  }
}


async function resolveMetaRuntime(
  delivery:
    ClaimedConversionFeedbackDelivery,
): Promise<
  | {
      ok: true;
      datasetId: string;
    }
  | {
      ok: false;
      result: ConversionFeedbackProviderResult;
    }
> {
  const datasetId =
    normalizeDatasetId(
      delivery
        .destinationExternalId,
    );

  if (!datasetId) {
    return {
      ok: false,
      result: {
        outcome: "failed",
        retryable: false,
        errorMessage:
          "Meta conversion route has an invalid dataset ID.",
        errorCode:
          "meta_invalid_dataset_id",
        requestMetadata: {
          provider: "meta",
          endpoint_kind:
            "meta_dataset_events",
          provider_call_state:
            "not_called",
        },
      },
    };
  }


  const admin =
    createAdminClient();

  const {
    data: rawConnection,
    error: connectionError,
  } =
    await admin
      .from(
        "integration_connections",
      )
      .select(
        "id, organization_id, provider, status",
      )
      .eq(
        "id",
        delivery.connectionId,
      )
      .eq(
        "organization_id",
        delivery.organizationId,
      )
      .maybeSingle();

  const connection =
    rawConnection as unknown as
      | MetaFeedbackConnectionRow
      | null;

  if (
    connectionError ||
    !connection ||
    connection.provider !== "meta" ||
    connection.status !== "connected"
  ) {
    return {
      ok: false,
      result: {
        outcome: "failed",
        retryable: false,
        errorMessage:
          "Meta conversion route does not have an active Meta connection.",
        errorCode:
          "meta_connection_unavailable",
        requestMetadata: {
          provider: "meta",
          endpoint_kind:
            "meta_dataset_events",
          provider_call_state:
            "not_called",
        },
      },
    };
  }


  const {
    data: rawAsset,
    error: assetError,
  } =
    await admin
      .from(
        "integration_assets",
      )
      .select(
        "id, organization_id, connection_id, asset_type, external_id, status, is_selected",
      )
      .eq(
        "id",
        delivery.integrationAssetId,
      )
      .eq(
        "organization_id",
        delivery.organizationId,
      )
      .eq(
        "connection_id",
        delivery.connectionId,
      )
      .maybeSingle();

  const asset =
    rawAsset as unknown as
      | MetaFeedbackAssetRow
      | null;

  if (
    assetError ||
    !asset ||
    asset.asset_type !==
      "meta_ad_account" ||
    asset.is_selected !== true ||
    asset.status ===
      "unavailable"
  ) {
    return {
      ok: false,
      result: {
        outcome: "failed",
        retryable: false,
        errorMessage:
          "Meta conversion route does not have a selected available Meta ad account.",
        errorCode:
          "meta_asset_unavailable",
        requestMetadata: {
          provider: "meta",
          endpoint_kind:
            "meta_dataset_events",
          provider_call_state:
            "not_called",
        },
      },
    };
  }


  return {
    ok: true,
    datasetId,
  };
}


async function deliverMetaConversion(
  delivery:
    ClaimedConversionFeedbackDelivery,
  matchContext: {
    emails: string[];
    phones: string[];
    fbc: string | null;
    fbp: string | null;
  },
): Promise<
  ConversionFeedbackProviderResult
> {
  const runtime =
    await resolveMetaRuntime(
      delivery,
    );

  if (!runtime.ok) {
    return runtime.result;
  }


  const eventName =
    normalizeEventName(
      delivery
        .destinationEventName,
    );

  if (!eventName) {
    return {
      outcome: "failed",
      retryable: false,
      errorMessage:
        "Meta conversion route has an invalid event name.",
      errorCode:
        "meta_invalid_event_name",
      requestMetadata: {
        provider: "meta",
        endpoint_kind:
          "meta_dataset_events",
        provider_call_state:
          "not_called",
      },
    };
  }


  const config =
    providerConfig(
      delivery,
    );

  if (!config.actionSource) {
    return {
      outcome: "failed",
      retryable: false,
      errorMessage:
        "Meta conversion route has an invalid action_source.",
      errorCode:
        "meta_invalid_action_source",
      requestMetadata: {
        provider: "meta",
        endpoint_kind:
          "meta_dataset_events",
        provider_call_state:
          "not_called",
      },
    };
  }


  const conversionTime =
    Date.parse(
      delivery.conversionAt,
    );

  if (
    !Number.isFinite(
      conversionTime,
    ) ||
    conversionTime <= 0
  ) {
    return {
      outcome: "failed",
      retryable: false,
      errorMessage:
        "Meta conversion has an invalid event time.",
      errorCode:
        "meta_invalid_event_time",
      requestMetadata: {
        provider: "meta",
        endpoint_kind:
          "meta_dataset_events",
        provider_call_state:
          "not_called",
      },
    };
  }


  const userData =
    metaUserData(
      matchContext,
    );

  if (
    !hasMetaMatchSignal(
      userData,
    )
  ) {
    return {
      outcome: "skipped",
      reason:
        "meta_no_match_signals",
      metadata: {
        provider: "meta",
        endpoint_kind:
          "meta_dataset_events",
        provider_call_state:
          "not_called",
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
            delivery.organizationId,
        },
      );
  } catch {
    return {
      outcome: "failed",
      retryable: true,
      errorMessage:
        "Unable to load the Meta connection credential.",
      errorCode:
        "meta_credential_unavailable",
      requestMetadata: {
        provider: "meta",
        endpoint_kind:
          "meta_dataset_events",
        provider_call_state:
          "not_called",
      },
    };
  }


  const eventId =
    stableMetaEventId(
      delivery,
    );

  const amount =
    numericConversionValue(
      delivery.amount,
    );

  const currency =
    normalizeCurrency(
      delivery.currency,
    );

  const customData:
    JsonObject = {};

  if (
    amount !== null &&
    currency
  ) {
    customData.value =
      amount;
    customData.currency =
      currency;
  }


  const event: {
    event_name: string;
    event_time: number;
    event_id: string;
    action_source: string;
    user_data: typeof userData;
    event_source_url?: string;
    custom_data?: JsonObject;
  } = {
    event_name:
      eventName,

    event_time:
      Math.floor(
        conversionTime /
        1000,
      ),

    event_id:
      eventId,

    action_source:
      config.actionSource,

    user_data:
      userData,
  };

  if (config.eventSourceUrl) {
    event.event_source_url =
      config.eventSourceUrl;
  }

  if (
    Object.keys(
      customData,
    ).length > 0
  ) {
    event.custom_data =
      customData;
  }


  const requestBody: {
    data: typeof event[];
    test_event_code?: string;
  } = {
    data: [
      event,
    ],
  };

  if (config.testEventCode) {
    requestBody.test_event_code =
      config.testEventCode;
  }


  const endpoint =
    `https://graph.facebook.com/${metaGraphVersion()}/${runtime.datasetId}/events`;

  let response:
    Response;

  try {
    response =
      await fetch(
        endpoint,
        {
          method: "POST",

          headers: {
            Authorization:
              `Bearer ${accessToken}`,

            "Content-Type":
              "application/json",
          },

          body:
            JSON.stringify(
              requestBody,
            ),

          cache:
            "no-store",
        },
      );
  } catch {
    return {
      outcome: "failed",
      retryable: true,
      errorMessage:
        "Meta Conversions API network request failed.",
      errorCode:
        "meta_network_error",
      requestMetadata: {
        provider: "meta",
        endpoint_kind:
          "meta_dataset_events",
        provider_call_state:
          "unknown",
      },
    };
  }


  const payload =
    await parseMetaResponse(
      response,
    );

  const requestId =
    providerRequestId(
      payload,
    );

  const responseCode =
    providerResponseCode(
      payload,
    );

  const eventsReceived =
    numberValue(
      payload
        ?.events_received,
    );

  if (
    response.ok &&
    eventsReceived !== null &&
    eventsReceived >= 1
  ) {
    return {
      outcome: "delivered",
      providerEventId:
        eventId,
      httpStatus:
        response.status,
      providerRequestId:
        requestId,
      providerResponseCode:
        "events_received",
      requestMetadata: {
        provider: "meta",
        operation:
          "events",
        endpoint_kind:
          "meta_dataset_events",
        provider_call_state:
          "completed",
      },
      responseMetadata: {
        provider_status:
          config.testEventCode
            ? "test_event_received"
            : "event_received",
      },
    };
  }


  const retryable =
    retryableHttpStatus(
      response.status,
    ) ||
    payload?.error
      ?.is_transient === true;

  const providerCodeText =
    responseCode
      ? `, code ${responseCode}`
      : "";

  return {
    outcome: "failed",
    retryable,
    errorMessage:
      `Meta Conversions API request failed (HTTP ${response.status}${providerCodeText}).`,
    errorCode:
      `meta_http_${response.status}`,
    retryAfterSeconds:
      retryAfterSeconds(
        response,
      ),
    httpStatus:
      response.status,
    providerRequestId:
      requestId,
    providerResponseCode:
      responseCode,
    requestMetadata: {
      provider: "meta",
      operation:
        "events",
      endpoint_kind:
        "meta_dataset_events",
      provider_call_state:
        "failed",
    },
    responseMetadata: {
      provider_status:
        response.ok
          ? "zero_events_received"
          : "provider_error",
      provider_error_category:
        retryable
          ? "retryable"
          : "permanent",
    },
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
          META_DESTINATION_KIND
      );
    },

    async deliver({
      delivery,
      matchContext,
    }) {
      return deliverMetaConversion(
        delivery,
        {
          emails:
            matchContext.match.emails,
          phones:
            matchContext.match.phones,
          fbc:
            matchContext.match.fbc,
          fbp:
            matchContext.match.fbp,
        },
      );
    },
  };
