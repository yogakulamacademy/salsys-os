import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { syncYogakulamCatalogAdapter } from "@/lib/integrations/yogakulam-catalog-adapter";
import type { CourseCatalogSyncResult } from "@/lib/integrations/yogakulam-courses";

export type EducationCatalogSyncTrigger = "manual" | "cron" | "webhook";

type CatalogCapabilityConfig = Record<string, unknown>;

type CatalogSyncTarget = {
  organizationId: string;
  provider: string;
  config: CatalogCapabilityConfig;
};

type CatalogAdapter = (input: {
  organizationId: string;
  trigger: EducationCatalogSyncTrigger;
  config: CatalogCapabilityConfig;
}) => Promise<CourseCatalogSyncResult>;

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const ADAPTERS: Readonly<Record<string, CatalogAdapter>> = Object.freeze({
  yogakulam_website: syncYogakulamCatalogAdapter,
});

export class EducationCatalogSyncConfigurationError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(code: string, message: string, status = 409) {
    super(message);
    this.name = "EducationCatalogSyncConfigurationError";
    this.code = code;
    this.status = status;
  }
}

function cleanProvider(config: CatalogCapabilityConfig) {
  const value = config.provider;
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

function asConfig(value: unknown): CatalogCapabilityConfig {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as CatalogCapabilityConfig;
}

async function resolveCatalogSyncTarget(
  organizationId?: string,
): Promise<CatalogSyncTarget> {
  const supabase = createAdminClient();
  const requestedOrganizationId = organizationId?.trim() || "";

  if (requestedOrganizationId && !UUID_PATTERN.test(requestedOrganizationId)) {
    throw new EducationCatalogSyncConfigurationError(
      "CATALOG_SYNC_ORGANIZATION_INVALID",
      "The requested catalog-sync organization is invalid.",
      400,
    );
  }

  let targetQuery = supabase
    .from("organization_capabilities")
    .select("organization_id,config")
    .eq("capability_code", "education_catalog_sync")
    .eq("enabled", true);

  if (requestedOrganizationId) {
    targetQuery = targetQuery.eq("organization_id", requestedOrganizationId);
  } else {
    targetQuery = targetQuery.limit(2);
  }

  const { data: targets, error: targetError } = await targetQuery;

  if (targetError) {
    throw new Error(
      `Unable to resolve Education catalog sync capability: ${targetError.message}`,
    );
  }

  const rows = targets ?? [];

  if (rows.length === 0) {
    throw new EducationCatalogSyncConfigurationError(
      "CATALOG_SYNC_CAPABILITY_NOT_CONFIGURED",
      requestedOrganizationId
        ? "Education catalog sync is not enabled for the selected organization."
        : "No organization has an enabled Education catalog sync capability.",
    );
  }

  if (!requestedOrganizationId && rows.length > 1) {
    throw new EducationCatalogSyncConfigurationError(
      "CATALOG_SYNC_ORGANIZATION_REQUIRED",
      "More than one organization has Education catalog sync enabled; an explicit organization_id is required.",
      400,
    );
  }

  const row = rows[0];
  const resolvedOrganizationId = String(row.organization_id ?? "").trim();
  const config = asConfig(row.config);

  if (!resolvedOrganizationId) {
    throw new EducationCatalogSyncConfigurationError(
      "CATALOG_SYNC_ORGANIZATION_INVALID",
      "The configured catalog-sync organization is invalid.",
    );
  }

  const [organizationResult, educationCoreResult] = await Promise.all([
    supabase
      .from("organizations")
      .select("id,status")
      .eq("id", resolvedOrganizationId)
      .maybeSingle(),
    supabase
      .from("organization_capabilities")
      .select("enabled")
      .eq("organization_id", resolvedOrganizationId)
      .eq("capability_code", "education_core")
      .eq("enabled", true)
      .maybeSingle(),
  ]);

  if (organizationResult.error) {
    throw new Error(
      `Unable to verify catalog-sync organization: ${organizationResult.error.message}`,
    );
  }

  if (educationCoreResult.error) {
    throw new Error(
      `Unable to verify Education Core capability: ${educationCoreResult.error.message}`,
    );
  }

  if (!organizationResult.data || organizationResult.data.status !== "active") {
    throw new EducationCatalogSyncConfigurationError(
      "CATALOG_SYNC_ORGANIZATION_INACTIVE",
      "The configured catalog-sync organization is not active.",
    );
  }

  if (!educationCoreResult.data?.enabled) {
    throw new EducationCatalogSyncConfigurationError(
      "CATALOG_SYNC_EDUCATION_CORE_REQUIRED",
      "Education Core must be enabled before external catalog sync can run.",
    );
  }

  const provider = cleanProvider(config);

  if (!provider) {
    throw new EducationCatalogSyncConfigurationError(
      "CATALOG_SYNC_PROVIDER_NOT_CONFIGURED",
      "Education catalog sync is enabled but no provider is configured.",
    );
  }

  if (!ADAPTERS[provider]) {
    throw new EducationCatalogSyncConfigurationError(
      "CATALOG_SYNC_PROVIDER_UNSUPPORTED",
      `Education catalog provider '${provider}' is not supported by this deployment.`,
    );
  }

  return {
    organizationId: resolvedOrganizationId,
    provider,
    config,
  };
}

export async function syncEducationCatalog({
  trigger,
  organizationId,
}: {
  trigger: EducationCatalogSyncTrigger;
  organizationId?: string;
}): Promise<CourseCatalogSyncResult> {
  const target = await resolveCatalogSyncTarget(organizationId);
  const adapter = ADAPTERS[target.provider];

  return adapter({
    organizationId: target.organizationId,
    trigger,
    config: target.config,
  });
}
