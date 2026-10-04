"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Activity,
  BarChart3,
  Bell,
  BookOpen,
  Boxes,
  ChevronDown,
  CircleDollarSign,
  ClipboardCheck,
  ContactRound,
  FileSearch,
  Gauge,
  GitBranch,
  LineChart,
  ListTodo,
  LogOut,
  Megaphone,
  Menu,
  MessageSquareText,
  Plus,
  PlugZap,
  RefreshCw,
  Search,
  Settings,
  ShieldCheck,
  Tags,
  Target,
  UsersRound,
  X,
} from "lucide-react";
import {
  type ComponentType,
  type ReactNode,
  useEffect,
  useMemo,
  useState,
} from "react";
import { signOutAction } from "@/app/actions/auth";
import { LiveRefresh } from "@/components/live-refresh";
import { ThemeToggle } from "@/components/theme-toggle";
import { createClient as createBrowserClient } from "@/lib/supabase/browser";

type NavItem = {
  href: string;
  label: string;
  icon: ComponentType<{
    size?: number | string;
    strokeWidth?: number;
    className?: string;
  }>;
};

type NavGroup = {
  label: string;
  items: NavItem[];
};

type ShellProfile = {
  fullName: string;
  email: string | null;
  role: string | null;
  active: boolean;
};

type WorkspaceMembership = {
  organizationId: string;
  organizationName: string;
  organizationSlug: string;
  role: string;
};

type WorkspaceContext = {
  activeOrganizationId: string | null;
  activeWorkspace: WorkspaceMembership | null;
  memberships: WorkspaceMembership[];
  selectionRequired: boolean;
};

const adminNavGroups: NavGroup[] = [
  {
    label: "Workspace",
    items: [
      { href: "/dashboard", label: "Dashboard", icon: Gauge },
      { href: "/admissions", label: "Admissions Desk", icon: ClipboardCheck },
      { href: "/leads", label: "Leads", icon: ContactRound },
      { href: "/pipeline", label: "Pipeline", icon: Boxes },
      {
        href: "/conversations",
        label: "Conversations",
        icon: MessageSquareText,
      },
      { href: "/follow-ups", label: "Follow-ups", icon: ListTodo },
    ],
  },
  {
    label: "Operations",
    items: [
      {
        href: "/course-management",
        label: "Course Management",
        icon: BookOpen,
      },
    ],
  },
  {
    label: "Growth",
    items: [
      { href: "/campaigns", label: "Campaigns", icon: Target },
      { href: "/paid-media-leads", label: "Paid Media Leads", icon: Megaphone },
      { href: "/re-engaged", label: "Lead Activity", icon: RefreshCw },
    ],
  },
  {
    label: "Insights",
    items: [
      { href: "/analytics", label: "Analytics", icon: BarChart3 },
      { href: "/funnel", label: "Funnel", icon: GitBranch },
      { href: "/attribution", label: "Attribution", icon: LineChart },
      { href: "/seo", label: "SEO", icon: FileSearch },
      { href: "/revenue", label: "Revenue Forecast", icon: CircleDollarSign },
      { href: "/tracking", label: "Tracking", icon: Tags },
    ],
  },
  {
    label: "System",
    items: [{ href: "/settings", label: "Settings", icon: Settings }],
  },
];

const adminOnlyTeamNavGroup: NavGroup = {
  label: "Team",
  items: [
    {
      href: "/team-performance",
      label: "Team Performance",
      icon: UsersRound,
    },
    {
      href: "/contact-intelligence",
      label: "Contact Intelligence",
      icon: Activity,
    },
    {
      href: "/settings/team",
      label: "Team & Access",
      icon: ShieldCheck,
    },
  ],
};

const adminOnlySystemNavGroup: NavGroup = {
  label: "System",
  items: [
    { href: "/settings", label: "Settings", icon: Settings },
    {
      href: "/settings/integrations",
      label: "Integrations",
      icon: PlugZap,
    },
    { href: "/system-health", label: "System Health", icon: Activity },
  ],
};

const employeeNavGroups: NavGroup[] = [
  {
    label: "My workspace",
    items: [
      { href: "/dashboard", label: "My Dashboard", icon: Gauge },
      { href: "/leads", label: "My Leads", icon: ContactRound },
      { href: "/pipeline", label: "My Pipeline", icon: Boxes },
      {
        href: "/conversations",
        label: "Conversations",
        icon: MessageSquareText,
      },
      { href: "/follow-ups", label: "Follow-ups", icon: ListTodo },
    ],
  },
];

