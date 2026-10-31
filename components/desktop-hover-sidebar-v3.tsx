"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BarChart3,
  BookOpen,
  ChevronRight,
  CircleDollarSign,
  Home,
  Megaphone,
  Menu,
  Settings,
  Sparkles,
  UsersRound,
  Workflow,
  X,
} from "lucide-react";
import { type ComponentType, useEffect, useMemo, useRef, useState } from "react";
import { createClient as createBrowserClient } from "@/lib/supabase/browser";

type IconType = ComponentType<{
  size?: number | string;
  strokeWidth?: number;
  className?: string;
}>;

type SectionItem = {
  label: string;
  href: string;
};

type SectionLink = {
  id: string;
  label: string;
  icon: IconType;
  href: string;
  activeHrefs?: string[];
  items?: SectionItem[];
};

type WorkspaceContext = {
  activeWorkspace: { organizationName: string; role: string } | null;
};

function activePath(pathname: string, href: string) {
  if (href === "/home") return pathname === "/home";
  if (href === "/dashboard") return pathname === "/dashboard";
  if (href === "/settings") {
    return pathname === "/settings" || pathname.startsWith("/settings/");
  }
  return pathname === href || pathname.startsWith(`${href}/`);
}

function askSalsys() {
  document.dispatchEvent(
    new KeyboardEvent("keydown", {
      key: "k",
      code: "KeyK",
      ctrlKey: true,
      bubbles: true,
    }),
  );
}

