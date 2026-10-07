import "server-only";

import {
  googleDataManagerAdapter,
} from "@/lib/conversion-feedback/providers/google-data-manager";

import type {
  ConversionFeedbackProviderAdapter,
  RunConversionFeedbackWorkerOptions,
} from "@/lib/conversion-feedback/types";

import {
  runConversionFeedbackWorker,
} from "@/lib/conversion-feedback/worker";


/*
 * Production provider registry.
 *
 * The core worker remains provider-neutral. Provider implementations
 * are registered here so execution entrypoints do not construct their
 * own adapter lists or accidentally diverge across environments.
 */
export const conversionFeedbackProviderAdapters =
  [
    googleDataManagerAdapter,
  ] satisfies readonly ConversionFeedbackProviderAdapter[];


export type RunConfiguredConversionFeedbackWorkerOptions =
  Omit<
    RunConversionFeedbackWorkerOptions,
    "adapters"
  >;


/*
 * Run the provider-neutral worker with the production adapter registry.
 *
 * organizationId remains mandatory and continues to scope queue claims,
 * match resolution, credentials and provider resources to one tenant.
 */
export function runConfiguredConversionFeedbackWorker(
  options:
    RunConfiguredConversionFeedbackWorkerOptions,
) {
  return runConversionFeedbackWorker({
    ...options,
    adapters:
      conversionFeedbackProviderAdapters,
  });
}