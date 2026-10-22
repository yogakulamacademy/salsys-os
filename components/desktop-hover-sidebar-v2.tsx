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
  Sparkles,
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
  group?: string;
  adminOnly?: boolean;
};

type SidebarGroup = {
  id: string;
  label: string;
  icon: IconType;
  directHref?: string;
  description?: string;
  items: SidebarItem[];
};

type WorkspaceContext = {
  activeWorkspace: {
    organizationName: string;
    role: string;
  } | null;
};

function isActive(pathname: string, href: string) {
  if (href === "/home") return pathname === "/home" || pathname === "/dashboard";
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

export function DesktopHoverSidebarV2() {
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
        const workspaceResponse = await fetch("/api/workspace", { cache: "no-store" });
        if (workspaceResponse.ok) {
          const workspace = (await workspaceResponse.json()) as WorkspaceContext;
          if (!cancelled) {
            setRole(workspace.activeWorkspace?.role ?? null);
            setOrganizationName(workspace.activeWorkspace?.organizationName || "Workspace");
          }
          return;
        }

        const supabase = createBrowserClient();
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
        { id: "overview", label: "Overview", icon: Home, directHref: "/dashboard", items: [] },
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
      {
        id: "overview",
        label: "Overview",
        icon: Home,
        directHref: "/home",
        items: [],
      },
      {
        id: "crm",
        label: "CRM",
        icon: UsersRound,
        description: "Leads, admissions and follow-up work.",
        items: [
          { href: "/leads", label: "Leads", icon: ContactRound },
          { href: "/admissions", label: "Admissions Desk", icon: ClipboardCheck },
          { href: "/pipeline", label: "Pipeline", icon: Boxes },
          { href: "/follow-ups", label: "Follow-ups", icon: ListTodo },
        ],
      },
      {
        id: "marketing",
        label: "Marketing",
        icon: Megaphone,
        description: "Acquisition, campaign performance and customer growth.",
        items: [
          { href: "/commercial-intelligence", label: "Marketing Command Center", icon: BarChart3, group: "OVERVIEW" },
          { href: "/campaigns", label: "Campaigns", icon: Target, group: "PAID GROWTH" },
          { href: "/paid-media-leads", label: "Paid Media Leads", icon: UsersRound, group: "PAID GROWTH" },
          { href: "/re-engaged", label: "Re-engaged Leads", icon: Activity, group: "PAID GROWTH" },
          { href: "/seo", label: "SEO Overview", icon: FileSearch, group: "ORGANIC GROWTH" },
          { href: "/analytics", label: "Analytics", icon: BarChart3, group: "ANALYSIS" },
          { href: "/funnel", label: "Funnel", icon: GitBranch, group: "ANALYSIS" },
          { href: "/attribution", label: "Attribution", icon: LineChart, group: "ANALYSIS" },
          { href: "/revenue", label: "Revenue", icon: CircleDollarSign, group: "ANALYSIS" },
          { href: "/settings/integrations", label: "Marketing Integrations", icon: PlugZap, group: "SETTINGS", adminOnly: true },
        ],
      },
      {
        id: "inbox",
        label: "Inbox",
        icon: Inbox,
        items: [{ href: "/conversations", label: "Conversations", icon: MessageSquareText }],
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
        items: [{ href: "/course-management", label: "Course Management", icon: BookOpen }],
      },
      {
        id: "intelligence",
        label: "Intelligence",
        icon: BrainCircuit,
        items: [
          { href: "/contact-intelligence", label: "Customer 360", icon: BrainCircuit },
          { href: "/team-performance", label: "Team Performance", icon: UsersRound, adminOnly: true },
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

  const groupedItems = useMemo(() => {
    if (!submenuGroup) return [] as Array<[string, SidebarItem[]]>;
    const order = ["OVERVIEW", "PAID GROWTH", "ORGANIC GROWTH", "ANALYSIS", "SETTINGS"];
    const hasExplicitGroups = submenuGroup.items.some((item) => item.group);
    if (!hasExplicitGroups) return [["", submenuGroup.items]];
    return order
      .map((groupLabel) => [groupLabel, submenuGroup.items.filter((item) => item.group === groupLabel)] as [string, SidebarItem[]])
      .filter(([, items]) => items.length > 0);
  }, [submenuGroup]);

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
                      <ChevronRight size={14} className="shrink-0" />
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
          className={`fixed inset-y-0 left-[232px] z-[69] hidden flex-col border-r border-slate-200 bg-white shadow-2xl lg:flex dark:border-slate-800 dark:bg-slate-950 ${submenuGroup.id === "marketing" ? "w-[292px]" : "w-[272px]"}`}
          aria-label={`${submenuGroup.label} submenu`}
        >
          <div className="flex h-20 shrink-0 items-start justify-between border-b border-slate-100 px-5 py-4 dark:border-slate-900">
            <div className="min-w-0">
              <div className="truncate text-[17px] font-black tracking-[-0.03em] text-slate-950 dark:text-white">{submenuGroup.label}</div>
              {submenuGroup.description ? <p className="mt-1 max-w-[220px] text-[10px] leading-4 text-slate-400">{submenuGroup.description}</p> : null}
            </div>
            <button type="button" onClick={() => setSubmenuGroupId(null)} className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-slate-400 transition hover:bg-slate-100 hover:text-slate-900 dark:hover:bg-slate-900 dark:hover:text-white" aria-label={`Close ${submenuGroup.label} submenu`}>
              <X size={16} />
            </button>
          </div>

          <nav className="flex-1 overflow-y-auto px-3 py-3">
            {groupedItems.map(([groupLabel, items]) => (
              <section key={groupLabel || "default"} className={groupLabel ? "mb-5" : ""}>
                {groupLabel ? <div className="mb-1.5 px-3 text-[9px] font-bold uppercase tracking-[0.16em] text-slate-400">{groupLabel}</div> : null}
                <div className="space-y-1">
                  {items.map((item) => {
                    const Icon = item.icon;
                    const itemActive = isActive(pathname, item.href);
                    return (
                      <Link
                        key={`${groupLabel}-${item.href}`}
                        href={item.href}
                        onClick={closeNavigation}
                        className={`group flex items-center gap-3 rounded-lg px-3 py-2.5 transition ${itemActive ? "bg-emerald-50 text-emerald-950 dark:bg-emerald-950/30 dark:text-emerald-100" : "text-slate-600 hover:bg-slate-50 hover:text-slate-950 dark:text-slate-300 dark:hover:bg-slate-900 dark:hover:text-white"}`}
                      >
                        <Icon size={15} strokeWidth={itemActive ? 2.2 : 1.8} className={itemActive ? "text-emerald-700 dark:text-emerald-300" : "text-slate-400"} />
                        <span className="min-w-0 flex-1 truncate text-[12px] font-semibold">{item.label}</span>
                        {itemActive ? <ChevronRight size={13} className="text-emerald-600" /> : null}
                      </Link>
                    );
                  })}
                </div>
              </section>
            ))}
          </nav>
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
