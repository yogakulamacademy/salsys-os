"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Activity,
  BarChart3,
  BookOpen,
  Boxes,
  BrainCircuit,
  ChevronRight,
  CircleDollarSign,
  ClipboardCheck,
  ContactRound,
  FileSearch,
  GitBranch,
  Home,
  Inbox,
  LineChart,
  ListTodo,
  Megaphone,
  MessageSquareText,
  PlugZap,
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
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { createClient as createBrowserClient } from "@/lib/supabase/browser";

type IconType = ComponentType<{
  size?: number | string;
  strokeWidth?: number;
  className?: string;
}>;

type SidebarItem = {
  href: string;
  label: string;
  icon: IconType;
  adminOnly?: boolean;
};

type SidebarGroup = {
  id: string;
  label: string;
  icon: IconType;
  directHref?: string;
  items: SidebarItem[];
};

type WorkspaceContext = {
  activeOrganizationId: string | null;
  activeWorkspace: {
    organizationId: string;
    organizationName: string;
    organizationSlug: string;
    role: string;
  } | null;
  memberships: Array<{
    organizationId: string;
    organizationName: string;
    organizationSlug: string;
    role: string;
  }>;
  selectionRequired: boolean;
};

function isActive(pathname: string, href: string) {
  if (href === "/home") return pathname === "/home" || pathname === "/dashboard";
  if (href === "/settings") return pathname === "/settings";
  return pathname === href || pathname.startsWith(`${href}/`);
}

function requestAskSalsys() {
  document.dispatchEvent(
    new KeyboardEvent("keydown", {
      key: "k",
      code: "KeyK",
      ctrlKey: true,
      bubbles: true,
    }),
  );
}

