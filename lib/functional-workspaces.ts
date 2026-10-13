export const FUNCTIONAL_WORKSPACE_CODES = [
  "sales",
  "marketing",
  "finance",
  "reports",
  "admin",
] as const;

export type FunctionalWorkspaceCode =
  (typeof FUNCTIONAL_WORKSPACE_CODES)[number];

export type FunctionalWorkspaceDefinition = {
  code: FunctionalWorkspaceCode;
  name: string;
  rootPath: string;
  landingPath: string;
  routePrefixes: readonly string[];
};

export const FUNCTIONAL_WORKSPACE_DEFINITIONS: readonly FunctionalWorkspaceDefinition[] = [
  {
    code: "sales",
    name: "Sales",
    rootPath: "/workspace/sales",
    landingPath: "/dashboard",
    routePrefixes: [
      "/workspace/sales",
      "/dashboard",
      "/admissions",
      "/leads",
      "/pipeline",
      "/conversations",
      "/follow-ups",
      "/re-engaged",
    ],
  },
  {
    code: "marketing",
    name: "Marketing",
    rootPath: "/workspace/marketing",
    landingPath: "/campaigns",
    routePrefixes: [
      "/workspace/marketing",
      "/campaigns",
      "/paid-media-leads",
      "/analytics",
      "/attribution",
      "/seo",
      "/tracking",
    ],
  },
  {
    code: "finance",
    name: "Finance",
    rootPath: "/workspace/finance",
    landingPath: "/revenue",
    routePrefixes: [
      "/workspace/finance",
      "/revenue",
    ],
  },
  {
    code: "reports",
    name: "Reports",
    rootPath: "/workspace/reports",
    landingPath: "/funnel",
    routePrefixes: [
      "/workspace/reports",
      "/funnel",
      "/team-performance",
      "/contact-intelligence",
    ],
  },
  {
    code: "admin",
    name: "Admin",
    rootPath: "/workspace/admin",
    landingPath: "/settings",
    routePrefixes: [
      "/workspace/admin",
      "/settings",
      "/course-management",
      "/system-health",
    ],
  },
] as const;

const FUNCTIONAL_WORKSPACES_BY_CODE = new Map<
  FunctionalWorkspaceCode,
  FunctionalWorkspaceDefinition
>(
  FUNCTIONAL_WORKSPACE_DEFINITIONS.map((workspace) => [
    workspace.code,
    workspace,
  ]),
);

function normalizePathname(pathname: string) {
  const trimmed = pathname.trim();

  if (!trimmed) {
    return "/";
  }

  if (trimmed.length > 1 && trimmed.endsWith("/")) {
    return trimmed.slice(0, -1);
  }

  return trimmed;
}

function matchesRoutePrefix(pathname: string, routePrefix: string) {
  return pathname === routePrefix || pathname.startsWith(`${routePrefix}/`);
}

export function isFunctionalWorkspaceCode(
  value: string,
): value is FunctionalWorkspaceCode {
  return FUNCTIONAL_WORKSPACE_CODES.includes(
    value as FunctionalWorkspaceCode,
  );
}

export function getFunctionalWorkspaceDefinition(
  code: string,
): FunctionalWorkspaceDefinition | null {
  const normalizedCode = code.trim().toLowerCase();

  if (!isFunctionalWorkspaceCode(normalizedCode)) {
    return null;
  }

  return FUNCTIONAL_WORKSPACES_BY_CODE.get(normalizedCode) ?? null;
}

export function getFunctionalWorkspaceForPathname(
  pathname: string,
): FunctionalWorkspaceDefinition | null {
  const normalizedPath = normalizePathname(pathname);

  for (const workspace of FUNCTIONAL_WORKSPACE_DEFINITIONS) {
    if (
      workspace.routePrefixes.some((routePrefix) =>
        matchesRoutePrefix(normalizedPath, routePrefix),
      )
    ) {
      return workspace;
    }
  }

  return null;
}

export function getFunctionalWorkspaceLandingPath(code: string) {
  return getFunctionalWorkspaceDefinition(code)?.landingPath ?? null;
}

export function getFunctionalWorkspaceRootPath(code: string) {
  return getFunctionalWorkspaceDefinition(code)?.rootPath ?? null;
}
