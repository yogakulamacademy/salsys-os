import "server-only";

import type { AdActivationTransportAdapter } from "@/lib/ad-activation/provider-transport-boundary";
import { classifyAdActivationProviderError } from "@/lib/ad-activation/provider-errors";
import { getMetaAccessTokenForConnection } from "@/lib/integrations/meta-connection";
import { metaGraphVersion } from "@/lib/integrations/meta";


type MetaErrorEnvelope = {
  error?: {
    code?: unknown;
  };
};


function providerCodeFromPayload(payload: unknown) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return null;
  }

  const error = (payload as MetaErrorEnvelope).error;
  if (!error || typeof error !== "object") {
    return null;
  }

  const code = error.code;
  return typeof code === "string" || typeof code === "number"
    ? String(code)
    : null;
}


async function parseMetaErrorCode(response: Response) {
  try {
    const payload = await response.json() as unknown;
    return providerCodeFromPayload(payload);
  } catch {
    return null;
  }
}


/**
 * Live Meta Custom Audience transport adapter.
 *
 * This adapter is intentionally inert while AD_ACTIVATION_TRANSPORT_ENABLED is
 * false because provider-transport-boundary.ts refuses to invoke adapters before
 * this code is reached. When a later reviewed phase enables transport, this
 * adapter:
 *
 * - resolves the organization-scoped Meta credential only at send time
 * - sends only the already validated + SHA-256 prepared audience payload
 * - never logs or persists access tokens, identifiers, or provider bodies
 * - returns only safe request/status metadata to the delivery finalizer
 */
export const metaCustomAudienceTransportAdapter: AdActivationTransportAdapter = {
  provider: "meta",

  async send({ context, prepared }) {
    if (prepared.provider !== "meta") {
      return {
        status: "failed",
        errorCode: "provider_payload_mismatch",
        errorMessage: "Prepared activation payload does not match the Meta adapter.",
      };
    }

    if (prepared.operations.length === 0) {
      return {
        status: "skipped",
        reason: "no_meta_operations",
      };
    }

    let accessToken: string;
    try {
      accessToken = await getMetaAccessTokenForConnection(
        context.connectionId,
        { organizationId: context.organizationId },
      );
    } catch {
      return {
        status: "failed",
        errorCode: "meta_credential_unavailable",
        errorMessage: "Meta credential could not be loaded for this organization connection.",
      };
    }

    const graphVersion = metaGraphVersion();
    let latestRequestId: string | undefined;

    for (const operation of prepared.operations) {
      const url = `https://graph.facebook.com/${graphVersion}${operation.resourcePath}`;

      let response: Response;
      try {
        response = await fetch(url, {
          method: operation.method,
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(operation.body),
          cache: "no-store",
        });
      } catch {
        const classified = classifyAdActivationProviderError({ networkError: true });
        return {
          status: classified.retryable ? "retry" : "failed",
          errorCode: classified.safeCode,
          errorMessage: "Meta Custom Audience request could not reach the provider.",
        };
      }

      latestRequestId =
        response.headers.get("x-fb-request-id")
        ?? response.headers.get("x-fb-trace-id")
        ?? latestRequestId;

      if (!response.ok) {
        const providerCode = await parseMetaErrorCode(response);
        const classified = classifyAdActivationProviderError({
          httpStatus: response.status,
          providerCode,
        });

        return {
          status: classified.retryable ? "retry" : "failed",
          errorCode: classified.safeCode,
          errorMessage: `Meta Custom Audience request failed with HTTP ${response.status}.`,
        };
      }
    }

    return {
      status: "delivered",
      providerRequestId: latestRequestId,
      providerResponseCode: "meta_custom_audience_success",
    };
  },
};