export function DesktopHoverSidebar() {
  const pathname = usePathname();
  const sidebarRef = useRef<HTMLElement | null>(null);
  const submenuRef = useRef<HTMLElement | null>(null);
  const [open, setOpen] = useState(false);
  const [submenuGroupId, setSubmenuGroupId] = useState<string | null>(null);
  const [role, setRole] = useState<string | null>(null);
  const [organizationName, setOrganizationName] = useState("SalsysOS");

  const mock = process.env.NEXT_PUBLIC_USE_MOCK_DATA !== "false";
  const employee = !mock && role === "admissions";
  const admin = mock || role === "owner" || role === "admin";
  const manager = !mock && role === "manager";
  const privileged = admin || manager;

  useEffect(() => {
    let cancelled = false;

    async function loadIdentity() {
      if (mock) {
        setRole("admin");
        setOrganizationName("SalsysOS Demo");
        return;
      }

      try {
        const [workspaceResponse, supabase] = await Promise.all([
          fetch("/api/workspace", { cache: "no-store" }),
          Promise.resolve(createBrowserClient()),
        ]);

        if (workspaceResponse.ok) {
          const workspace = (await workspaceResponse.json()) as WorkspaceContext;
          if (!cancelled) {
            setRole(workspace.activeWorkspace?.role ?? null);
            setOrganizationName(workspace.activeWorkspace?.organizationName || "Workspace");
          }
          return;
        }

        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (!user || cancelled) return;

        const { data } = await supabase
          .from("profiles")
          .select("role")
          .eq("id", user.id)
          .maybeSingle();

        if (!cancelled) setRole(data?.role ?? null);
      } catch {
        if (!cancelled) setRole(null);
      }
    }

    void loadIdentity();
    return () => {
      cancelled = true;
    };
  }, [mock]);

  useEffect(() => {
    setOpen(false);
    setSubmenuGroupId(null);
  }, [pathname]);

  useEffect(() => {
    function closeFromOutside(event: PointerEvent) {
      if (!open) return;
      const target = event.target;
      if (!(target instanceof Node)) return;

      const insidePrimary = sidebarRef.current?.contains(target) ?? false;
      const insideSubmenu = submenuRef.current?.contains(target) ?? false;

      if (!insidePrimary && !insideSubmenu) {
        setSubmenuGroupId(null);
        setOpen(false);
      }
    }

    function closeFromEscape(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      setSubmenuGroupId(null);
      setOpen(false);
    }

    document.addEventListener("pointerdown", closeFromOutside, true);
    document.addEventListener("keydown", closeFromEscape);
    return () => {
      document.removeEventListener("pointerdown", closeFromOutside, true);
      document.removeEventListener("keydown", closeFromEscape);
    };
  }, [open]);

  const groups = useMemo<SidebarGroup[]>(() => {
    if (employee) {
      return [
        { id: "home", label: "Home", icon: Home, directHref: "/dashboard", items: [] },
        {
          id: "crm",
          label: "CRM",
          icon: UsersRound,
          items: [
            { href: "/leads", label: "My leads", icon: ContactRound },
            { href: "/pipeline", label: "My pipeline", icon: Boxes },
            { href: "/follow-ups", label: "Follow-ups", icon: ListTodo },
          ],
        },
        {
          id: "inbox",
          label: "Inbox",
          icon: Inbox,
          items: [{ href: "/conversations", label: "Conversations", icon: MessageSquareText }],
        },
      ];
    }

    if (!privileged) return [];

    return [
      { id: "home", label: "Home", icon: Home, directHref: "/home", items: [] },
      {
        id: "crm",
        label: "CRM",
        icon: UsersRound,
        items: [
          { href: "/crm", label: "Command Center", icon: Home },
          { href: "/admissions", label: "Admissions Desk", icon: ClipboardCheck },
          { href: "/leads", label: "Leads", icon: ContactRound },
          { href: "/pipeline", label: "Sales Pipeline", icon: Boxes },
          { href: "/customer-360", label: "Customer 360", icon: UsersRound },
          { href: "/follow-ups", label: "Follow-ups", icon: ListTodo },
          { href: "/contact-intelligence", label: "Contact Intelligence", icon: BrainCircuit },
          { href: "/data-quality", label: "Data Quality", icon: FileSearch },
        ],
      },
      {
        id: "inbox",
        label: "Inbox",
        icon: Inbox,
        items: [{ href: "/conversations", label: "Conversations", icon: MessageSquareText }],
      },
      {
        id: "marketing",
        label: "Marketing",
        icon: Megaphone,
        items: [
          { href: "/campaigns", label: "Campaigns", icon: Target },
          { href: "/attribution", label: "Attribution", icon: LineChart },
          { href: "/funnel", label: "Funnels", icon: GitBranch },
          { href: "/paid-media-leads", label: "Paid media", icon: Megaphone },
          { href: "/re-engaged", label: "Lead activity", icon: Activity },
          { href: "/seo", label: "SEO / AEO", icon: FileSearch },
        ],
      },
      {
        id: "intelligence",
        label: "Intelligence",
        icon: BrainCircuit,
        items: [
          { href: "/commercial-intelligence", label: "Commercial intelligence", icon: Sparkles },
          { href: "/analytics", label: "Analytics", icon: BarChart3 },
          { href: "/revenue", label: "Revenue", icon: CircleDollarSign },
          { href: "/team-performance", label: "Team performance", icon: UsersRound, adminOnly: true },
        ],
      },
      {
        id: "automation",
        label: "Automation",
        icon: Workflow,
        items: [{ href: "/automation", label: "Automations", icon: Workflow }],
      },
      {
        id: "operations",
        label: "Operations",
        icon: BookOpen,
        items: [{ href: "/course-management", label: "Course management", icon: BookOpen }],
      },
      {
        id: "system",
        label: "System",
        icon: Settings,
        items: [
          { href: "/settings/integrations", label: "Integrations", icon: PlugZap, adminOnly: true },
          { href: "/tracking", label: "Tracking", icon: Tags },
          { href: "/settings/team", label: "Team & access", icon: ShieldCheck, adminOnly: true },
          { href: "/system-health", label: "System health", icon: Activity, adminOnly: true },
        ],
      },
    ];
  }, [admin, employee, privileged]);

  const homeHref = employee ? "/dashboard" : "/home";

  const submenuGroup = useMemo(() => {
    const group = groups.find((candidate) => candidate.id === submenuGroupId);
    if (!group) return null;
    return { ...group, items: group.items.filter((item) => !item.adminOnly || admin) };
  }, [admin, groups, submenuGroupId]);

  function groupContainsCurrentRoute(group: SidebarGroup) {
    if (group.directHref && isActive(pathname, group.directHref)) return true;
    return group.items.some((item) => (!item.adminOnly || admin) && isActive(pathname, item.href));
  }

  function openSubmenu(group: SidebarGroup) {
    setOpen(true);
    setSubmenuGroupId((current) => (current === group.id ? null : group.id));
  }

  function closeNavigation() {
    setSubmenuGroupId(null);
    setOpen(false);
  }

  return (
    <>
      <aside
        ref={sidebarRef}
        onMouseEnter={() => setOpen(true)}
        onFocusCapture={() => setOpen(true)}
        className={`fixed inset-y-0 left-0 z-[70] hidden flex-col border-r border-slate-200 bg-white transition-[width,box-shadow] duration-200 ease-out lg:flex dark:border-slate-800 dark:bg-slate-950 ${open ? "w-[232px] shadow-2xl" : "w-16 shadow-none"}`}
        aria-label="Main navigation"
      >
        <div className="flex h-16 shrink-0 items-center border-b border-slate-100 px-3 dark:border-slate-900">
          <Link href={homeHref} onClick={closeNavigation} className="flex min-w-0 items-center gap-3" aria-label="SalsysOS home">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-slate-950 text-[12px] font-black text-white shadow-sm dark:bg-white dark:text-slate-950">SO</span>
            {open ? (
              <span className="min-w-0 leading-tight">
                <span className="block truncate text-sm font-black tracking-[-0.025em] text-slate-950 dark:text-white">SalsysOS</span>
                <span className="mt-0.5 block max-w-[150px] truncate text-[10px] font-medium text-slate-400">{organizationName}</span>
              </span>
            ) : null}
          </Link>
        </div>

        <nav className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden px-2 py-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <div className="space-y-1">
            {groups.map((group) => {
              const Icon = group.icon;
              const currentRoute = groupContainsCurrentRoute(group);
              const submenuSelected = submenuGroupId === group.id;
              const active = currentRoute || submenuSelected;

              if (group.directHref) {
                return (
                  <Link
                    key={group.id}
                    href={group.directHref}
                    onClick={closeNavigation}
                    title={open ? undefined : group.label}
                    className={`group flex h-11 items-center rounded-lg transition ${open ? "gap-3 px-3" : "justify-center px-0"} ${currentRoute ? "bg-slate-900 text-white shadow-sm dark:bg-white dark:text-slate-950" : "text-slate-600 hover:bg-slate-100 hover:text-slate-950 dark:text-slate-400 dark:hover:bg-slate-900 dark:hover:text-white"}`}
                  >
                    <Icon size={19} strokeWidth={currentRoute ? 2.2 : 1.8} className="shrink-0" />
                    {open ? <span className="min-w-0 flex-1 truncate text-[12px] font-semibold">{group.label}</span> : null}
                  </Link>
                );
              }

              return (
                <button
                  key={group.id}
                  type="button"
                  onClick={() => openSubmenu(group)}
                  title={open ? undefined : group.label}
                  aria-expanded={submenuSelected}
                  aria-controls={`salsys-submenu-${group.id}`}
                  className={`group flex h-11 w-full items-center rounded-lg transition ${open ? "gap-3 px-3" : "justify-center px-0"} ${currentRoute ? "bg-slate-900 text-white shadow-sm dark:bg-white dark:text-slate-950" : submenuSelected ? "bg-slate-100 text-slate-950 dark:bg-slate-900 dark:text-white" : "text-slate-600 hover:bg-slate-100 hover:text-slate-950 dark:text-slate-400 dark:hover:bg-slate-900 dark:hover:text-white"}`}
                >
                  <Icon size={19} strokeWidth={active ? 2.2 : 1.8} className="shrink-0" />
                  {open ? (
                    <>
                      <span className="min-w-0 flex-1 truncate text-left text-[12px] font-semibold">{group.label}</span>
                      <ChevronRight size={14} className={`shrink-0 transition-transform ${submenuSelected ? "translate-x-0.5" : ""}`} />
                    </>
                  ) : null}
                </button>
              );
            })}
          </div>
        </nav>

        <div className="shrink-0 border-t border-slate-100 p-2 dark:border-slate-900">
          <button
            type="button"
            onClick={() => {
              requestAskSalsys();
              closeNavigation();
            }}
            title={open ? undefined : "Ask Salsys"}
            className={`flex h-10 w-full items-center rounded-lg text-slate-600 transition hover:bg-violet-50 hover:text-violet-700 dark:text-slate-400 dark:hover:bg-violet-950/30 dark:hover:text-violet-300 ${open ? "gap-3 px-3" : "justify-center"}`}
          >
            <Sparkles size={18} className="shrink-0" />
            {open ? <span className="text-[12px] font-semibold">Ask Salsys</span> : null}
          </button>

          {!employee ? (
            <Link
              href="/settings"
              onClick={closeNavigation}
              title={open ? undefined : "Settings"}
              className={`mt-0.5 flex h-10 items-center rounded-lg text-slate-600 transition hover:bg-slate-100 hover:text-slate-950 dark:text-slate-400 dark:hover:bg-slate-900 dark:hover:text-white ${open ? "gap-3 px-3" : "justify-center"} ${isActive(pathname, "/settings") ? "bg-slate-100 text-slate-950 dark:bg-slate-900 dark:text-white" : ""}`}
            >
              <Settings size={18} className="shrink-0" />
              {open ? <span className="text-[12px] font-semibold">Settings</span> : null}
            </Link>
          ) : null}

          <div className={open ? "mt-2 flex items-center gap-2 px-3 py-1 text-[10px] font-medium text-slate-400" : "mt-2 flex justify-center py-1"} title={mock ? "Development" : "Live workspace"}>
            <span className={`h-2 w-2 rounded-full ${mock ? "bg-amber-400" : "bg-emerald-500"}`} />
            {open ? (mock ? "Development" : "Live workspace") : null}
          </div>
        </div>
      </aside>

      {open && submenuGroup && submenuGroup.items.length > 0 ? (
        <aside
          ref={submenuRef}
          id={`salsys-submenu-${submenuGroup.id}`}
          className="fixed inset-y-0 left-[232px] z-[69] hidden w-[272px] flex-col border-r border-slate-200 bg-white shadow-2xl lg:flex dark:border-slate-800 dark:bg-slate-950"
          aria-label={`${submenuGroup.label} submenu`}
        >
          <div className="flex h-16 shrink-0 items-center justify-between border-b border-slate-100 px-4 dark:border-slate-900">
            <div className="min-w-0">
              <div className="text-[10px] font-bold uppercase tracking-[0.11em] text-slate-400">SalsysOS</div>
              <div className="mt-0.5 truncate text-[15px] font-black tracking-[-0.02em] text-slate-950 dark:text-white">{submenuGroup.label}</div>
            </div>
            <button type="button" onClick={() => setSubmenuGroupId(null)} className="grid h-8 w-8 place-items-center rounded-lg text-slate-400 transition hover:bg-slate-100 hover:text-slate-900 dark:hover:bg-slate-900 dark:hover:text-white" aria-label={`Close ${submenuGroup.label} submenu`}>
              <X size={16} />
            </button>
          </div>

          <nav className="flex-1 overflow-y-auto p-3">
            <div className="space-y-1">
              {submenuGroup.items.map((item) => {
                const Icon = item.icon;
                const itemActive = isActive(pathname, item.href);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={closeNavigation}
                    className={`group flex items-center gap-3 rounded-xl px-3 py-2.5 transition ${itemActive ? "bg-slate-950 text-white dark:bg-white dark:text-slate-950" : "text-slate-600 hover:bg-slate-100 hover:text-slate-950 dark:text-slate-300 dark:hover:bg-slate-900 dark:hover:text-white"}`}
                  >
                    <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-lg ${itemActive ? "bg-white/10 text-white dark:bg-slate-950/10 dark:text-slate-950" : "bg-slate-100 text-slate-500 group-hover:bg-white dark:bg-slate-900 dark:text-slate-400 dark:group-hover:bg-slate-800"}`}>
                      <Icon size={16} strokeWidth={itemActive ? 2.2 : 1.8} />
                    </span>
                    <span className="min-w-0 flex-1 truncate text-[12px] font-semibold">{item.label}</span>
                    <ChevronRight size={14} className={itemActive ? "opacity-80" : "text-slate-300"} />
                  </Link>
                );
              })}
            </div>
          </nav>

          <div className="border-t border-slate-100 p-3 dark:border-slate-900">
            <button
              type="button"
              onClick={() => {
                requestAskSalsys();
                closeNavigation();
              }}
              className="flex w-full items-center gap-3 rounded-xl border border-violet-100 bg-violet-50/70 px-3 py-2.5 text-left text-violet-700 transition hover:bg-violet-50 dark:border-violet-900/50 dark:bg-violet-950/20 dark:text-violet-200 dark:hover:bg-violet-950/40"
            >
              <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-white text-violet-600 shadow-sm dark:bg-slate-900 dark:text-violet-300"><Sparkles size={15} /></span>
              <span className="min-w-0 flex-1">
                <span className="block text-[11px] font-bold">Ask Salsys</span>
                <span className="block truncate text-[9px] text-violet-500/80 dark:text-violet-300/70">Investigate this workspace</span>
              </span>
            </button>
          </div>
        </aside>
      ) : null}

      <style jsx global>{`
        @media (min-width: 1024px) {
          .salsys-meta-sidebar-shell .legacy-shell-host > div > aside {
            display: none !important;
          }
          .salsys-meta-sidebar-shell .legacy-shell-host > div > div.min-h-screen {
            padding-left: 4rem !important;
          }
          .salsys-meta-sidebar-shell .legacy-shell-host button[aria-label="Open section menu"] {
            display: none !important;
          }
        }
      `}</style>
    </>
  );
}
