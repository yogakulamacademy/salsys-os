"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Activity,
  BarChart3,
  BookOpen,
  Boxes,
  BrainCircuit,
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
  label: string;
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
  if (href === "/home") {
    return pathname === "/home" || pathname === "/dashboard";
  }

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
  const [open, setOpen] = useState(false);
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
            setOrganizationName(
              workspace.activeWorkspace?.organizationName || "Workspace",
            );
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
  }, [pathname]);

  useEffect(() => {
    function closeFromOutside(event: PointerEvent) {
      if (!open || !sidebarRef.current) return;
      const target = event.target;
      if (target instanceof Node && !sidebarRef.current.contains(target)) {
        setOpen(false);
      }
    }

    function closeFromEscape(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
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
        {
          label: "Workspace",
          items: [{ href: "/dashboard", label: "Today", icon: Home }],
        },
        {
          label: "CRM",
          items: [
            { href: "/leads", label: "My leads", icon: ContactRound },
            { href: "/pipeline", label: "My pipeline", icon: Boxes },
            { href: "/follow-ups", label: "Follow-ups", icon: ListTodo },
          ],
        },
        {
          label: "Inbox",
          items: [
            {
              href: "/conversations",
              label: "Conversations",
              icon: MessageSquareText,
            },
          ],
        },
      ];
    }

    if (!privileged) return [];

    return [
      {
        label: "Workspace",
        items: [{ href: "/home", label: "Home", icon: Home }],
      },
      {
        label: "CRM",
        items: [
          { href: "/leads", label: "Leads", icon: ContactRound },
          { href: "/pipeline", label: "Pipeline", icon: Boxes },
          { href: "/admissions", label: "Admissions", icon: ClipboardCheck },
          {
            href: "/contact-intelligence",
            label: "Customer 360",
            icon: BrainCircuit,
          },
          { href: "/follow-ups", label: "Follow-ups", icon: ListTodo },
          {
            href: "/team-performance",
            label: "Team performance",
            icon: UsersRound,
            adminOnly: true,
          },
        ],
      },
      {
        label: "Inbox",
        items: [
          {
            href: "/conversations",
            label: "Conversations",
            icon: Inbox,
          },
        ],
      },
      {
        label: "Growth",
        items: [
          { href: "/campaigns", label: "Campaigns", icon: Target },
          { href: "/paid-media-leads", label: "Paid media", icon: Megaphone },
          { href: "/re-engaged", label: "Lead activity", icon: Activity },
          { href: "/seo", label: "SEO / AEO", icon: FileSearch },
        ],
      },
      {
        label: "Intelligence",
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
        label: "Automation",
        items: [{ href: "/automation", label: "Automations", icon: Workflow }],
      },
      {
        label: "Operations",
        items: [
          {
            href: "/course-management",
            label: "Course management",
            icon: BookOpen,
          },
        ],
      },
      {
        label: "System",
        items: [
          {
            href: "/settings/integrations",
            label: "Integrations",
            icon: PlugZap,
            adminOnly: true,
          },
          {
            href: "/settings/team",
            label: "Team & access",
            icon: ShieldCheck,
            adminOnly: true,
          },
          {
            href: "/system-health",
            label: "System health",
            icon: Activity,
            adminOnly: true,
          },
        ],
      },
    ];
  }, [admin, employee, privileged]);

  const homeHref = employee ? "/dashboard" : "/home";

  return (
    <>
      <aside
        ref={sidebarRef}
        onMouseEnter={() => setOpen(true)}
        onFocusCapture={() => setOpen(true)}
        className={`fixed inset-y-0 left-0 z-[70] hidden flex-col border-r border-slate-200 bg-white transition-[width,box-shadow] duration-200 ease-out lg:flex dark:border-slate-800 dark:bg-slate-950 ${
          open ? "w-[232px] shadow-2xl" : "w-16 shadow-none"
        }`}
        aria-label="Main navigation"
      >
        <div className="flex h-16 shrink-0 items-center border-b border-slate-100 px-3 dark:border-slate-900">
          <Link
            href={homeHref}
            onClick={() => setOpen(false)}
            className="flex min-w-0 items-center gap-3"
            aria-label="SalsysOS home"
          >
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-slate-950 text-[12px] font-black text-white shadow-sm dark:bg-white dark:text-slate-950">
              SO
            </span>
            {open ? (
              <span className="min-w-0 leading-tight">
                <span className="block truncate text-sm font-black tracking-[-0.025em] text-slate-950 dark:text-white">
                  SalsysOS
                </span>
                <span className="mt-0.5 block max-w-[150px] truncate text-[10px] font-medium text-slate-400">
                  {organizationName}
                </span>
              </span>
            ) : null}
          </Link>
        </div>

        <nav className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden px-2 py-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {groups.map((group, groupIndex) => {
            const visibleItems = group.items.filter(
              (item) => !item.adminOnly || admin,
            );

            if (!visibleItems.length) return null;

            return (
              <div key={group.label} className={groupIndex > 0 ? "mt-2" : ""}>
                {open ? (
                  <div className="px-2 pb-1 pt-1 text-[9px] font-black uppercase tracking-[0.12em] text-slate-300 dark:text-slate-600">
                    {group.label}
                  </div>
                ) : groupIndex > 0 ? (
                  <div className="mx-auto my-1 h-px w-7 bg-slate-100 dark:bg-slate-900" />
                ) : null}

                <div className="space-y-0.5">
                  {visibleItems.map((item) => {
                    const Icon = item.icon;
                    const active = isActive(pathname, item.href);

                    return (
                      <Link
                        key={item.href}
                        href={item.href}
                        onClick={() => setOpen(false)}
                        title={open ? undefined : item.label}
                        className={`group flex h-10 items-center rounded-lg transition ${
                          open ? "gap-3 px-3" : "justify-center px-0"
                        } ${
                          active
                            ? "bg-slate-900 text-white shadow-sm dark:bg-white dark:text-slate-950"
                            : "text-slate-600 hover:bg-slate-100 hover:text-slate-950 dark:text-slate-400 dark:hover:bg-slate-900 dark:hover:text-white"
                        }`}
                      >
                        <Icon
                          size={18}
                          strokeWidth={active ? 2.2 : 1.8}
                          className="shrink-0"
                        />
                        {open ? (
                          <span className="min-w-0 flex-1 truncate text-[12px] font-semibold">
                            {item.label}
                          </span>
                        ) : null}
                      </Link>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </nav>

        <div className="shrink-0 border-t border-slate-100 p-2 dark:border-slate-900">
          <button
            type="button"
            onClick={() => {
              requestAskSalsys();
              setOpen(false);
            }}
            title={open ? undefined : "Ask Salsys"}
            className={`flex h-10 w-full items-center rounded-lg text-slate-600 transition hover:bg-violet-50 hover:text-violet-700 dark:text-slate-400 dark:hover:bg-violet-950/30 dark:hover:text-violet-300 ${
              open ? "gap-3 px-3" : "justify-center"
            }`}
          >
            <Search size={18} className="shrink-0" />
            {open ? <span className="text-[12px] font-semibold">Ask Salsys</span> : null}
          </button>

          {!employee ? (
            <Link
              href="/settings"
              onClick={() => setOpen(false)}
              title={open ? undefined : "Settings"}
              className={`mt-0.5 flex h-10 items-center rounded-lg text-slate-600 transition hover:bg-slate-100 hover:text-slate-950 dark:text-slate-400 dark:hover:bg-slate-900 dark:hover:text-white ${
                open ? "gap-3 px-3" : "justify-center"
              } ${
                isActive(pathname, "/settings")
                  ? "bg-slate-100 text-slate-950 dark:bg-slate-900 dark:text-white"
                  : ""
              }`}
            >
              <Settings size={18} className="shrink-0" />
              {open ? <span className="text-[12px] font-semibold">Settings</span> : null}
            </Link>
          ) : null}

          {open ? (
            <div className="mt-2 flex items-center gap-2 px-3 py-1 text-[10px] font-medium text-slate-400">
              <span className={`h-2 w-2 rounded-full ${mock ? "bg-amber-400" : "bg-emerald-500"}`} />
              {mock ? "Development" : "Live workspace"}
            </div>
          ) : (
            <div className="mt-2 flex justify-center py-1" title={mock ? "Development" : "Live workspace"}>
              <span className={`h-2 w-2 rounded-full ${mock ? "bg-amber-400" : "bg-emerald-500"}`} />
            </div>
          )}
        </div>
      </aside>

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
