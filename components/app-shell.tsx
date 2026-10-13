"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Activity,
  BarChart3,
  Bell,
  BookOpen,
  Boxes,
  Building2,
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
  useState,
} from "react";
import { signOutAction } from "@/app/actions/auth";
import { LiveRefresh } from "@/components/live-refresh";
import { ThemeToggle } from "@/components/theme-toggle";
import {
  FUNCTIONAL_WORKSPACE_DEFINITIONS,
  getFunctionalWorkspaceForPathname,
  getFunctionalWorkspaceRootPath,
  isFunctionalWorkspaceRouteAllowed,
} from "@/lib/functional-workspaces";
import { createClient as createBrowserClient } from "@/lib/supabase/browser";

type NavItem = {
  href: string;
  label: string;
  icon: ComponentType<{
    size?: number | string;
    strokeWidth?: number;
    className?: string;
  }>;
  organizationAdminOnly?: boolean;
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

type FunctionalWorkspaceAccess = {
  organizationId: string;
  code: string;
  name: string;
  description: string;
  role: string;
  sortOrder: number;
};

type WorkspaceContext = {
  activeOrganizationId: string | null;
  activeWorkspace: WorkspaceMembership | null;
  memberships: WorkspaceMembership[];
  functionalWorkspaces: FunctionalWorkspaceAccess[];
  selectionRequired: boolean;
};

const workspaceNavGroups: Record<string, NavGroup[]> = {
  sales: [
    {
      label: "Sales",
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
        { href: "/re-engaged", label: "Lead Activity", icon: RefreshCw },
      ],
    },
  ],
  marketing: [
    {
      label: "Marketing",
      items: [
        { href: "/campaigns", label: "Campaigns", icon: Target },
        {
          href: "/paid-media-leads",
          label: "Paid Media Leads",
          icon: Megaphone,
        },
      ],
    },
    {
      label: "Insights",
      items: [
        { href: "/analytics", label: "Analytics", icon: BarChart3 },
        { href: "/attribution", label: "Attribution", icon: LineChart },
        { href: "/seo", label: "SEO", icon: FileSearch },
        { href: "/tracking", label: "Tracking", icon: Tags },
      ],
    },
  ],
  finance: [
    {
      label: "Finance",
      items: [
        {
          href: "/revenue",
          label: "Revenue Forecast",
          icon: CircleDollarSign,
        },
      ],
    },
  ],
  reports: [
    {
      label: "Reports",
      items: [
        { href: "/funnel", label: "Funnel", icon: GitBranch },
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
      ],
    },
  ],
  admin: [
    {
      label: "Administration",
      items: [
        { href: "/settings", label: "Settings", icon: Settings },
        {
          href: "/settings/integrations",
          label: "Integrations",
          icon: PlugZap,
        },
        {
          href: "/settings/team",
          label: "Team & Access",
          icon: ShieldCheck,
        },
        {
          href: "/workspace",
          label: "Organizations",
          icon: Building2,
          organizationAdminOnly: true,
        },
      ],
    },
    {
      label: "System",
      items: [
        {
          href: "/course-management",
          label: "Course Management",
          icon: BookOpen,
        },
        { href: "/system-health", label: "System Health", icon: Activity },
      ],
    },
  ],
};

