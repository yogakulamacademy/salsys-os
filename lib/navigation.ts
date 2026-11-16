/**
 * Single source of truth for SalsysOS primary navigation.
 *
 * The sidebar, the page header ("where am I?") and workspace search all read
 * this map, so a destination has exactly one name and one location everywhere.
 * This file is intentionally dependency-free so it can be unit tested directly.
 */

export type NavSectionId =
  | "home"
  | "inbox"
  | "crm"
  | "marketing"
  | "revenue"
  | "operations"
  | "performance"
  | "automation"
  | "settings";

export type NavItem = {
  label: string;
  href: string;
  /** Plain-language summary shown in workspace search. */
  description?: string;
  /** Extra search terms (old names, synonyms). */
  keywords?: string;
};

export type NavSection = {
  id: NavSectionId;
  label: string;
  href: string;
  /** Routes that belong to this section without being menu items. */
  activeHrefs?: string[];
  items?: NavItem[];
  description?: string;
  keywords?: string;
};

export type NavAccess = {
  /** Admissions employee: sees only their own work. */
  employee: boolean;
  /** Owner, admin or manager. */
  privileged: boolean;
  /** Owner or admin. */
  admin: boolean;
};

export type NavLocation = {
  section: NavSection;
  item: NavItem | null;
  /** Small label above the title, e.g. "CRM". */
  sectionLabel: string;
  /** The page title, e.g. "Leads". */
  pageLabel: string;
};

export type NavDestination = {
  label: string;
  sectionLabel: string;
  href: string;
  description: string;
  keywords: string;
};

/**
 * Titles for real pages that are intentionally not menu items. They are opened
 * from inside a workspace, but the header must still name them correctly.
 */
const PAGE_TITLES: ReadonlyArray<readonly [string, string]> = [
  ["/leads/new", "New lead"],
  ["/leads/import", "Import leads"],
  ["/customer-360", "Customer 360"],
  ["/data-quality", "Data quality"],
  ["/pipeline", "Pipeline"],
  ["/team-performance", "Team performance"],
  ["/marketing/integrations", "Marketing integrations"],
  ["/marketing/tracking-sources", "Tracking sources"],
  ["/revenue/attribution", "Revenue attribution"],
  ["/revenue/valuation", "Revenue valuation"],
  ["/home/sources", "Source intelligence"],
  ["/settings/knowledge", "Knowledge library"],
  ["/settings/organizations", "Organizations"],
  ["/settings/assets", "Sales assets"],
  ["/settings/ai-insights", "AI pilot"],
  ["/settings/vendor-workspaces", "Vendor workspaces"],
  ["/system-health/message-sync", "Message sync"],
];

function cleanHref(href: string) {
  return href.split("?")[0];
}

/** Whether `pathname` is at or under `href`. Home routes match exactly. */
export function isPathActive(pathname: string, href: string) {
  const target = cleanHref(href);
  if (target === "/home") return pathname === "/home";
  if (target === "/dashboard") return pathname === "/dashboard";
  return pathname === target || pathname.startsWith(`${target}/`);
}

export function isSectionActive(pathname: string, section: NavSection) {
  if (isPathActive(pathname, section.href)) return true;
  return section.activeHrefs?.some((href) => isPathActive(pathname, href)) ?? false;
}

