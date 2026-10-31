type CanonicalRouteTarget = {
  pathname: string;
  view?: string;
};

const legacyWorkspaceRoutes: Record<string, CanonicalRouteTarget> = {
  "/crm": { pathname: "/home" },
  "/commercial-intelligence": { pathname: "/home" },
  "/campaigns": { pathname: "/marketing", view: "campaigns" },
  "/analytics": { pathname: "/marketing", view: "analytics" },
  "/funnel": { pathname: "/marketing", view: "funnel" },
  "/attribution": { pathname: "/marketing", view: "attribution" },
  "/contact-intelligence": { pathname: "/performance", view: "communication" },
};

export function canonicalizeWorkspaceHref(href: string) {
  if (!href.startsWith("/")) return href;

  try {
    const url = new URL(href, "https://salsys.local");
    const target = legacyWorkspaceRoutes[url.pathname];
    if (!target) return href;

    const nextParams = new URLSearchParams();
    if (target.view) nextParams.set("view", target.view);

    url.searchParams.forEach((value, key) => {
      if (key !== "view") nextParams.append(key, value);
    });

    const query = nextParams.toString();
    return `${target.pathname}${query ? `?${query}` : ""}${url.hash}`;
  } catch {
    return href;
  }
}