function isNavActive(pathname: string, href: string) {
  if (href === "/settings" || href === "/workspace") {
    return pathname === href;
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

  const mock = process.env.NEXT_PUBLIC_USE_MOCK_DATA !== "false";

  const activeWorkspace = workspace?.activeWorkspace ?? null;
  const functionalWorkspaces: FunctionalWorkspaceAccess[] = mock
    ? FUNCTIONAL_WORKSPACE_DEFINITIONS.map((definition, index) => ({
        organizationId: "mock",
        code: definition.code,
        name: definition.name,
        description: "",
        role: "admin",
        sortOrder: (index + 1) * 10,
      }))
    : workspace?.functionalWorkspaces ?? [];

  const routeWorkspace = getFunctionalWorkspaceForPathname(pathname);
  const activeFunctionalWorkspaceCode =
    routeWorkspace &&
    functionalWorkspaces.some(
      (workspaceAccess) => workspaceAccess.code === routeWorkspace.code,
    )
      ? routeWorkspace.code
      : functionalWorkspaces[0]?.code ?? "";

  const activeFunctionalWorkspaceAccess =
    functionalWorkspaces.find(
      (workspaceAccess) => workspaceAccess.code === activeFunctionalWorkspaceCode,
    ) ?? null;

  const activeFunctionalWorkspaceName =
    activeFunctionalWorkspaceAccess?.name ?? routeWorkspace?.name ?? "Workspace";

  const effectiveRole = mock ? "admin" : activeWorkspace?.role ?? null;

  const employee = !mock && effectiveRole === "admissions";
  const admin =
    mock || effectiveRole === "owner" || effectiveRole === "admin";
  const manager = !mock && effectiveRole === "manager";
  const explicitAdmin = admin || manager;
  const accessResolved = mock || (!profileLoading && !workspaceLoading);

  function canAccessActiveWorkspaceRoute(href: string) {
    if (!activeFunctionalWorkspaceAccess || !activeFunctionalWorkspaceCode) {
      return false;
    }

    return isFunctionalWorkspaceRouteAllowed(
      activeFunctionalWorkspaceCode,
      activeFunctionalWorkspaceAccess.role,
      href,
    );
  }

  const visibleNavGroups: NavGroup[] =
    accessResolved && activeFunctionalWorkspaceCode
      ? (workspaceNavGroups[activeFunctionalWorkspaceCode] ?? [])
          .map((group) => ({
            ...group,
            items: group.items.filter((item) =>
              item.organizationAdminOnly
                ? admin
                : canAccessActiveWorkspaceRoute(item.href),
            ),
          }))
          .filter((group) => group.items.length > 0)
      : [];

  const showLeadSearch = canAccessActiveWorkspaceRoute("/leads");
  const canCreateLead = canAccessActiveWorkspaceRoute("/leads/new");
  const canViewAdmissions = canAccessActiveWorkspaceRoute("/admissions");
  const canViewFollowUps = canAccessActiveWorkspaceRoute("/follow-ups");
  const canViewConversations = canAccessActiveWorkspaceRoute("/conversations");
  const canViewLeadActivity = canAccessActiveWorkspaceRoute("/re-engaged");
  const canViewSystemHealth = canAccessActiveWorkspaceRoute("/system-health");
  const showNotifications =
    canViewAdmissions ||
    canViewFollowUps ||
    canViewConversations ||
    canViewLeadActivity ||
    canViewSystemHealth;

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

  function handleFunctionalWorkspaceChange(workspaceCode: string) {
    if (!workspaceCode || workspaceCode === activeFunctionalWorkspaceCode) {
      return;
    }

    const target = getFunctionalWorkspaceRootPath(workspaceCode);

    if (target) {
      window.location.assign(target);
    }
  }

  if (
    pathname.startsWith("/login") ||
    pathname === "/forgot-password" ||
    pathname === "/reset-password" ||
    pathname === "/workspace"
  ) {
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
    activeWorkspace?.organizationName || (mock ? "Yogakulam" : "Workspace");

  return (
    <div className="app-shell app-shell-v3">
      <LiveRefresh enabled={!mock} />

      <header className="shell-topbar">
        <div className="topbar-brand">
          <BrandMark />
          <div className="topbar-brand-copy">
            <div className="topbar-brand-name">SalsysOS</div>
            <div className="topbar-product-name">{organizationName}</div>
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

        {showLeadSearch && (
          <form action="/leads" method="get" className="global-search">
            <Search size={15} className="global-search-icon" />
            <input
              name="q"
              placeholder={employee ? "Search my leads..." : "Search lead, course or country..."}
              aria-label="Search leads"
            />
            <kbd>Enter</kbd>
          </form>
        )}

        <div className="topbar-actions">
          {!workspaceLoading && functionalWorkspaces.length > 1 && (
            <select
              aria-label="Select functional workspace"
              value={activeFunctionalWorkspaceCode}
              onChange={(event) =>
                handleFunctionalWorkspaceChange(event.target.value)
              }
              className="hidden max-w-[220px] rounded-lg border border-white/20 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-900 outline-none md:block"
            >
              {functionalWorkspaces.map((workspaceAccess) => (
                <option key={workspaceAccess.code} value={workspaceAccess.code}>
                  {workspaceAccess.name}
                </option>
              ))}
            </select>
          )}

          {!workspaceLoading && functionalWorkspaces.length === 1 && (
            <span className="hidden max-w-[220px] rounded-lg border border-white/20 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-900 md:block">
              {activeFunctionalWorkspaceName}
            </span>
          )}

          {canCreateLead && !profileLoading && !workspaceLoading && (
            <Link
              href="/leads/new"
              className="topbar-new-button hidden sm:inline-flex"
            >
              <Plus size={15} />
              New
            </Link>
          )}

          {showNotifications && (
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
                      Priority workspace queues that may need your attention.
                    </div>
                  </div>

                  {canAccessActiveWorkspaceRoute("/dashboard") && (
                    <Link href="/dashboard" className="topbar-todo-view-all">
                      Dashboard
                    </Link>
                  )}

                  {!canAccessActiveWorkspaceRoute("/dashboard") &&
                    canViewSystemHealth && (
                      <Link
                        href="/system-health"
                        className="topbar-todo-view-all"
                      >
                        System health
                      </Link>
                    )}
                </div>

                <div className="topbar-todo-list">
                  {canViewAdmissions && (
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

                  {canViewFollowUps && (
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
                  )}

                  {canViewConversations && (
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
                  )}

                  {canViewLeadActivity && (
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

                  {canViewSystemHealth && (
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
          )}

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

                {admin && workspace?.memberships && workspace.memberships.length > 1 && (
                  <Link href="/workspace" className="topbar-account-row">
                    <Building2 size={17} />
                    <span>Organizations</span>
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

        {!workspaceLoading && functionalWorkspaces.length > 1 && (
          <div className="px-3 pb-3 lg:hidden">
            <label className="mb-1.5 block text-[10px] font-bold uppercase tracking-[.12em] text-slate-400">
              Workspace
            </label>
            <select
              aria-label="Select functional workspace from mobile menu"
              value={activeFunctionalWorkspaceCode}
              onChange={(event) =>
                handleFunctionalWorkspaceChange(event.target.value)
              }
              className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-800 outline-none"
            >
              {functionalWorkspaces.map((workspaceAccess) => (
                <option key={workspaceAccess.code} value={workspaceAccess.code}>
                  {workspaceAccess.name}
                </option>
              ))}
            </select>
          </div>
        )}

        {!workspaceLoading && functionalWorkspaces.length === 1 && (
          <div className="px-3 pb-3 lg:hidden">
            <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-semibold text-slate-700">
              {activeFunctionalWorkspaceName}
            </div>
          </div>
        )}

        {showLeadSearch && (
          <form
            action="/leads"
            method="get"
            className="mobile-menu-search lg:hidden"
            onSubmit={() => setMobileOpen(false)}
          >
            <Search size={16} className="mobile-menu-search-icon" />
            <input
              name="q"
              placeholder={employee ? "Search my leads..." : "Search lead, course or country..."}
              aria-label="Search leads from mobile menu"
            />
          </form>
        )}

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
            {mock
              ? "Development"
              : activeFunctionalWorkspaceName
                ? `${activeFunctionalWorkspaceName} workspace`
                : "Live"}
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