function isNavActive(pathname: string, href: string) {
  if (href === "/settings") {
    return pathname === "/settings";
  }

  return pathname === href || pathname.startsWith(`${href}/`);
}

function BrandMark() {
  return (
    <div className="topbar-brand-mark" aria-hidden="true">
      <span>YK</span>
    </div>
  );
}

function initials(name: string) {
  const value = name
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return value || "YK";
}

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [profile, setProfile] = useState<ShellProfile | null>(null);
  const [profileLoading, setProfileLoading] = useState(true);
  const [workspace, setWorkspace] = useState<WorkspaceContext | null>(null);
  const [workspaceLoading, setWorkspaceLoading] = useState(true);
  const [workspaceSwitching, setWorkspaceSwitching] = useState(false);

  const mock = process.env.NEXT_PUBLIC_USE_MOCK_DATA !== "false";

  const activeWorkspace = workspace?.activeWorkspace ?? null;
  const workspaceMemberships = workspace?.memberships ?? [];

  const effectiveRole = mock
    ? "admin"
    : activeWorkspace?.role ?? null;

  const employee = !mock && effectiveRole === "admissions";
  const admin =
    mock ||
    effectiveRole === "owner" ||
    effectiveRole === "admin";
  const manager = !mock && effectiveRole === "manager";
  const explicitAdmin = admin || manager;
  const accessResolved =
    mock || (!profileLoading && !workspaceLoading);

  // Admin-only Team and System Health remain hidden from managers.
  const visibleAdminNavGroups = admin
    ? [
        adminNavGroups[0],
        adminNavGroups[1],
        adminOnlyTeamNavGroup,
        ...adminNavGroups.slice(2, -1),
        adminOnlySystemNavGroup,
      ]
    : adminNavGroups;

  // Never guess the employee menu while the authenticated role is loading.
  // Unknown/unsupported roles receive no privileged navigation.
  const visibleNavGroups: NavGroup[] = !accessResolved
    ? []
    : explicitAdmin
      ? visibleAdminNavGroups
      : employee
        ? employeeNavGroups
        : [];

  const visibleNav = visibleNavGroups.flatMap((group) => group.items);

  const current = useMemo(
    () =>
      visibleNav.find((item) => isNavActive(pathname, item.href))?.label ??
      (employee ? "Admissions Workspace" : "Growth CRM"),
    [pathname, visibleNav, employee],
  );

  useEffect(() => {
    let cancelled = false;

    async function loadProfile() {
      if (mock) {
        if (!cancelled) {
          setProfile({
            fullName: "CRM User",
            email: null,
            role: "admin",
            active: true,
          });
          setProfileLoading(false);
        }
        return;
      }

      try {
        const supabase = createBrowserClient();
        const {
          data: { user },
        } = await supabase.auth.getUser();

        if (!user) {
          if (!cancelled) {
            setProfile(null);
            setProfileLoading(false);
          }
          return;
        }

        const { data } = await supabase
          .from("profiles")
          .select("full_name,role,active")
          .eq("id", user.id)
          .maybeSingle();

        if (!cancelled) {
          setProfile({
            fullName: data?.full_name?.trim() || "CRM User",
            email: user.email ?? null,
            role: data?.role ?? null,
            active: data?.active === true,
          });
          setProfileLoading(false);
        }
      } catch {
        if (!cancelled) {
          setProfile(null);
          setProfileLoading(false);
        }
      }
    }

    void loadProfile();

    return () => {
      cancelled = true;
    };
  }, [mock]);

  useEffect(() => {
    let cancelled = false;

    async function loadWorkspace() {
      if (mock) {
        if (!cancelled) {
          setWorkspace(null);
          setWorkspaceLoading(false);
        }

        return;
      }

      try {
        const response = await fetch("/api/workspace", {
          cache: "no-store",
        });

        if (!response.ok) {
          throw new Error("Unable to load workspace.");
        }

        const data = (await response.json()) as WorkspaceContext;

        if (!cancelled) {
          setWorkspace(data);
          setWorkspaceLoading(false);
        }
      } catch {
        if (!cancelled) {
          setWorkspace(null);
          setWorkspaceLoading(false);
        }
      }
    }

    void loadWorkspace();

    return () => {
      cancelled = true;
    };
  }, [mock]);

  useEffect(() => {
    setMobileOpen(false);

    document
      .querySelectorAll<HTMLDetailsElement>(
        "details.topbar-notification-menu, details.topbar-profile-menu",
      )
      .forEach((details) => {
        details.open = false;
      });
  }, [pathname]);

  useEffect(() => {
    const selector =
      "details.topbar-notification-menu, details.topbar-profile-menu";

    function closeMenus(except: HTMLDetailsElement | null = null) {
      document
        .querySelectorAll<HTMLDetailsElement>(selector)
        .forEach((details) => {
          if (details !== except) {
            details.open = false;
          }
        });
    }

    function handlePointerDown(event: PointerEvent) {
      const target = event.target;

      if (!(target instanceof Element)) {
        closeMenus();
        return;
      }

      const clickedMenu = target.closest(selector) as HTMLDetailsElement | null;

      if (!clickedMenu) {
        closeMenus();
        return;
      }

      // Opening/clicking one popover closes the other one.
      closeMenus(clickedMenu);
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        closeMenus();
      }
    }

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, []);

  useEffect(() => {
    if (!mobileOpen) return;

    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = previous;
    };
  }, [mobileOpen]);

  async function handleWorkspaceChange(
    organizationId: string,
  ) {
    if (
      !organizationId ||
      workspaceSwitching ||
      organizationId === activeWorkspace?.organizationId
    ) {
      return;
    }

    setWorkspaceSwitching(true);

    try {
      const response = await fetch("/api/workspace", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          organizationId,
        }),
      });

      if (!response.ok) {
        const body = await response
          .json()
          .catch(() => null);

        throw new Error(
          body?.error || "Unable to switch workspace.",
        );
      }

      window.location.assign("/dashboard");
    } catch (error) {
      setWorkspaceSwitching(false);

      window.alert(
        error instanceof Error
          ? error.message
          : "Unable to switch workspace.",
      );
    }
  }

  if (pathname.startsWith("/login")) {
    return <>{children}</>;
  }

  const displayName = profile?.fullName || "CRM User";
  const displayEmail = profile?.email || "";
  const roleLabel = employee
    ? "Employee"
    : effectiveRole === "owner"
      ? "Owner"
      : effectiveRole === "admin"
        ? "Admin"
        : effectiveRole === "manager"
          ? "Manager"
          : effectiveRole === "viewer"
            ? "Viewer"
            : mock
              ? "Development access"
              : profile
                ? "Authenticated"
                : "Access unavailable";

  const organizationName =
    activeWorkspace?.organizationName ||
    (mock ? "Yogakulam" : "Workspace");

  return (
    <div className="app-shell app-shell-v3">
      <LiveRefresh enabled={!mock} />

      <header className="shell-topbar">
        <div className="topbar-brand">
          <BrandMark />
          <div className="topbar-brand-copy">
            <div className="topbar-brand-name">{organizationName}</div>
            <div className="topbar-product-name">
              {employee ? "Admissions CRM" : "Growth CRM · v0.9 Beta"}
            </div>
          </div>
        </div>

        <button
          type="button"
          className="topbar-icon-btn topbar-menu-btn lg:hidden"
          onClick={() => setMobileOpen((value) => !value)}
          aria-label="Toggle navigation"
        >
          <Menu size={18} />
        </button>

        <form action="/leads" method="get" className="global-search">
          <Search size={15} className="global-search-icon" />
          <input
            name="q"
            placeholder={
              employee
                ? "Search my leads..."
                : "Search lead, course or country..."
            }
            aria-label="Search leads"
          />
          <kbd>Enter</kbd>
        </form>

        <div className="topbar-actions">
          {!mock && workspaceMemberships.length > 1 && (
            <select
              aria-label="Select school workspace"
              value={activeWorkspace?.organizationId ?? ""}
              disabled={workspaceSwitching}
              onChange={(event) =>
                void handleWorkspaceChange(event.target.value)
              }
              className="hidden max-w-[220px] rounded-lg border border-white/20 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-900 outline-none md:block"
            >
              {!activeWorkspace && (
                <option value="">Select school</option>
              )}

              {workspaceMemberships.map((membership) => (
                <option
                  key={membership.organizationId}
                  value={membership.organizationId}
                >
                  {membership.organizationName}
                </option>
              ))}
            </select>
          )}

          {!employee &&
            !profileLoading &&
            !workspaceLoading && (
            <Link
              href="/leads/new"
              className="topbar-new-button hidden sm:inline-flex"
            >
              <Plus size={15} />
              New
            </Link>
          )}

          <details className="topbar-notification-menu">
            <summary
              className="topbar-icon-btn topbar-notification-trigger"
              aria-label="Open notifications"
            >
              <Bell size={17} />
            </summary>

            <div className="topbar-notification-popover">
              <div className="topbar-todo-head">
                <div>
                  <div className="topbar-todo-title">Your to-dos</div>
                  <div className="topbar-todo-subtitle">
                    Priority CRM queues that may need your attention.
                  </div>
                </div>

                <Link href="/dashboard" className="topbar-todo-view-all">
                  Dashboard
                </Link>
              </div>

              <div className="topbar-todo-list">
                {!employee && (
                  <Link href="/admissions" className="topbar-todo-card">
                    <span className="topbar-todo-icon">
                      <ClipboardCheck size={16} />
                    </span>

                    <span className="topbar-todo-copy">
                      <span className="topbar-todo-card-title">
                        <span className="topbar-todo-dot" aria-hidden="true" />
                        Admissions priorities
                      </span>
                      <small>
                        Review SLA pressure, priority workload and conversion
                        signals.
                      </small>
                    </span>

                    <ChevronDown size={15} className="topbar-todo-chevron" />
                  </Link>
                )}

                <Link href="/follow-ups" className="topbar-todo-card">
                  <span className="topbar-todo-icon">
                    <ListTodo size={16} />
                  </span>

                  <span className="topbar-todo-copy">
                    <span className="topbar-todo-card-title">
                      <span className="topbar-todo-dot" aria-hidden="true" />
                      Follow-ups
                    </span>
                    <small>
                      Check due and overdue tasks before they become stale.
                    </small>
                  </span>

                  <ChevronDown size={15} className="topbar-todo-chevron" />
                </Link>

                <Link href="/conversations" className="topbar-todo-card">
                  <span className="topbar-todo-icon">
                    <MessageSquareText size={16} />
                  </span>

                  <span className="topbar-todo-copy">
                    <span className="topbar-todo-card-title">
                      <span className="topbar-todo-dot" aria-hidden="true" />
                      Conversations
                    </span>
                    <small>
                      Open replies and active conversations that need attention.
                    </small>
                  </span>

                  <ChevronDown size={15} className="topbar-todo-chevron" />
                </Link>

                {!employee && (
                  <Link href="/re-engaged" className="topbar-todo-card">
                    <span className="topbar-todo-icon">
                      <RefreshCw size={16} />
                    </span>

                    <span className="topbar-todo-copy">
                      <span className="topbar-todo-card-title">
                        <span className="topbar-todo-dot" aria-hidden="true" />
                        Lead activity
                      </span>
                      <small>
                        Review hot and re-engaged leads returning to the funnel.
                      </small>
                    </span>

                    <ChevronDown size={15} className="topbar-todo-chevron" />
                  </Link>
                )}

                {admin && (
                  <Link href="/system-health" className="topbar-todo-card">
                    <span className="topbar-todo-icon">
                      <Activity size={16} />
                    </span>

                    <span className="topbar-todo-copy">
                      <span className="topbar-todo-card-title">
                        <span className="topbar-todo-dot" aria-hidden="true" />
                        System health
                      </span>
                      <small>
                        Check processing, integrations and operational warnings.
                      </small>
                    </span>

                    <ChevronDown size={15} className="topbar-todo-chevron" />
                  </Link>
                )}
              </div>
            </div>
          </details>

          <details className="topbar-profile-menu">
            <summary
              className="topbar-profile-trigger"
              aria-label="Open account menu"
            >
              <div className="topbar-avatar">{initials(displayName)}</div>

              <div className="topbar-profile-copy hidden xl:block">
                <div className="topbar-profile-name">{displayName}</div>
                <div className="topbar-profile-role">
                  {profileLoading || workspaceLoading ? "Loading access…" : roleLabel}
                </div>
              </div>

              <ChevronDown
                size={14}
                className="topbar-profile-chevron hidden xl:block"
              />
            </summary>

            <div className="topbar-profile-popover topbar-account-popover">
              <div className="topbar-account-head">
                <div className="topbar-account-name">{displayName}</div>

                {displayEmail ? (
                  <div className="topbar-account-email">{displayEmail}</div>
                ) : (
                  <div className="topbar-account-email">{roleLabel}</div>
                )}
              </div>

              <div className="topbar-profile-divider" />

              <div className="topbar-account-menu">
                {explicitAdmin && (
                  <Link href="/settings" className="topbar-account-row">
                    <Settings size={17} />
                    <span>CRM settings</span>
                  </Link>
                )}

                {admin && (
                  <Link
                    href="/settings/integrations"
                    className="topbar-account-row"
                  >
                    <PlugZap size={17} />
                    <span>Integrations</span>
                  </Link>
                )}

                {admin && (
                  <Link href="/settings/team" className="topbar-account-row">
                    <UsersRound size={17} />
                    <span>Team &amp; access</span>
                  </Link>
                )}

                {admin && (
                  <Link href="/system-health" className="topbar-account-row">
                    <Activity size={17} />
                    <span>System health</span>
                  </Link>
                )}
              </div>

              {(explicitAdmin || admin) && (
                <div className="topbar-profile-divider" />
              )}

              <div className="topbar-account-row topbar-account-theme-row">
                <span className="topbar-account-theme-copy">
                  <Settings size={17} />
                  <span>Appearance</span>
                </span>
                <ThemeToggle />
              </div>

              {!mock && (
                <>
                  <div className="topbar-profile-divider" />

                  <form action={signOutAction}>
                    <button
                      type="submit"
                      className="topbar-account-row topbar-account-logout"
                    >
                      <LogOut size={17} />
                      <span>Log out</span>
                    </button>
                  </form>
                </>
              )}
            </div>
          </details>
        </div>
      </header>

      {mobileOpen && (
        <button
          type="button"
          className="shell-backdrop lg:hidden"
          aria-label="Close navigation"
          onClick={() => setMobileOpen(false)}
        />
      )}

      <aside
        className={`shell-sidebar ${mobileOpen ? "shell-sidebar-open" : ""}`}
      >
        <div className="sidebar-mobile-head lg:hidden">
          <span>Menu</span>
          <button
            type="button"
            className="sidebar-close"
            onClick={() => setMobileOpen(false)}
            aria-label="Close navigation"
          >
            <X size={17} />
          </button>
        </div>

        <form
          action="/leads"
          method="get"
          className="mobile-menu-search lg:hidden"
          onSubmit={() => setMobileOpen(false)}
        >
          <Search size={16} className="mobile-menu-search-icon" />
          <input
            name="q"
            placeholder={
              employee
                ? "Search my leads..."
                : "Search lead, course or country..."
            }
            aria-label="Search leads from mobile menu"
          />
        </form>

        <nav className="sidebar-nav">
          {!mock && (profileLoading || workspaceLoading) ? (
            <div className="px-3 py-3 text-xs font-medium text-slate-400">
              Loading workspace…
            </div>
          ) : (
            visibleNavGroups.map((group) => (
              <div key={group.label} className="sidebar-group">
                <div className="sidebar-group-label">{group.label}</div>

                <div className="sidebar-group-items">
                  {group.items.map((item) => {
                    const Icon = item.icon;
                    const active = isNavActive(pathname, item.href);

                    return (
                      <Link
                        key={item.href}
                        href={item.href}
                        className={`nav-item ${active ? "nav-item-active" : ""}`}
                      >
                        <span className="nav-icon-wrap">
                          <Icon size={18} strokeWidth={1.8} />
                        </span>
                        <span className="nav-item-label">{item.label}</span>
                      </Link>
                    );
                  })}
                </div>
              </div>
            ))
          )}
        </nav>

        <div className="sidebar-footer-status">
          <span
            className={`sidebar-footer-dot ${mock ? "is-dev" : "is-live"}`}
            aria-hidden="true"
          />
          <span>
            {mock ? "Development" : employee ? "Assigned workspace" : "Live"}
          </span>
        </div>
      </aside>

      <div className="shell-content">
        <main className="shell-main">
          <div key={pathname} className="page-transition">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
