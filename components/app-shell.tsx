"use client";

import Link from "next/link";

import { usePathname } from "next/navigation";

import {
  BarChart3,
  Bell,
  BookOpen,
  Boxes,
  ChevronDown,
  CircleDollarSign,
  ContactRound,
  FileSearch,
  Gauge,
  GitBranch,
  LineChart,
  ListTodo,
  Menu,
  MessageSquareText,
  RefreshCw,
  Search,
  Settings,
  Tags,
  Target,
  Megaphone,
  ClipboardCheck,
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

  role: string | null;

  active: boolean;
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

      { href: "/attribution", label: "Attribution", icon: LineChart },

      { href: "/re-engaged", label: "Re-engaged Leads", icon: RefreshCw },

      { href: "/seo", label: "SEO", icon: FileSearch },
    ],
  },

  {
    label: "Intelligence",

    items: [
      { href: "/analytics", label: "Analytics", icon: BarChart3 },

      { href: "/funnel", label: "Funnel", icon: GitBranch },

      { href: "/revenue", label: "Revenue Forecast", icon: CircleDollarSign },

      { href: "/tracking", label: "Tracking", icon: Tags },
    ],
  },

  {
    label: "System",

    items: [{ href: "/settings", label: "Settings", icon: Settings }],
  },
];

/*

 \* Employee navigation is intentionally small.

 \* Staff should spend their time on assigned leads and conversion work,

 \* not marketing/analytics/administrative screens.

 */

const adminOnlyTeamNavGroup: NavGroup = {
  label: "Team",
  items: [
    {
      href: "/team-performance",
      label: "Team Performance",
      icon: UsersRound,
    },
  ],
};

const employeeNavGroups: NavGroup[] = [
  {
    label: "My Workspace",

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

const employeeNav = employeeNavGroups.flatMap((group) => group.items);

function BrandMark() {
  return (
    <div className="brand-mark">
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

  const mock = process.env.NEXT_PUBLIC_USE_MOCK_DATA !== "false";

  const employee = !mock && profile?.role === "admissions";

  const admin = mock || profile?.role === "admin";

  const explicitAdmin = admin || profile?.role === "manager";

  /*

   \* Admin navigation is shown only after an explicit admin/manager role is

   \* confirmed. Unknown/loading roles stay on the smaller workspace menu.

   */

  const visibleAdminNavGroups = admin
    ? [
        adminNavGroups[0],
        adminNavGroups[1],
        adminOnlyTeamNavGroup,
        ...adminNavGroups.slice(2),
      ]
    : adminNavGroups;

  const visibleNavGroups = explicitAdmin
    ? visibleAdminNavGroups
    : employeeNavGroups;

  const visibleNav = explicitAdmin
    ? visibleNavGroups.flatMap((group) => group.items)
    : employeeNav;

  const current = useMemo(
    () =>
      visibleNav.find((item) => pathname.startsWith(item.href))?.label ??
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
    setMobileOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!mobileOpen) return;

    const previous = document.body.style.overflow;

    document.body.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = previous;
    };
  }, [mobileOpen]);

  if (pathname.startsWith("/login")) {
    return <>{children}</>;
  }

  const displayName = profile?.fullName || "CRM User";

  const roleLabel = employee
    ? "Employee"
    : profile?.role === "admin"
      ? "Admin"
      : mock
        ? "Development access"
        : "Authenticated";

  return (
    <div className="app-shell">
      <LiveRefresh enabled={!mock} />

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
        <div className="sidebar-brand">
          <BrandMark />

          <div className="min-w-0">
            <div className="truncate text-sm font-bold text-slate-950">
              Yogakulam
            </div>

            <div className="mt-0.5 text-[11px] font-medium text-slate-400">
              {employee ? "Admissions CRM" : "Growth CRM · v0.7"}
            </div>
          </div>

          <button
            type="button"
            className="sidebar-close lg:hidden"
            onClick={() => setMobileOpen(false)}
            aria-label="Close navigation"
          >
            <X size={17} />
          </button>
        </div>

        <div
          className={`sidebar-status ${
            mock ? "sidebar-status-dev" : "sidebar-status-live"
          }`}
        >
          <div
            className={`flex items-center gap-2 text-xs font-semibold ${
              mock ? "text-orange-700" : "text-emerald-700"
            }`}
          >
            <span className="relative flex h-2 w-2">
              <span
                className={`absolute inline-flex h-full w-full animate-ping rounded-full opacity-50 ${
                  mock ? "bg-orange-400" : "bg-emerald-400"
                }`}
              />

              <span
                className={`relative inline-flex h-2 w-2 rounded-full ${
                  mock ? "bg-orange-500" : "bg-emerald-500"
                }`}
              />
            </span>

            {mock
              ? "Development mode"
              : employee
                ? "My assigned leads"
                : "Supabase live"}
          </div>

          <p
            className={`mt-1.5 text-[11px] leading-5 ${
              mock ? "text-orange-700/75" : "text-emerald-700/75"
            }`}
          >
            {mock
              ? "Using fictional CRM data until Supabase is connected."
              : employee
                ? "Focused workspace for your assigned leads and conversions."
                : "Authenticated data is persistent and live-synced."}
          </p>
        </div>

        <nav className="sidebar-nav">
          {visibleNavGroups.map((group) => (
            <div key={group.label} className="sidebar-group">
              <div className="sidebar-group-label">{group.label}</div>

              <div className="space-y-1">
                {group.items.map((item) => {
                  const Icon = item.icon;

                  const active = pathname.startsWith(item.href);

                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      className={`nav-item ${active ? "nav-item-active" : ""}`}
                    >
                      <span className="nav-icon-wrap">
                        <Icon size={17} strokeWidth={1.9} />
                      </span>

                      <span className="min-w-0 flex-1 truncate">
                        {item.label}
                      </span>

                      {active && <span className="nav-active-dot" />}
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>

        <div className="sidebar-user">
          <div className="user-avatar">{initials(displayName)}</div>

          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-semibold text-slate-800">
              {displayName}
            </div>

            <div className="mt-0.5 text-[11px] text-slate-400">
              {profileLoading ? "Loading access…" : roleLabel}
            </div>
          </div>

          {mock ? (
            <ChevronDown size={16} className="text-slate-400" />
          ) : (
            <form action={signOutAction}>
              <button type="submit" className="sidebar-signout">
                Sign out
              </button>
            </form>
          )}
        </div>
      </aside>

      <div className="shell-content">
        <header className="shell-header">
          <button
            type="button"
            className="header-icon-btn lg:hidden"
            onClick={() => setMobileOpen((value) => !value)}
            aria-label="Toggle navigation"
          >
            <Menu size={18} />
          </button>

          <div className="min-w-0">
            <div className="header-eyebrow">
              {employee ? "Yogakulam Admissions" : "Yogakulam Academy"}
            </div>

            <div className="header-title">{current}</div>
          </div>

          <form action="/leads" method="get" className="global-search">
            <Search size={15} className="text-slate-400" />

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

          <div className="header-actions">
            <ThemeToggle />

            <button
              type="button"
              className="header-icon-btn"
              aria-label="Notifications"
            >
              <Bell size={17} />

              <span className="notification-dot" />
            </button>

            {!employee && !profileLoading && (
              <Link
                href="/leads/new"
                className="btn-primary hidden sm:inline-flex"
              >
                <ContactRound size={16} />
                Add lead
              </Link>
            )}
          </div>
        </header>

        <main className="shell-main">
          <div key={pathname} className="page-transition">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