export function DesktopHoverSidebarV3() {
  const pathname = usePathname();
  const primaryRef = useRef<HTMLElement | null>(null);
  const [open, setOpen] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
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
        const response = await fetch("/api/workspace", { cache: "no-store" });
        if (response.ok) {
          const workspace = (await response.json()) as WorkspaceContext;
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
    setMobileOpen(false);
  }, [pathname]);

  useEffect(() => {
    function outside(event: PointerEvent) {
      if (!open || !(event.target instanceof Node)) return;
      if (!primaryRef.current?.contains(event.target)) setOpen(false);
    }

    function escape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
        setMobileOpen(false);
      }
    }

    document.addEventListener("pointerdown", outside, true);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("pointerdown", outside, true);
      document.removeEventListener("keydown", escape);
    };
  }, [open]);

  useEffect(() => {
    if (!mobileOpen) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [mobileOpen]);

  const sections = useMemo<SectionLink[]>(() => {
    if (employee) {
      return [
        {
          id: "home",
          label: "Home",
          icon: Home,
          href: "/dashboard",
          items: [{ label: "My work", href: "/dashboard" }],
        },
        {
          id: "crm",
          label: "CRM",
          icon: UsersRound,
          href: "/leads",
          activeHrefs: ["/pipeline", "/conversations", "/follow-ups", "/customer-360"],
          items: [
            { label: "My Leads", href: "/leads" },
            { label: "My Pipeline", href: "/pipeline" },
            { label: "Inbox", href: "/conversations" },
            { label: "Tasks & Follow-ups", href: "/follow-ups" },
          ],
        },
      ];
    }

    if (!privileged) return [];

    return [
      {
        id: "home",
        label: "Home",
        icon: Home,
        href: "/home",
        items: [{ label: "Command Center", href: "/home" }],
      },
      {
        id: "crm",
        label: "CRM",
        icon: UsersRound,
        href: "/leads",
        activeHrefs: [
          "/admissions",
          "/pipeline",
          "/conversations",
          "/follow-ups",
          "/customer-360",
          "/data-quality",
          "/re-engaged",
        ],
        items: [
          { label: "Leads", href: "/leads" },
          { label: "Admissions", href: "/admissions" },
          { label: "Pipeline", href: "/pipeline" },
          { label: "Inbox", href: "/conversations" },
          { label: "Tasks & Follow-ups", href: "/follow-ups" },
          { label: "Re-engaged", href: "/re-engaged" },
        ],
      },
      {
        id: "marketing",
        label: "Marketing",
        icon: Megaphone,
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
          { label: "Overview", href: "/marketing" },
          { label: "Campaigns", href: "/campaigns" },
          { label: "Acquisition", href: "/paid-media-leads" },
          { label: "Analytics", href: "/analytics" },
          { label: "Funnel", href: "/funnel" },
          { label: "Attribution", href: "/attribution" },
          { label: "Search Intelligence", href: "/seo" },
        ],
      },
      {
        id: "revenue",
        label: "Revenue",
        icon: CircleDollarSign,
        href: "/revenue",
        items: [{ label: "Revenue workspace", href: "/revenue" }],
      },
      {
        id: "operations",
        label: "Operations",
        icon: BookOpen,
        href: "/operations",
        activeHrefs: ["/availability", "/course-management", "/enrollments"],
        items: [
          { label: "Overview", href: "/operations" },
          { label: "Availability", href: "/availability" },
          { label: "Programs & Batches", href: "/course-management" },
          { label: "Enrollments", href: "/enrollments" },
        ],
      },
      {
        id: "performance",
        label: "Performance",
        icon: BarChart3,
        href: "/team-performance",
        activeHrefs: ["/team", "/contact-intelligence"],
        items: [
          ...(admin ? [{ label: "Team performance", href: "/team-performance" }] : []),
          { label: "Contact performance", href: "/contact-intelligence" },
          { label: "Team", href: "/team" },
        ],
      },
      {
        id: "automation",
        label: "Automation",
        icon: Workflow,
        href: "/automation",
        items: [{ label: "Workflows", href: "/automation" }],
      },
      {
        id: "settings",
        label: "Settings",
        icon: Settings,
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
          { label: "Overview", href: "/settings/overview" },
          ...(admin
            ? [
                { label: "Integrations", href: "/settings/integrations" },
                { label: "Team & Permissions", href: "/settings/team" },
                { label: "Tracking & Data", href: "/tracking" },
                { label: "System Health", href: "/system-health" },
              ]
            : []),
          { label: "Settings", href: "/settings" },
        ],
      },
    ];
  }, [admin, employee, privileged]);

  function isCurrent(section: SectionLink) {
    if (activePath(pathname, section.href)) return true;
    return section.activeHrefs?.some((href) => activePath(pathname, href)) ?? false;
  }

  function closeNav() {
    setOpen(false);
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setMobileOpen(true)}
        className="fixed left-3 top-3 z-[75] grid h-10 w-10 place-items-center rounded-ui border border-line bg-surface text-copy-muted shadow-sm transition hover:bg-surface-muted hover:text-copy-strong lg:hidden"
        aria-label="Open SalsysOS navigation"
      >
        <Menu size={19} strokeWidth={1.8} />
      </button>

      <aside
        ref={primaryRef}
        onMouseEnter={() => setOpen(true)}
        onFocusCapture={() => setOpen(true)}
        className={`fixed inset-y-0 left-0 z-[70] hidden flex-col border-r border-line bg-surface transition-[width,box-shadow] duration-200 lg:flex ${open ? "w-[232px] shadow-panel" : "w-16"}`}
        aria-label="Primary navigation"
      >
        <div className="flex h-16 shrink-0 items-center border-b border-line px-3">
          <Link href={employee ? "/dashboard" : "/home"} onClick={closeNav} className="flex min-w-0 items-center gap-3">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-brand-900 text-[12px] font-semibold text-white shadow-sm">SO</span>
            {open ? (
              <span className="min-w-0">
                <span className="block truncate text-[14px] font-semibold text-copy-strong">SalsysOS</span>
                <span className="block max-w-[150px] truncate text-[12px] text-copy-subtle">{organizationName}</span>
              </span>
            ) : null}
          </Link>
        </div>

        <nav className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden px-2 py-3 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <div className="space-y-1.5">
            {sections.map((section) => {
              const Icon = section.icon;
              const current = isCurrent(section);
              return (
                <Link
                  key={section.id}
                  href={section.href}
                  onClick={closeNav}
                  title={open ? undefined : section.label}
                  aria-current={current ? "page" : undefined}
                  className={`flex h-11 items-center rounded-ui transition ${open ? "gap-3 px-3" : "justify-center"} ${current ? "bg-brand-700 text-white shadow-sm" : "text-copy-muted hover:bg-surface-muted hover:text-copy-strong"}`}
                >
                  <Icon size={19} strokeWidth={1.8} />
                  {open ? <span className="text-[14px] font-medium">{section.label}</span> : null}
                </Link>
              );
            })}
          </div>
        </nav>

        <div className="shrink-0 border-t border-line p-2.5">
          <button
            type="button"
            onClick={() => {
              askSalsys();
              closeNav();
            }}
            className={`flex h-10 w-full items-center rounded-ui text-copy-muted transition hover:bg-brand-50 hover:text-brand-700 ${open ? "gap-3 px-3" : "justify-center"}`}
          >
            <Sparkles size={18} strokeWidth={1.8} />
            {open ? <span className="text-[13px] font-medium">Ask Salsys</span> : null}
          </button>

          <div className={open ? "mt-2 flex items-center gap-2 px-3 py-1 text-[11px] text-copy-subtle" : "mt-2 flex justify-center py-1"}>
            <span className={`h-2 w-2 rounded-full ${mock ? "bg-amber-400" : "bg-emerald-500"}`} />
            {open ? (mock ? "Development" : "Live workspace") : null}
          </div>
        </div>
      </aside>

      {mobileOpen ? (
        <div className="fixed inset-0 z-[90] lg:hidden">
          <button type="button" className="absolute inset-0 bg-brand-950/30 backdrop-blur-[2px]" aria-label="Close navigation" onClick={() => setMobileOpen(false)} />

          <aside className="absolute inset-y-0 left-0 flex w-[min(90vw,360px)] flex-col border-r border-line bg-surface shadow-panel">
            <div className="flex h-16 shrink-0 items-center gap-3 border-b border-line px-4">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-brand-900 text-[12px] font-semibold text-white shadow-sm">SO</span>
              <div className="min-w-0 flex-1">
                <div className="truncate text-[14px] font-semibold text-copy-strong">SalsysOS</div>
                <div className="truncate text-[11px] text-copy-subtle">{organizationName}</div>
              </div>
              <button type="button" onClick={() => setMobileOpen(false)} className="grid h-9 w-9 place-items-center rounded-ui text-copy-muted transition hover:bg-surface-muted hover:text-copy-strong" aria-label="Close navigation">
                <X size={18} strokeWidth={1.8} />
              </button>
            </div>

            <div className="border-b border-line p-3">
              <button
                type="button"
                onClick={() => {
                  setMobileOpen(false);
                  window.setTimeout(() => askSalsys(), 0);
                }}
                className="flex w-full items-center gap-3 rounded-ui border border-brand-100 bg-brand-50 px-3 py-3 text-left text-brand-700 transition hover:bg-brand-100"
              >
                <span className="grid h-8 w-8 shrink-0 place-items-center rounded-ui bg-surface text-brand-700 shadow-sm"><Sparkles size={16} strokeWidth={1.8} /></span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[13px] font-semibold">Ask Salsys</span>
                  <span className="block truncate text-[10px] text-copy-subtle">Find evidence, navigate or move work forward</span>
                </span>
              </button>
            </div>

            <nav className="min-h-0 flex-1 overflow-y-auto px-3 py-4">
              <div className="space-y-5">
                {sections.map((section) => {
                  const Icon = section.icon;
                  const current = isCurrent(section);
                  return (
                    <section key={section.id}>
                      <Link
                        href={section.href}
                        onClick={() => setMobileOpen(false)}
                        className={`flex items-center gap-3 rounded-ui px-3 py-2.5 transition ${current ? "bg-brand-50 text-brand-700" : "text-copy-strong hover:bg-surface-muted"}`}
                      >
                        <Icon size={18} strokeWidth={1.8} />
                        <span className="flex-1 text-[13px] font-semibold">{section.label}</span>
                        <ChevronRight size={15} className="text-copy-subtle" />
                      </Link>

                      {section.items?.length ? (
                        <div className="mt-1 space-y-0.5 pl-9">
                          {section.items.map((item) => {
                            const active = activePath(pathname, item.href);
                            return (
                              <Link
                                key={`${section.id}-${item.href}`}
                                href={item.href}
                                onClick={() => setMobileOpen(false)}
                                className={`block rounded-ui px-3 py-2 text-[12px] transition ${active ? "bg-surface-muted font-semibold text-brand-700" : "text-copy-muted hover:bg-surface-muted hover:text-copy-strong"}`}
                              >
                                {item.label}
                              </Link>
                            );
                          })}
                        </div>
                      ) : null}
                    </section>
                  );
                })}
              </div>
            </nav>

            <div className="flex shrink-0 items-center gap-2 border-t border-line px-4 py-3 text-[11px] text-copy-subtle">
              <span className={`h-2 w-2 rounded-full ${mock ? "bg-amber-400" : "bg-emerald-500"}`} />
              <span>{mock ? "Development workspace" : "Live workspace"}</span>
            </div>
          </aside>
        </div>
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

        @media (max-width: 1023px) {
          .salsys-meta-sidebar-shell .legacy-shell-host button[aria-label="Open navigation"] {
            visibility: hidden !important;
            pointer-events: none !important;
          }
        }
      `}</style>
    </>
  );
}
