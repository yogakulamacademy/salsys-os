export const FUNCTIONAL_WORKSPACE_CODES = [
  "sales",
  "marketing",
  "finance",
  "reports",
  "admin",
] as const;

export type FunctionalWorkspaceCode =
  (typeof FUNCTIONAL_WORKSPACE_CODES)[number];

export type FunctionalWorkspaceAccessRole =
  | "owner"
  | "admin"
  | "manager"
  | "member"
  | "viewer"
  | "service_role";

export type FunctionalWorkspaceDefinition = {
  code: FunctionalWorkspaceCode;
  name: string;
  rootPath: string;
  landingPath: string;
  routePrefixes: readonly string[];
  apiPrefixes?: readonly string[];
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
    apiPrefixes: [
      "/api/analytics",
      "/api/tracking/health",
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
    apiPrefixes: [
      "/api/integrations",
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

const UUID_PATTERN =
  "[0-9a-fA-F]{8}-" +
  "[0-9a-fA-F]{4}-" +
  "[0-9a-fA-F]{4}-" +
  "[0-9a-fA-F]{4}-" +
  "[0-9a-fA-F]{12}";

const SALES_MEMBER_LEAD_ROUTE = new RegExp(
  `^/leads/${UUID_PATTERN}(?:/edit)?$`,
);

const SALES_MEMBER_EXACT_PATHS = new Set([
  "/workspace/sales",
  "/dashboard",
  "/leads",
  "/pipeline",
  "/conversations",
  "/follow-ups",
]);

function normalizePathname(pathname: string) {
  const trimmed = pathname.trim();

  if (!trimmed) {
    return "/";
  }

  const queryIndex = trimmed.indexOf("?");
  const hashIndex = trimmed.indexOf("#");
  const endIndexes = [queryIndex, hashIndex].filter((index) => index >= 0);
  const pathOnly =
    endIndexes.length > 0
      ? trimmed.slice(0, Math.min(...endIndexes))
      : trimmed;

  if (pathOnly.length > 1 && pathOnly.endsWith("/")) {
    return pathOnly.slice(0, -1);
  }

  return pathOnly || "/";
}

function matchesRoutePrefix(pathname: string, routePrefix: string) {
  return pathname === routePrefix || pathname.startsWith(`${routePrefix}/`);
}

function definitionMatchesPathname(
  definition: FunctionalWorkspaceDefinition,
  pathname: string,
) {
  const normalizedPath = normalizePathname(pathname);
  const prefixes = [
    ...definition.routePrefixes,
    ...(definition.apiPrefixes ?? []),
  ];

  return prefixes.some((routePrefix) =>
    matchesRoutePrefix(normalizedPath, routePrefix),
  );
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
  for (const workspace of FUNCTIONAL_WORKSPACE_DEFINITIONS) {
    if (definitionMatchesPathname(workspace, pathname)) {
      return workspace;
    }
  }

  return null;
}

export function isUsableFunctionalWorkspaceRole(role: string) {
  const normalizedRole = role.trim().toLowerCase();

  return (
    normalizedRole === "owner" ||
    normalizedRole === "admin" ||
    normalizedRole === "manager" ||
    normalizedRole === "member" ||
    normalizedRole === "service_role"
  );
}

export function isFunctionalWorkspaceRouteAllowed(
  workspaceCode: string,
  role: string,
  pathname: string,
) {
  const definition = getFunctionalWorkspaceDefinition(workspaceCode);
  const normalizedRole = role.trim().toLowerCase();
  const normalizedPath = normalizePathname(pathname);

  if (!definition || !definitionMatchesPathname(definition, normalizedPath)) {
    return false;
  }

  if (
    normalizedRole === "owner" ||
    normalizedRole === "admin" ||
    normalizedRole === "manager" ||
    normalizedRole === "service_role"
  ) {
    return true;
  }

  if (normalizedRole !== "member") {
    return false;
  }

  if (definition.code !== "sales") {
    return true;
  }

  if (SALES_MEMBER_EXACT_PATHS.has(normalizedPath)) {
    return true;
  }

  return SALES_MEMBER_LEAD_ROUTE.test(normalizedPath);
}

export function isSafeFunctionalWorkspaceDestination(value: string) {
  if (!value.startsWith("/") || value.startsWith("//")) {
    return false;
  }

  const normalizedPath = normalizePathname(value);
  const definition = getFunctionalWorkspaceForPathname(normalizedPath);

  return definition?.rootPath === normalizedPath;
}

export function getFunctionalWorkspaceLandingPath(code: string) {
  return getFunctionalWorkspaceDefinition(code)?.landingPath ?? null;
}

export function getFunctionalWorkspaceRootPath(code: string) {
  return getFunctionalWorkspaceDefinition(code)?.rootPath ?? null;
}