export function buildNavigation(access: NavAccess): NavSection[] {
  if (access.employee) {
    return [
      {
        id: "home",
        label: "Home",
        href: "/dashboard",
        description: "Your replies, follow-ups and priorities for today.",
        keywords: "today my work priorities dashboard",
        items: [{ label: "My work", href: "/dashboard" }],
      },
      {
        id: "inbox",
        label: "Inbox",
        href: "/conversations",
        description: "WhatsApp, Instagram and website conversations.",
        keywords: "conversations messages whatsapp instagram reply chat",
      },
      {
        id: "crm",
        label: "CRM",
        href: "/leads",
        activeHrefs: ["/pipeline", "/follow-ups", "/customer-360"],
        items: [
          {
            label: "My Leads",
            href: "/leads",
            description: "Leads assigned to you.",
            keywords: "leads contacts people",
          },
          {
            label: "My Pipeline",
            href: "/pipeline",
            description: "Your leads by stage.",
            keywords: "pipeline stages board",
          },
          {
            label: "Tasks & Follow-ups",
            href: "/follow-ups",
            description: "Due and overdue follow-ups.",
            keywords: "tasks follow ups reminders due overdue",
          },
        ],
      },
    ];
  }

  if (!access.privileged) return [];

  return [
    {
      id: "home",
      label: "Home",
      href: "/home",
      description: "What needs attention across leads, revenue and demand.",
      keywords: "command center today overview dashboard commercial intelligence",
      items: [{ label: "Command Center", href: "/home" }],
    },
    {
      id: "inbox",
      label: "Inbox",
      href: "/conversations",
      description: "WhatsApp, Instagram and website conversations.",
      keywords: "conversations messages whatsapp instagram reply chat",
    },
    {
      id: "crm",
      label: "CRM",
      href: "/leads",
      activeHrefs: [
        "/admissions",
        "/pipeline",
        "/follow-ups",
        "/customer-360",
        "/data-quality",
        "/re-engaged",
      ],
      items: [
        {
          label: "Leads",
          href: "/leads",
          description: "Every lead, with filters, owners and stages.",
          keywords: "leads contacts people customer 360",
        },
        {
          label: "Admissions",
          href: "/admissions",
          description: "Priority queue, pipeline, payments and capacity.",
          keywords: "admissions pipeline stages payments capacity",
        },
        {
          label: "Tasks & Follow-ups",
          href: "/follow-ups",
          description: "Due and overdue follow-ups.",
          keywords: "tasks follow ups reminders due overdue",
        },
        {
          label: "Re-engaged",
          href: "/re-engaged",
          description: "Leads that came back after going quiet.",
          keywords: "re-engaged returning lead activity reengagement",
        },
      ],
    },
    {
      id: "marketing",
      label: "Marketing",
      href: "/marketing",
      activeHrefs: [
        "/campaigns",
        "/paid-media-leads",
        "/analytics",
        "/funnel",
        "/attribution",
        "/seo",
        "/commercial-intelligence",
      ],
      items: [
        {
          label: "Marketing Workspace",
          href: "/marketing",
          description: "Campaigns, analytics, funnel and attribution in one place.",
          keywords: "campaigns analytics funnel attribution growth ga4 ads",
        },
        {
          label: "Acquisition Leads",
          href: "/paid-media-leads",
          description: "Leads matched to paid campaigns, with cost.",
          keywords: "paid media google ads meta ads cost per lead",
        },
        {
          label: "Search Intelligence",
          href: "/seo",
          description: "Search performance and content opportunities.",
          keywords: "seo aeo geo search console organic keywords",
        },
      ],
    },
    {
      id: "revenue",
      label: "Revenue",
      href: "/revenue",
      description: "Collected, outstanding and forecast revenue.",
      keywords: "revenue payments outstanding forecast refund collected",
      items: [{ label: "Revenue workspace", href: "/revenue" }],
    },
    {
      id: "operations",
      label: "Operations",
      href: "/operations",
      activeHrefs: ["/availability", "/course-management", "/enrollments"],
      items: [
        {
          label: "Overview",
          href: "/operations",
          description: "Programs, upcoming batches and demand.",
          keywords: "operations programs batches demand",
        },
        {
          label: "Availability",
          href: "/availability",
          description: "Seats remaining in each batch.",
          keywords: "availability seats capacity overbooking",
        },
        {
          label: "Programs & Batches",
          href: "/course-management",
          description: "Courses, batch dates, prices and capacity.",
          keywords: "courses batches course management catalog prices",
        },
        {
          label: "Enrollments",
          href: "/enrollments",
          description: "Confirmed, pending and cancelled enrollments.",
          keywords: "enrollments enrolled students bookings",
        },
      ],
    },
    {
      id: "performance",
      label: "Performance",
      href: "/performance",
      activeHrefs: ["/team-performance", "/contact-intelligence", "/team"],
      items: [
        {
          label: "Performance Workspace",
          href: "/performance",
          description: "Team workload, response and communication.",
          keywords: "performance team workload response communication",
        },
        {
          label: "Team Directory",
          href: "/team",
          description: "Who is on the team and what they own.",
          keywords: "team members directory staff",
        },
      ],
    },
    {
      id: "automation",
      label: "Automation",
      href: "/automation",
      description: "Workflows, templates, approvals and runs.",
      keywords: "automation workflows templates whatsapp instagram approvals triggers",
      items: [{ label: "Workflows", href: "/automation" }],
    },
    {
      id: "settings",
      label: "Settings",
      href: "/settings/overview",
      activeHrefs: [
        "/settings",
        "/settings/integrations",
        "/settings/team",
        "/settings/knowledge",
        "/settings/organizations",
        "/tracking",
        "/system-health",
      ],
      items: [
        {
          label: "Overview",
          href: "/settings/overview",
          description: "Setup status and quick actions.",
          keywords: "settings setup overview",
        },
        ...(access.admin
          ? [
              {
                label: "Integrations",
                href: "/settings/integrations",
                description: "Google, Meta, WhatsApp and Instagram connections.",
                keywords: "integrations connections google meta whatsapp instagram oauth",
              },
              {
                label: "Team & Permissions",
                href: "/settings/team",
                description: "Members, roles and invitations.",
                keywords: "team access roles permissions invite members",
              },
              {
                label: "Tracking & Data",
                href: "/tracking",
                description: "Website tracking, consent and data coverage.",
                keywords: "tracking consent sessions forms data coverage snippet",
              },
              {
                label: "System Health",
                href: "/system-health",
                description: "Sync status, failures and data freshness.",
                keywords: "system health sync failures status freshness",
              },
            ]
          : []),
        {
          label: "Settings",
          href: "/settings",
          description: "Stage rules, providers and security.",
          keywords: "settings rules configuration security",
        },
      ],
    },
  ];
}

