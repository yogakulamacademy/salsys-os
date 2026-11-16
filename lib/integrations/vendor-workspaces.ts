import "server-only";

export type VendorWorkspace = "open-seo" | "deskcomm";

type Env = Record<string, string | undefined>;

export type VendorWorkspacePreview = {
  name: string;
  repository: string;
  configured: boolean;
  previewEnabled: boolean;
  url: string | null;
  warning: string | null;
};

/**
 * External OSS applications do not share SalsysOS authorization, database or
 * Meta sender state. This function provides an explicitly opt-in, link-only
 * operator preview. It must NOT be used as a webhook/HTTP client or as evidence
 * of cutover readiness.
 */
export function getVendorWorkspacePreview(
  kind: VendorWorkspace,
  env: Env = process.env,
): VendorWorkspacePreview {
  const isSeo = kind === "open-seo";
  const name = isSeo ? "OpenSEO" : "DeskcommCRM";
  const repository = isSeo
    ? "https://github.com/every-app/open-seo"
    : "https://github.com/melgarafael/DeskcommCRM";
  const raw = (isSeo ? env.SALSYS_OPENSEO_URL : env.SALSYS_DESKCOMM_URL)?.trim();
  const previewEnabled = env.SALSYS_VENDOR_WORKSPACE_PREVIEW === "true";

  if (!raw) {
    return {
      name,
      repository,
      configured: false,
      previewEnabled,
      url: null,
      warning: previewEnabled ? `${name} base URL is not configured.` : null,
    };
  }

  try {
    const parsed = new URL(raw);
    const localhost =
      parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1";
    const isSafeProtocol =
      parsed.protocol === "https:" ||
      (env.NODE_ENV !== "production" && parsed.protocol === "http:" && localhost);

    if (
      !isSafeProtocol ||
      !parsed.hostname ||
      parsed.username ||
      parsed.password ||
      parsed.search ||
      parsed.hash
    ) {
      throw new Error("URL must be HTTPS without credentials or query/fragment.");
    }

    return {
      name,
      repository,
      configured: true,
      previewEnabled,
      url: parsed.toString(),
      warning: null,
    };
  } catch {
    return {
      name,
      repository,
      configured: false,
      previewEnabled,
      url: null,
      warning: `Invalid ${name} base URL. Use HTTPS, no credentials or query string.`,
    };
  }
}
