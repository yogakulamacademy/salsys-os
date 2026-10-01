import "server-only";

import type { IntegrationAssetType } from "@/lib/integrations/types";

export type DiscoveredGoogleAsset = {
  asset_type: IntegrationAssetType;
  external_id: string;
  name: string;
  metadata: Record<string, unknown>;
};

export type GoogleAssetDiscoveryResult = {
  assets: DiscoveredGoogleAsset[];
  warnings: string[];
};

type GaAccountSummary = {
  account?: string;
  displayName?: string;
  propertySummaries?: Array<{
    property?: string;
    displayName?: string;
    propertyType?: string;
    parent?: string;
    canEdit?: boolean;
  }>;
};

type GaAccountSummariesResponse = {
  accountSummaries?: GaAccountSummary[];
  nextPageToken?: string;
};

type SearchConsoleSitesResponse = {
  siteEntry?: Array<{
    siteUrl?: string;
    permissionLevel?: string;
  }>;
};

type GoogleAdsAccessibleResponse = {
  resourceNames?: string[];
  error?: {
    message?: string;
    status?: string;
    code?: number;
  };
};

async function googleGet<T>(
  url: string,
  accessToken: string,
  extraHeaders: Record<string, string> = {},
) {
  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      ...extraHeaders,
    },
    cache: "no-store",
  });

  const payload = (await response.json()) as T;

  if (!response.ok) {
    const maybeError = payload as {
      error?: {
        message?: string;
      };
    };

    throw new Error(
      maybeError.error?.message ||
        `Google API request failed (${response.status}).`,
    );
  }

  return payload;
}

async function discoverGa4(accessToken: string) {
  const assets: DiscoveredGoogleAsset[] = [];

  let pageToken: string | null = null;

  do {
    const url = new URL(
      "https://analyticsadmin.googleapis.com/v1beta/accountSummaries",
    );

    url.searchParams.set("pageSize", "200");

    if (pageToken) {
      url.searchParams.set("pageToken", pageToken);
    }

    const payload = await googleGet<GaAccountSummariesResponse>(
      url.toString(),
      accessToken,
    );

    for (const account of payload.accountSummaries ?? []) {
      for (const property of account.propertySummaries ?? []) {
        const propertyResource = property.property ?? "";

        const propertyId = propertyResource.replace(/^properties\//, "");

        if (!propertyId) {
          continue;
        }

        assets.push({
          asset_type: "ga4_property",
          external_id: propertyId,
          name: property.displayName || `GA4 ${propertyId}`,
          metadata: {
            account_resource: account.account ?? null,
            account_name: account.displayName ?? null,
            property_resource: propertyResource,
            property_type: property.propertyType ?? null,
            parent: property.parent ?? null,
            can_edit: property.canEdit ?? null,
          },
        });
      }
    }

    pageToken = payload.nextPageToken ?? null;
  } while (pageToken);

  return assets;
}

async function discoverSearchConsole(accessToken: string) {
  const payload = await googleGet<SearchConsoleSitesResponse>(
    "https://www.googleapis.com/webmasters/v3/sites",
    accessToken,
  );

  const assets: DiscoveredGoogleAsset[] = [];

  for (const site of payload.siteEntry ?? []) {
    const siteUrl = site.siteUrl?.trim();

    if (!siteUrl) {
      continue;
    }

    assets.push({
      asset_type: "search_console_site",
      external_id: siteUrl,
      name: siteUrl,
      metadata: {
        permission_level: site.permissionLevel ?? null,
      },
    });
  }

  return assets;
}

function googleAdsApiVersion() {
  const value = process.env.GOOGLE_ADS_API_VERSION?.trim();

  if (value && /^v\d+$/.test(value)) {
    return value;
  }

  return "v25";
}

function formatCustomerId(value: string) {
  const digits = value.replace(/\D/g, "");

  if (digits.length !== 10) {
    return digits;
  }

  return `${digits.slice(0, 3)}-` + `${digits.slice(3, 6)}-` + digits.slice(6);
}

async function discoverGoogleAds(accessToken: string) {
  const developerToken = process.env.GOOGLE_ADS_DEVELOPER_TOKEN?.trim();

  const version = googleAdsApiVersion();

  const extraHeaders: Record<string, string> = {};

  // Google sunset developer-token enforcement in September 2026.
  // Keep sending it only when an older setup still has one configured.
  if (developerToken) {
    extraHeaders["developer-token"] = developerToken;
  }

  const payload = await googleGet<GoogleAdsAccessibleResponse>(
    `https://googleads.googleapis.com/${version}/customers:listAccessibleCustomers`,
    accessToken,
    extraHeaders,
  );

  const assets: DiscoveredGoogleAsset[] = [];

  for (const resourceName of payload.resourceNames ?? []) {
    const customerId = resourceName.replace(/^customers\//, "");

    if (!customerId) {
      continue;
    }

    assets.push({
      asset_type: "google_ads_customer",
      external_id: customerId,
      name: `Google Ads ${formatCustomerId(customerId)}`,
      metadata: {
        resource_name: resourceName,
      },
    });
  }

  return {
    assets,
    warning: null as string | null,
  };
}

export async function discoverGoogleAssets(
  accessToken: string,
): Promise<GoogleAssetDiscoveryResult> {
  const assets: DiscoveredGoogleAsset[] = [];

  const warnings: string[] = [];

  try {
    assets.push(...(await discoverGa4(accessToken)));
  } catch (error) {
    warnings.push(
      `GA4: ${error instanceof Error ? error.message : "Discovery failed."}`,
    );
  }

  try {
    assets.push(...(await discoverSearchConsole(accessToken)));
  } catch (error) {
    warnings.push(
      `Search Console: ${
        error instanceof Error ? error.message : "Discovery failed."
      }`,
    );
  }

  try {
    const ads = await discoverGoogleAds(accessToken);

    assets.push(...ads.assets);

    if (ads.warning) {
      warnings.push(ads.warning);
    }
  } catch (error) {
    warnings.push(
      `Google Ads: ${
        error instanceof Error ? error.message : "Discovery failed."
      }`,
    );
  }

  return {
    assets,
    warnings,
  };
}