/**
 * Resolve where a pathname sits in the navigation. The most specific menu item
 * wins; otherwise the owning section is used. Returns null when the current
 * role has no section for this route.
 */
export function resolveLocation(
  pathname: string,
  sections: NavSection[],
): NavLocation | null {
  let best: { section: NavSection; item: NavItem } | null = null;

  for (const section of sections) {
    for (const item of section.items ?? []) {
      if (!isPathActive(pathname, item.href)) continue;
      if (!best || cleanHref(item.href).length > cleanHref(best.item.href).length) {
        best = { section, item };
      }
    }
  }

  const section =
    sections.find((candidate) => isSectionActive(pathname, candidate)) ??
    best?.section ??
    null;
  if (!section) return null;

  // An item only names the page when it belongs to the section that owns the
  // route; otherwise the sidebar highlight and the header would disagree.
  const item = best && best.section.id === section.id ? best.item : null;

  let title: string | null = null;
  let titleLength = 0;
  for (const [href, label] of PAGE_TITLES) {
    if (isPathActive(pathname, href) && href.length > titleLength) {
      title = label;
      titleLength = href.length;
    }
  }

  const itemLength = item ? cleanHref(item.href).length : 0;
  const pageLabel =
    title && titleLength > itemLength ? title : (item?.label ?? section.label);

  return { section, item, sectionLabel: section.label, pageLabel };
}

/** Flat list of everything the current role can open, for workspace search. */
export function listDestinations(sections: NavSection[]): NavDestination[] {
  const seen = new Set<string>();
  const destinations: NavDestination[] = [];

  for (const section of sections) {
    const entries: NavItem[] = section.items?.length
      ? section.items
      : [{ label: section.label, href: section.href }];

    for (const entry of entries) {
      if (seen.has(entry.href)) continue;
      seen.add(entry.href);
      destinations.push({
        label: entry.label,
        sectionLabel: section.label,
        href: entry.href,
        description: entry.description ?? section.description ?? "",
        keywords: `${entry.keywords ?? ""} ${section.keywords ?? ""}`.trim(),
      });
    }
  }

  return destinations;
}

/** Case-insensitive match of every query word against a destination. */
export function searchDestinations(
  query: string,
  destinations: NavDestination[],
): NavDestination[] {
  const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return [];

  return destinations.filter((destination) => {
    const haystack =
      `${destination.label} ${destination.sectionLabel} ${destination.description} ${destination.keywords}`.toLowerCase();
    return words.every((word) => haystack.includes(word));
  });
}
