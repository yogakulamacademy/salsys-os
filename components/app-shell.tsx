"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Activity,
  BarChart3,
  Bell,
  BookOpen,
  Boxes,
  BrainCircuit,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CircleDollarSign,
  ClipboardCheck,
  ContactRound,
  FileSearch,
  Gauge,
  GitBranch,
  Home,
  LineChart,
  ListTodo,
  LogOut,
  Megaphone,
  Menu,
  MessageSquareText,
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
  PlugZap,
  RefreshCw,
  Search,
  Settings,
  ShieldCheck,
  Sparkles,
  Tags,
  Target,
  UsersRound,
  Workflow,
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

type IconType = ComponentType<{
  size?: number | string;
  strokeWidth?: number;
  className?: string;
}>;

type NavItem = {
  href: string;
  label: string;
  icon: IconType;
};

type NavSection = {
  id: string;
  label: string;
  icon: IconType;
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

type SmartCommand = {
  title: string;
  description: string;
  href: string;
  keywords: string;
  icon: IconType;
};

const NAV_PANEL_KEY = "salsysos-nav-panel-collapsed";

function isNavActive(pathname: string, href: string) {
  if (href === "/settings") return pathname === "/settings";
  return pathname === href || pathname.startsWith(`${href}/`);
}

function BrandMark() {
  return (
    <div
      className="grid h-10 w-10 place-items-center rounded-xl bg-slate-950 text-[13px] font-black tracking-[-0.03em] text-white shadow-sm dark:bg-white dark:text-slate-950"
      aria-hidden="true"
    >
      SO
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

  return value || "SO";
}

function sectionForPath(pathname: string, sections: NavSection[]) {
  return (
    sections.find((section) =>
      section.items.some((item) => isNavActive(pathname, item.href)),
    ) ?? sections[0]
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [profile, setProfile] = useState<ShellProfile | null>(null);
  const [profileLoading, setProfileLoading] = useState(true);
  const [workspace, setWorkspace] = useState<WorkspaceContext | null>(null);
  const [workspaceLoading, setWorkspaceLoading] = useState(true);
  const [workspaceSwitching, setWorkspaceSwitching] = useState(false);
  const [selectedSectionId, setSelectedSectionId] = useState("home");
  const [secondaryCollapsed, setSecondaryCollapsed] = useState(false);
  const [askOpen, setAskOpen] = useState(false);
  const [commandQuery, setCommandQuery] = useState("");

  const mock = process.env.NEXT_PUBLIC_USE_MOCK_DATA !== "false";
  const activeWorkspace = workspace?.activeWorkspace ?? null;
  const workspaceMemberships = workspace?.memberships ?? [];
  const effectiveRole = mock ? "admin" : activeWorkspace?.role ?? null;
  const employee = !mock && effectiveRole === "admissions";
  const admin =
    mock || effectiveRole === "owner" || effectiveRole === "admin";
  const manager = !mock && effectiveRole === "manager";
  const explicitAdmin = admin || manager;
  const accessResolved = mock || (!profileLoading && !workspaceLoading);

  const visibleSections = useMemo<NavSection[]>(() => {
    if (!accessResolved) return [];

    if (employee) {
      return [
        {
          id: "home",
          label: "Home",
          icon: Home,
          items: [{ href: "/dashboard", label: "Today", icon: Gauge }],
        },
        {
          id: "crm",
          label: "CRM",
          icon: UsersRound,
          items: [
            { href: "/leads", label: "My leads", icon: ContactRound },
            { href: "/pipeline", label: "My pipeline", icon: Boxes },
            { href: "/conversations", label: "Inbox", icon: MessageSquareText },
            { href: "/follow-ups", label: "Follow-ups", icon: ListTodo },
          ],
        },
      ];
    }

    if (!explicitAdmin) return [];

    const sections: NavSection[] = [
      {
        id: "home",
        label: "Home",
        icon: Home,
        items: [{ href: "/dashboard", label: "Today", icon: Gauge }],
      },
      {
        id: "crm",
        label: "CRM",
        icon: UsersRound,
        items: [
          { href: "/leads", label: "Leads", icon: ContactRound },
          { href: "/pipeline", label: "Pipeline", icon: Boxes },
          { href: "/conversations", label: "Inbox", icon: MessageSquareText },
          { href: "/admissions", label: "Admissions", icon: ClipboardCheck },
          {
            href: "/contact-intelligence",
            label: "Customer 360",
            icon: BrainCircuit,
          },
          { href: "/follow-ups", label: "Follow-ups", icon: ListTodo },
          ...(admin
            ? [
                {
                  href: "/team-performance",
                  label: "Team performance",
                  icon: UsersRound,
                },
              ]
            : []),
        ],
      },
      {
        id: "growth",
        label: "Growth",
        icon: Megaphone,
        items: [
          { href: "/campaigns", label: "Campaigns", icon: Target },
          {
            href: "/paid-media-leads",
            label: "Paid media",
            icon: Megaphone,
          },
          { href: "/re-engaged", label: "Lead activity", icon: RefreshCw },
          { href: "/seo", label: "SEO / AEO", icon: FileSearch },
        ],
      },
      {
        id: "intelligence",
        label: "Intelligence",
        icon: BrainCircuit,
        items: [
          {
            href: "/commercial-intelligence",
            label: "Commercial intelligence",
            icon: Sparkles,
          },
          { href: "/analytics", label: "Analytics", icon: BarChart3 },
          { href: "/funnel", label: "Funnel", icon: GitBranch },
          { href: "/attribution", label: "Attribution", icon: LineChart },
          { href: "/revenue", label: "Revenue", icon: CircleDollarSign },
          { href: "/tracking", label: "Tracking", icon: Tags },
        ],
      },
      {
        id: "automation",
        label: "Automation",
        icon: Workflow,
        items: [
          { href: "/automation", label: "Automations", icon: Workflow },
        ],
      },
      {
        id: "operations",
        label: "Operations",
        icon: BookOpen,
        items: [
          {
            href: "/course-management",
            label: "Course management",
            icon: BookOpen,
          },
        ],
      },
      {
        id: "system",
        label: "System",
        icon: Settings,
        items: [
          ...(admin
            ? [
                {
                  href: "/settings/integrations",
                  label: "Integrations",
                  icon: PlugZap,
                },
                {
                  href: "/settings/team",
                  label: "Team & access",
                  icon: ShieldCheck,
                },
                {
                  href: "/system-health",
                  label: "System health",
                  icon: Activity,
                },
              ]
            : []),
          { href: "/settings", label: "Settings", icon: Settings },
        ],
      },
    ];

    return sections;
  }, [accessResolved, admin, employee, explicitAdmin]);

  const visibleNav = useMemo(
    () => visibleSections.flatMap((section) => section.items),
    [visibleSections],
  );

  const routeSection = useMemo(
    () => sectionForPath(pathname, visibleSections),
    [pathname, visibleSections],
  );

  const selectedSection =
    visibleSections.find((section) => section.id === selectedSectionId) ??
    routeSection ??
    visibleSections[0];

  const current = useMemo(
    () =>
      visibleNav.find((item) => isNavActive(pathname, item.href))?.label ??
      (employee ? "Admissions workspace" : "SalsysOS"),
    [pathname, visibleNav, employee],
  );

  const smartCommands = useMemo<SmartCommand[]>(() => {
    const commands: SmartCommand[] = [
      {
        title: "What needs attention today?",
        description: "Open today's replies, overdue follow-ups and hot opportunities.",
        href: "/dashboard",
        keywords: "today attention priorities tasks replies hot leads",
        icon: Sparkles,
      },
      {
        title: "Show leads that need action",
        description: "Review active leads and work the next best action.",
        href: "/leads",
        keywords: "leads contact follow up action sales crm",
        icon: ContactRound,
      },
      {
        title: "Open conversations",
        description: "Jump to the unified customer conversation workspace.",
        href: "/conversations",
        keywords: "inbox whatsapp instagram messages reply conversation",
        icon: MessageSquareText,
      },
      {
        title: "Why did commercial performance change?",
        description: "Inspect funnel, paid media, attribution and revenue evidence together.",
        href: "/commercial-intelligence",
        keywords: "why performance cac cpl roas revenue funnel intelligence",
        icon: BrainCircuit,
      },
      {
        title: "Find funnel leakage",
        description: "Inspect conversion steps and the largest observed drop-off.",
        href: "/funnel",
        keywords: "funnel conversion drop leak stage journey",
        icon: GitBranch,
      },
      {
        title: "Review attribution gaps",
        description: "Check source coverage and model disagreement before ROI conclusions.",
        href: "/attribution",
        keywords: "attribution source campaign unknown first touch last touch",
        icon: LineChart,
      },
      {
        title: "Review revenue and payment risk",
        description: "Open revenue, outstanding balances and pipeline readiness.",
        href: "/revenue",
        keywords: "revenue payment outstanding forecast refund pipeline",
        icon: CircleDollarSign,
      },
    ];

    return commands.filter((command) =>
      visibleNav.some((item) => isNavActive(command.href, item.href)),
    );
  }, [visibleNav]);

  const filteredCommands = useMemo(() => {
    const query = commandQuery.trim().toLowerCase();
    if (!query) return smartCommands;
    return smartCommands.filter((command) =>
      `${command.title} ${command.description} ${command.keywords}`
        .toLowerCase()
        .includes(query),
    );
  }, [commandQuery, smartCommands]);

  useEffect(() => {
    try {
      setSecondaryCollapsed(
        window.localStorage.getItem(NAV_PANEL_KEY) === "1",
      );
    } catch {
      setSecondaryCollapsed(false);
    }
  }, []);

  useEffect(() => {
    if (routeSection) setSelectedSectionId(routeSection.id);
    setMobileOpen(false);
    setAskOpen(false);

    document
      .querySelectorAll<HTMLDetailsElement>(
        "details.topbar-notification-menu, details.topbar-profile-menu",
      )
      .forEach((details) => {
        details.open = false;
      });
  }, [pathname, routeSection]);

  useEffect(() => {
    function handleShortcut(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setAskOpen((value) => !value);
      }
      if (event.key === "Escape") setAskOpen(false);
    }

    document.addEventListener("keydown", handleShortcut);
    return () => document.removeEventListener("keydown", handleShortcut);
  }, []);

  useEffect(() => {
    const selector =
      "details.topbar-notification-menu, details.topbar-profile-menu";

    function closeMenus(except: HTMLDetailsElement | null = null) {
      document
        .querySelectorAll<HTMLDetailsElement>(selector)
        .forEach((details) => {
          if (details !== except) details.open = false;
        });
    }

    function handlePointerDown(event: PointerEvent) {
      const target = event.target;
      if (!(target instanceof Element)) {
        closeMenus();
        return;
      }
      const clickedMenu = target.closest(selector) as HTMLDetailsElement | null;
      if (!clickedMenu) closeMenus();
      else closeMenus(clickedMenu);
    }

    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, []);

  useEffect(() => {
    if (!mobileOpen && !askOpen) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [mobileOpen, askOpen]);

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
        const response = await fetch("/api/workspace", { cache: "no-store" });
        if (!response.ok) throw new Error("Unable to load workspace.");
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

  async function handleWorkspaceChange(organizationId: string) {
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
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ organizationId }),
      });

      if (!response.ok) {
        const body = await response.json().catch(() => null);
        throw new Error(body?.error || "Unable to switch workspace.");
      }

      window.location.assign("/dashboard");
    } catch (error) {
      setWorkspaceSwitching(false);
      window.alert(
        error instanceof Error ? error.message : "Unable to switch workspace.",
      );
    }
  }

  function toggleSecondary() {
    setSecondaryCollapsed((value) => {
      const next = !value;
      try {
        window.localStorage.setItem(NAV_PANEL_KEY, next ? "1" : "0");
      } catch {}
      return next;
    });
  }

  function chooseSection(id: string) {
    setSelectedSectionId(id);
    if (secondaryCollapsed) {
      setSecondaryCollapsed(false);
      try {
        window.localStorage.setItem(NAV_PANEL_KEY, "0");
      } catch {}
    }
  }

  if (pathname.startsWith("/login")) return <>{children}</>;

  const displayName = profile?.fullName || "CRM User";
  const displayEmail = profile?.email || "";
  const roleLabel = employee
    ? "Admissions"
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
    activeWorkspace?.organizationName || (mock ? "SalsysOS Demo" : "Workspace");

  return (
    <div className="min-h-screen bg-[#f7f8fa] text-slate-950 dark:bg-slate-950 dark:text-slate-100">
      <LiveRefresh enabled={!mock} />

      <aside className="fixed inset-y-0 left-0 z-50 hidden w-16 flex-col items-center border-r border-slate-200/80 bg-white py-3 lg:flex dark:border-slate-800 dark:bg-slate-950">
        <Link href="/dashboard" className="mb-4" aria-label="SalsysOS home">
          <BrandMark />
        </Link>

        <nav className="flex min-h-0 flex-1 flex-col items-center gap-1 overflow-y-auto px-2 py-1">
          {visibleSections.map((section) => {
            const Icon = section.icon;
            const selected = selectedSection?.id === section.id;
            const containsCurrent = routeSection?.id === section.id;

            return (
              <button
                key={section.id}
                type="button"
                title={section.label}
                aria-label={`Open ${section.label}`}
                aria-pressed={selected}
                onClick={() => chooseSection(section.id)}
                className={`group relative grid h-11 w-11 place-items-center rounded-xl transition ${
                  selected
                    ? "bg-slate-950 text-white dark:bg-white dark:text-slate-950"
                    : "text-slate-500 hover:bg-slate-100 hover:text-slate-950 dark:text-slate-400 dark:hover:bg-slate-900 dark:hover:text-white"
                }`}
              >
                <Icon size={19} strokeWidth={selected ? 2.2 : 1.8} />
                {containsCurrent && !selected ? (
                  <span className="absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full bg-violet-500" />
                ) : null}
                <span className="pointer-events-none absolute left-[52px] z-[70] hidden whitespace-nowrap rounded-lg bg-slate-950 px-2.5 py-1.5 text-[11px] font-semibold text-white shadow-lg group-hover:block dark:bg-white dark:text-slate-950">
                  {section.label}
                </span>
              </button>
            );
          })}
        </nav>

        <div className="mt-3 flex flex-col items-center gap-2">
          <button
            type="button"
            onClick={() => setAskOpen(true)}
            className="grid h-10 w-10 place-items-center rounded-xl text-violet-600 transition hover:bg-violet-50 dark:text-violet-300 dark:hover:bg-violet-950/40"
            title="Ask Salsys"
            aria-label="Ask Salsys"
          >
            <Sparkles size={18} />
          </button>
          <div
            className={`h-2 w-2 rounded-full ${mock ? "bg-amber-400" : "bg-emerald-500"}`}
            title={mock ? "Development" : "Live"}
          />
        </div>
      </aside>

      {!secondaryCollapsed && selectedSection ? (
        <aside className="fixed inset-y-0 left-16 z-40 hidden w-60 flex-col border-r border-slate-200/80 bg-white lg:flex dark:border-slate-800 dark:bg-slate-950">
          <div className="flex h-16 items-center justify-between border-b border-slate-100 px-4 dark:border-slate-900">
            <div className="min-w-0">
              <div className="truncate text-[11px] font-semibold text-slate-400">
                {organizationName}
              </div>
              <div className="truncate text-[15px] font-bold tracking-[-0.02em] text-slate-900 dark:text-white">
                {selectedSection.label}
              </div>
            </div>
            <button
              type="button"
              onClick={toggleSecondary}
              className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-slate-400 transition hover:bg-slate-100 hover:text-slate-900 dark:hover:bg-slate-900 dark:hover:text-white"
              aria-label="Collapse section menu"
              title="Collapse menu"
            >
              <PanelLeftClose size={17} />
            </button>
          </div>

          <nav className="flex-1 space-y-1 overflow-y-auto p-3">
            {selectedSection.items.map((item) => {
              const Icon = item.icon;
              const active = isNavActive(pathname, item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`group flex items-center gap-3 rounded-xl px-3 py-2.5 text-[13px] font-semibold transition ${
                    active
                      ? "bg-slate-100 text-slate-950 dark:bg-slate-900 dark:text-white"
                      : "text-slate-500 hover:bg-slate-50 hover:text-slate-950 dark:text-slate-400 dark:hover:bg-slate-900/70 dark:hover:text-white"
                  }`}
                >
                  <Icon
                    size={17}
                    strokeWidth={active ? 2.2 : 1.8}
                    className={active ? "text-violet-600 dark:text-violet-300" : ""}
                  />
                  <span className="min-w-0 flex-1 truncate">{item.label}</span>
                  {active ? (
                    <ChevronRight size={14} className="text-slate-400" />
                  ) : null}
                </Link>
              );
            })}
          </nav>

          <button
            type="button"
            onClick={() => setAskOpen(true)}
            className="m-3 flex items-center gap-3 rounded-xl border border-violet-100 bg-violet-50/70 px-3 py-3 text-left transition hover:bg-violet-50 dark:border-violet-900/50 dark:bg-violet-950/20 dark:hover:bg-violet-950/40"
          >
            <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-white text-violet-600 shadow-sm dark:bg-slate-900 dark:text-violet-300">
              <Sparkles size={16} />
            </span>
            <span className="min-w-0">
              <span className="block text-xs font-bold text-slate-900 dark:text-white">Ask Salsys</span>
              <span className="block truncate text-[10px] text-slate-500">Investigate or jump to action</span>
            </span>
            <kbd className="ml-auto hidden rounded border border-violet-100 bg-white px-1.5 py-0.5 text-[9px] font-semibold text-slate-400 xl:inline dark:border-slate-800 dark:bg-slate-900">
              ⌘K
            </kbd>
          </button>
        </aside>
      ) : null}

      <div
        className={`min-h-screen transition-[padding] duration-200 ${
          secondaryCollapsed ? "lg:pl-16" : "lg:pl-[304px]"
        }`}
      >
        <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b border-slate-200/80 bg-white/95 px-4 backdrop-blur lg:px-6 dark:border-slate-800 dark:bg-slate-950/95">
          <button
            type="button"
            className="grid h-9 w-9 place-items-center rounded-lg border border-slate-200 text-slate-500 lg:hidden dark:border-slate-800"
            onClick={() => setMobileOpen(true)}
            aria-label="Open navigation"
          >
            <Menu size={18} />
          </button>

          {secondaryCollapsed ? (
            <button
              type="button"
              onClick={toggleSecondary}
              className="hidden h-9 w-9 place-items-center rounded-lg border border-slate-200 text-slate-500 transition hover:bg-slate-50 hover:text-slate-950 lg:grid dark:border-slate-800 dark:hover:bg-slate-900 dark:hover:text-white"
              aria-label="Open section menu"
              title="Open menu"
            >
              <PanelLeftOpen size={17} />
            </button>
          ) : null}

          <div className="hidden min-w-0 md:block">
            <div className="text-[10px] font-bold uppercase tracking-[0.12em] text-slate-400">
              {selectedSection?.label ?? "Workspace"}
            </div>
            <div className="truncate text-sm font-bold tracking-[-0.02em] text-slate-900 dark:text-white">
              {current}
            </div>
          </div>

          <button
            type="button"
            onClick={() => setAskOpen(true)}
            className="mx-auto flex h-9 w-full max-w-xl items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 text-left text-xs text-slate-400 transition hover:border-slate-300 hover:bg-white md:mx-4 dark:border-slate-800 dark:bg-slate-900 dark:hover:border-slate-700"
          >
            <Sparkles size={15} className="text-violet-500" />
            <span className="truncate">Ask Salsys or find anything…</span>
            <kbd className="ml-auto hidden rounded border border-slate-200 bg-white px-1.5 py-0.5 text-[9px] font-semibold text-slate-400 sm:inline dark:border-slate-700 dark:bg-slate-950">
              ⌘K
            </kbd>
          </button>

          <div className="ml-auto flex items-center gap-2">
            {!mock && workspaceMemberships.length > 1 ? (
              <select
                aria-label="Select workspace"
                value={activeWorkspace?.organizationId ?? ""}
                disabled={workspaceSwitching}
                onChange={(event) => void handleWorkspaceChange(event.target.value)}
                className="hidden max-w-[180px] rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-xs font-semibold text-slate-700 outline-none xl:block dark:border-slate-800 dark:bg-slate-950 dark:text-slate-200"
              >
                {!activeWorkspace ? <option value="">Select workspace</option> : null}
                {workspaceMemberships.map((membership) => (
                  <option key={membership.organizationId} value={membership.organizationId}>
                    {membership.organizationName}
                  </option>
                ))}
              </select>
            ) : null}

            {!employee && !profileLoading && !workspaceLoading ? (
              <Link
                href="/leads/new"
                className="hidden h-9 items-center gap-1.5 rounded-lg bg-slate-950 px-3 text-xs font-bold text-white transition hover:bg-slate-800 sm:inline-flex dark:bg-white dark:text-slate-950 dark:hover:bg-slate-200"
              >
                <Plus size={14} />
                New
              </Link>
            ) : null}

            <details className="topbar-notification-menu relative">
              <summary className="grid h-9 w-9 cursor-pointer list-none place-items-center rounded-lg border border-slate-200 text-slate-500 transition hover:bg-slate-50 hover:text-slate-950 dark:border-slate-800 dark:hover:bg-slate-900 dark:hover:text-white">
                <Bell size={16} />
              </summary>
              <div className="absolute right-0 mt-2 w-[320px] rounded-2xl border border-slate-200 bg-white p-2 shadow-xl dark:border-slate-800 dark:bg-slate-950">
                <div className="px-3 py-2">
                  <div className="text-sm font-bold text-slate-900 dark:text-white">Needs attention</div>
                  <div className="mt-0.5 text-[11px] text-slate-500">Jump directly to priority work.</div>
                </div>
                {[
                  { href: "/follow-ups", label: "Follow-ups", detail: "Due and overdue work", icon: ListTodo },
                  { href: "/conversations", label: "Conversations", detail: "Replies that need attention", icon: MessageSquareText },
                  ...(!employee
                    ? [{ href: "/re-engaged", label: "Lead activity", detail: "Returning and active leads", icon: RefreshCw }]
                    : []),
                ].map((item) => {
                  const Icon = item.icon;
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      className="flex items-center gap-3 rounded-xl px-3 py-2.5 transition hover:bg-slate-50 dark:hover:bg-slate-900"
                    >
                      <span className="grid h-8 w-8 place-items-center rounded-lg bg-slate-100 text-slate-600 dark:bg-slate-900 dark:text-slate-300">
                        <Icon size={15} />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-xs font-bold text-slate-800 dark:text-slate-100">{item.label}</span>
                        <span className="block text-[10px] text-slate-500">{item.detail}</span>
                      </span>
                      <ChevronRight size={14} className="text-slate-300" />
                    </Link>
                  );
                })}
              </div>
            </details>

            <details className="topbar-profile-menu relative">
              <summary className="flex h-9 cursor-pointer list-none items-center gap-2 rounded-lg pl-1 pr-1.5 transition hover:bg-slate-50 dark:hover:bg-slate-900">
                <span className="grid h-8 w-8 place-items-center rounded-lg bg-slate-100 text-[11px] font-black text-slate-700 dark:bg-slate-900 dark:text-slate-200">
                  {initials(displayName)}
                </span>
                <ChevronDown size={13} className="hidden text-slate-400 xl:block" />
              </summary>
              <div className="absolute right-0 mt-2 w-64 rounded-2xl border border-slate-200 bg-white p-2 shadow-xl dark:border-slate-800 dark:bg-slate-950">
                <div className="px-3 py-2">
                  <div className="truncate text-sm font-bold text-slate-900 dark:text-white">{displayName}</div>
                  <div className="mt-0.5 truncate text-[11px] text-slate-500">{displayEmail || roleLabel}</div>
                </div>
                <div className="my-1 border-t border-slate-100 dark:border-slate-900" />
                {explicitAdmin ? (
                  <Link href="/settings" className="flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-slate-900">
                    <Settings size={15} /> Settings
                  </Link>
                ) : null}
                <div className="flex items-center justify-between rounded-lg px-3 py-2 text-xs font-semibold text-slate-600 dark:text-slate-300">
                  <span>Appearance</span>
                  <ThemeToggle />
                </div>
                {!mock ? (
                  <>
                    <div className="my-1 border-t border-slate-100 dark:border-slate-900" />
                    <form action={signOutAction}>
                      <button type="submit" className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-xs font-semibold text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/30">
                        <LogOut size={15} /> Log out
                      </button>
                    </form>
                  </>
                ) : null}
              </div>
            </details>
          </div>
        </header>

        <main className="min-h-[calc(100vh-4rem)] px-4 py-5 sm:px-5 lg:px-6 lg:py-6">
          <div key={pathname} className="page-transition mx-auto w-full max-w-[1680px]">
            {children}
          </div>
        </main>
      </div>

      {mobileOpen ? (
        <div className="fixed inset-0 z-[80] lg:hidden">
          <button
            type="button"
            className="absolute inset-0 bg-slate-950/35 backdrop-blur-[1px]"
            aria-label="Close navigation"
            onClick={() => setMobileOpen(false)}
          />
          <aside className="absolute inset-y-0 left-0 flex w-[min(88vw,340px)] flex-col bg-white shadow-2xl dark:bg-slate-950">
            <div className="flex h-16 items-center gap-3 border-b border-slate-100 px-4 dark:border-slate-900">
              <BrandMark />
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-black text-slate-900 dark:text-white">SalsysOS</div>
                <div className="truncate text-[10px] text-slate-500">{organizationName}</div>
              </div>
              <button
                type="button"
                className="grid h-9 w-9 place-items-center rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-900"
                onClick={() => setMobileOpen(false)}
                aria-label="Close navigation"
              >
                <X size={18} />
              </button>
            </div>

            <button
              type="button"
              onClick={() => {
                setMobileOpen(false);
                setAskOpen(true);
              }}
              className="m-3 flex items-center gap-2 rounded-xl border border-violet-100 bg-violet-50 px-3 py-2.5 text-xs font-bold text-violet-700 dark:border-violet-900/50 dark:bg-violet-950/30 dark:text-violet-200"
            >
              <Sparkles size={15} /> Ask Salsys
            </button>

            <nav className="flex-1 overflow-y-auto px-3 pb-5">
              {visibleSections.map((section) => (
                <div key={section.id} className="mb-4">
                  <div className="mb-1 px-2 text-[10px] font-black uppercase tracking-[0.12em] text-slate-400">
                    {section.label}
                  </div>
                  <div className="space-y-1">
                    {section.items.map((item) => {
                      const Icon = item.icon;
                      const active = isNavActive(pathname, item.href);
                      return (
                        <Link
                          key={item.href}
                          href={item.href}
                          onClick={() => setMobileOpen(false)}
                          className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold ${
                            active
                              ? "bg-slate-950 text-white dark:bg-white dark:text-slate-950"
                              : "text-slate-600 hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-slate-900"
                          }`}
                        >
                          <Icon size={17} />
                          {item.label}
                        </Link>
                      );
                    })}
                  </div>
                </div>
              ))}
            </nav>
          </aside>
        </div>
      ) : null}

      {askOpen ? (
        <div className="fixed inset-0 z-[100] flex items-start justify-center px-4 pt-[8vh] sm:pt-[12vh]">
          <button
            type="button"
            className="absolute inset-0 bg-slate-950/35 backdrop-blur-[2px]"
            onClick={() => setAskOpen(false)}
            aria-label="Close Ask Salsys"
          />
          <section className="relative w-full max-w-2xl overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl dark:border-slate-800 dark:bg-slate-950">
            <div className="flex items-center gap-3 border-b border-slate-100 px-4 py-3 dark:border-slate-900">
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-violet-50 text-violet-600 dark:bg-violet-950/40 dark:text-violet-300">
                <Sparkles size={17} />
              </span>
              <div className="min-w-0 flex-1">
                <div className="text-sm font-black text-slate-900 dark:text-white">Ask Salsys</div>
                <div className="text-[10px] text-slate-500">Find evidence, navigate and move work forward</div>
              </div>
              <button
                type="button"
                className="grid h-8 w-8 place-items-center rounded-lg text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-900"
                onClick={() => setAskOpen(false)}
                aria-label="Close Ask Salsys"
              >
                <X size={16} />
              </button>
            </div>

            <div className="p-3">
              <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 dark:border-slate-800 dark:bg-slate-900">
                <Search size={16} className="text-slate-400" />
                <input
                  autoFocus
                  value={commandQuery}
                  onChange={(event) => setCommandQuery(event.target.value)}
                  placeholder="Ask a business question or find a workspace…"
                  className="h-11 min-w-0 flex-1 bg-transparent text-sm text-slate-900 outline-none placeholder:text-slate-400 dark:text-white"
                />
                <kbd className="rounded border border-slate-200 bg-white px-1.5 py-0.5 text-[9px] font-semibold text-slate-400 dark:border-slate-700 dark:bg-slate-950">Esc</kbd>
              </div>
            </div>

            <div className="max-h-[55vh] overflow-y-auto px-3 pb-3">
              <div className="mb-2 px-2 text-[10px] font-black uppercase tracking-[0.12em] text-slate-400">
                {commandQuery ? "Best matches" : "Suggested investigations"}
              </div>
              {filteredCommands.length ? (
                <div className="space-y-1">
                  {filteredCommands.map((command) => {
                    const Icon = command.icon;
                    return (
                      <Link
                        key={command.title}
                        href={command.href}
                        onClick={() => setAskOpen(false)}
                        className="group flex items-center gap-3 rounded-xl px-3 py-3 transition hover:bg-slate-50 dark:hover:bg-slate-900"
                      >
                        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-slate-100 text-slate-600 group-hover:bg-violet-50 group-hover:text-violet-600 dark:bg-slate-900 dark:text-slate-300 dark:group-hover:bg-violet-950/40 dark:group-hover:text-violet-300">
                          <Icon size={16} />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block text-xs font-bold text-slate-900 dark:text-white">{command.title}</span>
                          <span className="mt-0.5 block text-[11px] leading-4 text-slate-500">{command.description}</span>
                        </span>
                        <ChevronRight size={15} className="text-slate-300 transition group-hover:translate-x-0.5 group-hover:text-slate-500" />
                      </Link>
                    );
                  })}
                </div>
              ) : (
                <div className="rounded-xl border border-dashed border-slate-200 px-4 py-8 text-center dark:border-slate-800">
                  <BrainCircuit size={22} className="mx-auto text-slate-300" />
                  <div className="mt-2 text-xs font-bold text-slate-700 dark:text-slate-200">No command matches yet</div>
                  <div className="mt-1 text-[11px] text-slate-500">Natural-language reasoning will connect here without inventing answers.</div>
                </div>
              )}
            </div>

            <div className="flex items-center justify-between border-t border-slate-100 px-4 py-2.5 text-[10px] text-slate-400 dark:border-slate-900">
              <span>Evidence-first intelligence · no invented outcomes</span>
              <span>SalsysOS</span>
            </div>
          </section>
        </div>
      ) : null}
    </div>
  );
}