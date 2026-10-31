import "server-only";

export type AdActivationProviderErrorCategory =
  | "authentication"
  | "authorization"
  | "rate_limit"
  | "provider_unavailable"
  | "invalid_request"
  | "not_found"
  | "conflict"
  | "network"
  | "unknown";

export type AdActivationProviderErrorClassification = {
  category: AdActivationProviderErrorCategory;
  retryable: boolean;
  safeCode: string;
};

/**
 * Classify provider failures using only non-sensitive status/error metadata.
 * Provider bodies, request payloads, tokens and user identifiers must never be
 * passed to this classifier or persisted as attempt telemetry.
 */
export function classifyAdActivationProviderError(input: {
  httpStatus?: number | null;
  networkError?: boolean;
  providerCode?: string | null;
}): AdActivationProviderErrorClassification {
  if (input.networkError) {
    return { category: "network", retryable: true, safeCode: "provider_network_error" };
  }

  const status = input.httpStatus ?? null;
  if (status === 401) return { category: "authentication", retryable: false, safeCode: "provider_authentication_failed" };
  if (status === 403) return { category: "authorization", retryable: false, safeCode: "provider_authorization_failed" };
  if (status === 404) return { category: "not_found", retryable: false, safeCode: "provider_resource_not_found" };
  if (status === 409) return { category: "conflict", retryable: false, safeCode: "provider_conflict" };
  if (status === 429) return { category: "rate_limit", retryable: true, safeCode: "provider_rate_limited" };
  if (status !== null && status >= 500 && status <= 599) {
    return { category: "provider_unavailable", retryable: true, safeCode: "provider_unavailable" };
  }
  if (status !== null && status >= 400 && status <= 499) {
    return { category: "invalid_request", retryable: false, safeCode: "provider_request_rejected" };
  }

  const providerCode = String(input.providerCode ?? "").toLowerCase();
  if (providerCode.includes("rate") || providerCode.includes("throttl")) {
    return { category: "rate_limit", retryable: true, safeCode: "provider_rate_limited" };
  }

  return { category: "unknown", retryable: false, safeCode: "provider_unknown_error" };
}
