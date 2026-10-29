"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BookOpen,
  BrainCircuit,
  Home,
  Inbox,
  Megaphone,
  Settings,
  Sparkles,
  UsersRound,
  Workflow,
} from "lucide-react";
import { type ComponentType, useEffect, useMemo, useRef, useState } from "react";
import { createClient as createBrowserClient } from "@/lib/supabase/browser";

type IconType = ComponentType<{ size?: number | string; strokeWidth?: number; className?: string }>;

type SectionLink = {
  id: string;
  label: string;
  icon: IconType;
  href: string;
  activeHrefs?: string[];
};

type WorkspaceContext = {
  activeWorkspace: { organizationName: string; role: string } | null;
};

function activePath(pathname: string, href: string) {
  if (href === "/home") return pathname === "/home";
  if (href === "/dashboard") return pathname === "/dashboard";
  if (href === "/settings") return pathname === "/settings" || pathname.startsWith("/settings/");
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
  const [role, setRole] = useState<string | null>(null);
  const [organizationName, setOrganizationName] = useState("SalsysOS");

  const mock = process.env.NEXT_PUBLIC_USE_MOCK_DATA !== "false";
  const employee = !mock && role === "admissions";
  const admin = mock || role === "owner" || role === "admin";
  const privileged = admin || (!mock && role === "manager");

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
            setOrganizationName(
              workspace.activeWorkspace?.organizationName || "Workspace",
            );
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
  }, [pathname]);

  useEffect(() => {
    function outside(event: PointerEvent) {
      if (!open || !(event.target instanceof Node)) return;
      if (!primaryRef.current?.contains(event.target)) setOpen(false);
    }

    function escape(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }

    document.addEventListener("pointerdown", outside, true);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("pointerdown", outside, true);
      document.removeEventListener("keydown", escape);
    };
  }, [open]);

  const sections = useMemo<SectionLink[]>(() => {
    if (employee) {
      return [
        {
          id: "overview",
          label: "Overview",
          icon: Home,
          href: "/dashboard",
        },
        {
          id: "crm",
          label: "CRM",
          icon: UsersRound,
          href: "/leads",
          activeHrefs: ["/pipeline", "/follow-ups"],
        },
        {
          id: "inbox",
          label: "Inbox",
          icon: Inbox,
          href: "/conversations",
        },
      ];
    }

    if (!privileged) return [];

    return [
      {
        id: "overview",
        label: "Overview",
        icon: Home,
        href: "/home",
      },
      {
        id: "crm",
        label: "CRM",
        icon: UsersRound,
        href: "/crm",
        activeHrefs: [
          "/leads",
          "/admissions",
          "/pipeline",
          "/follow-ups",
          "/customer-360",
          "/contact-intelligence",
          "/data-quality",
        ],
      },
      {
        id: "team",
        label: "Team",
        icon: UsersRound,
        href: "/team",
        activeHrefs: ["/team-performance", "/settings/team"],
      },
      {
        id: "inbox",
        label: "Inbox",
        icon: Inbox,
        href: "/conversations",
      },
      {
        id: "growth",
        label: "Growth",
        icon: Megaphone,
        href: "/marketing",
        activeHrefs: [
          "/campaigns",
          "/paid-media-leads",
          "/re-engaged",
          "/seo",
          "/analytics",
          "/funnel",
          "/attribution",
          "/revenue",
          "/tracking",
        ],
      },
      {
        id: "automation",
        label: "Automation",
        icon: Workflow,
        href: "/automation",
      },
      {
        id: "intelligence",
        label: "Intelligence",
        icon: BrainCircuit,
        href: "/commercial-intelligence",
      },
      {
        id: "operations",
        label: "Operations",
        icon: BookOpen,
        href: "/course-management",
      },
      {
        id: "system",
        label: "System",
        icon: Settings,
        href: "/settings/overview",
        activeHrefs: [
          "/settings",
          "/settings/integrations",
          "/settings/knowledge",
          "/settings/organizations",
          "/system-health",
        ],
      },
    ];
  }, [employee, privileged]);

  function isCurrent(section: SectionLink) {
    if (activePath(pathname, section.href)) return true;
    return section.activeHrefs?.some((href) => activePath(pathname, href)) ?? false;
  }

  function closeNav() {
    setOpen(false);
  }

  return (
    <>
      <aside
        ref={primaryRef}
        onMouseEnter={() => setOpen(true)}
        onFocusCapture={() => setOpen(true)}
        className={`fixed inset-y-0 left-0 z-[70] hidden flex-col border-r border-line bg-surface transition-[width,box-shadow] duration-200 lg:flex ${
          open ? "w-[232px] shadow-panel" : "w-16"
        }`}
        aria-label="Primary navigation"
      >
        <div className="flex h-16 shrink-0 items-center border-b border-line px-3">
          <Link
            href={employee ? "/dashboard" : "/home"}
            onClick={closeNav}
            className="flex min-w-0 items-center gap-3"
          >
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-brand-900 text-[12px] font-semibold text-white shadow-sm">
              SO
            </span>
            {open ? (
              <span className="min-w-0">
                <span className="block truncate text-[14px] font-semibold text-copy-strong">
                  SalsysOS
                </span>
                <span className="block max-w-[150px] truncate text-[12px] text-copy-subtle">
                  {organizationName}
                </span>
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
                  className={`flex h-11 items-center rounded-ui transition ${
                    open ? "gap-3 px-3" : "justify-center"
                  } ${
                    current
                      ? "bg-brand-700 text-white shadow-sm"
                      : "text-copy-muted hover:bg-surface-muted hover:text-copy-strong"
                  }`}
                >
                  <Icon size={19} strokeWidth={1.8} />
                  {open ? (
                    <span className="text-[14px] font-medium">{section.label}</span>
                  ) : null}
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
            className={`flex h-10 w-full items-center rounded-ui text-copy-muted transition hover:bg-brand-50 hover:text-brand-700 ${
              open ? "gap-3 px-3" : "justify-center"
            }`}
          >
            <Sparkles size={18} strokeWidth={1.8} />
            {open ? (
              <span className="text-[13px] font-medium">Ask Salsys</span>
            ) : null}
          </button>

          <div
            className={
              open
                ? "mt-2 flex items-center gap-2 px-3 py-1 text-[11px] text-copy-subtle"
                : "mt-2 flex justify-center py-1"
            }
          >
            <span
              className={`h-2 w-2 rounded-full ${
                mock ? "bg-amber-400" : "bg-emerald-500"
              }`}
            />
            {open ? (mock ? "Development" : "Live workspace") : null}
          </div>
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
          .salsys-meta-sidebar-shell
            .legacy-shell-host
            button[aria-label="Open section menu"] {
            display: none !important;
          }
        }
      `}</style>
    </>
  );
}
