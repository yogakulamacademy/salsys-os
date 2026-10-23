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
  Settings,
  ShieldCheck,
  Sparkles,
  Tags,
  Target,
  UsersRound,
  Workflow,
  X,
} from "lucide-react";
import { type ComponentType, useEffect, useMemo, useRef, useState } from "react";
import { createClient as createBrowserClient } from "@/lib/supabase/browser";

type IconType = ComponentType<{ size?: number | string; strokeWidth?: number; className?: string }>;
type Item = { href: string; label: string; icon: IconType; group?: string; adminOnly?: boolean };
type Group = { id: string; label: string; icon: IconType; directHref?: string; description?: string; items: Item[] };
type WorkspaceContext = { activeWorkspace: { organizationName: string; role: string } | null };

const MARKETING_GROUP_ORDER = ["OVERVIEW", "PAID GROWTH", "ORGANIC GROWTH", "ANALYSIS", "SETTINGS"] as const;

function activePath(pathname: string, href: string) {
  if (href === "/home") return pathname === "/home" || pathname === "/dashboard";
  if (href === "/settings") return pathname === "/settings";
  return pathname === href || pathname.startsWith(`${href}/`);
}

function askSalsys() {
  document.dispatchEvent(new KeyboardEvent("keydown", { key: "k", code: "KeyK", ctrlKey: true, bubbles: true }));
}

export function DesktopHoverSidebarV3() {
  const pathname = usePathname();
  const primaryRef = useRef<HTMLElement | null>(null);
  const submenuRef = useRef<HTMLElement | null>(null);
  const [open, setOpen] = useState(false);
  const [submenuId, setSubmenuId] = useState<string | null>(null);
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
            setOrganizationName(workspace.activeWorkspace?.organizationName || "Workspace");
          }
          return;
        }
        const supabase = createBrowserClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user || cancelled) return;
        const { data } = await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle();
        if (!cancelled) setRole(data?.role ?? null);
      } catch {
        if (!cancelled) setRole(null);
      }
    }
    void loadIdentity();
    return () => { cancelled = true; };
  }, [mock]);

  useEffect(() => {
    setOpen(false);
    setSubmenuId(null);
  }, [pathname]);

  useEffect(() => {
    function outside(event: PointerEvent) {
      if (!open || !(event.target instanceof Node)) return;
      if (!primaryRef.current?.contains(event.target) && !submenuRef.current?.contains(event.target)) {
        setOpen(false);
        setSubmenuId(null);
      }
    }
    function escape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
        setSubmenuId(null);
      }
    }
    document.addEventListener("pointerdown", outside, true);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("pointerdown", outside, true);
      document.removeEventListener("keydown", escape);
    };
  }, [open]);

  const groups = useMemo<Group[]>(() => {
    if (employee) {
      return [
        { id: "overview", label: "Overview", icon: Home, directHref: "/dashboard", items: [] },
        { id: "crm", label: "CRM", icon: UsersRound, items: [
          { href: "/leads", label: "My leads", icon: ContactRound },
          { href: "/pipeline", label: "My pipeline", icon: Boxes },
          { href: "/follow-ups", label: "Follow-ups", icon: ListTodo },
        ] },
        { id: "inbox", label: "Inbox", icon: Inbox, items: [{ href: "/conversations", label: "Conversations", icon: MessageSquareText }] },
      ];
    }
    if (!privileged) return [];
    return [
      { id: "overview", label: "Overview", icon: Home, directHref: "/home", items: [] },
      { id: "crm", label: "CRM", icon: UsersRound, description: "Command center, leads, pipeline and customer intelligence.", items: [
        { href: "/crm", label: "Command Center", icon: Activity },
        { href: "/leads", label: "Leads", icon: ContactRound },
        { href: "/admissions", label: "Admissions Desk", icon: ClipboardCheck },
        { href: "/pipeline", label: "Pipeline", icon: Boxes },
        { href: "/follow-ups", label: "Follow-ups", icon: ListTodo },
        { href: "/customer-360", label: "Customer 360", icon: UsersRound },
        { href: "/data-quality", label: "Data Quality", icon: ShieldCheck },
      ] },
      { id: "inbox", label: "Inbox", icon: Inbox, items: [{ href: "/conversations", label: "Conversations", icon: MessageSquareText }] },
      { id: "marketing", label: "Marketing", icon: Megaphone, description: "Understand acquisition, campaign performance and customer growth.", items: [
        { href: "/campaigns", label: "Campaigns", icon: Target },
        { href: "/attribution", label: "Attribution", icon: LineChart },
        { href: "/funnel", label: "Funnels", icon: GitBranch },
        { href: "/paid-media-leads", label: "Paid media", icon: Megaphone },
        { href: "/re-engaged", label: "Lead activity", icon: Activity },
        { href: "/seo", label: "SEO / AEO", icon: FileSearch },
      ] },
      { id: "intelligence", label: "Intelligence", icon: BrainCircuit, items: [
        { href: "/commercial-intelligence", label: "Commercial intelligence", icon: Sparkles },
        { href: "/analytics", label: "Analytics", icon: BarChart3 },
        { href: "/contact-intelligence", label: "Contact performance", icon: ContactRound },
        { href: "/revenue", label: "Revenue", icon: CircleDollarSign },
        { href: "/team-performance", label: "Team performance", icon: UsersRound, adminOnly: true },
      ] },
      { id: "automation", label: "Automation", icon: Workflow, items: [{ href: "/automation", label: "Automations", icon: Workflow }] },
      { id: "operations", label: "Operations", icon: BookOpen, items: [{ href: "/course-management", label: "Course management", icon: BookOpen }] },
      { id: "system", label: "System", icon: Settings, items: [
        { href: "/settings/integrations", label: "Integrations", icon: PlugZap, adminOnly: true },
        { href: "/tracking", label: "Tracking", icon: Tags },
        { href: "/settings/team", label: "Team & access", icon: ShieldCheck, adminOnly: true },
        { href: "/system-health", label: "System health", icon: Activity, adminOnly: true },
      ] },
    ];
  }, [admin, employee, privileged]);

  const submenu = useMemo(() => {
    const group = groups.find((entry) => entry.id === submenuId);
    if (!group) return null;
    return { ...group, items: group.items.filter((item) => !item.adminOnly || admin) };
  }, [admin, groups, submenuId]);

  const groupedItems = useMemo<Array<[string, Item[]]>>(() => {
    if (!submenu) return [];
    if (!submenu.items.some((item) => item.group)) return [["", submenu.items]];
    return MARKETING_GROUP_ORDER
      .map((label): [string, Item[]] => [label, submenu.items.filter((item) => item.group === label)])
      .filter(([, items]) => items.length > 0);
  }, [submenu]);

  function contains(group: Group) {
    if (group.directHref && activePath(pathname, group.directHref)) return true;
    return group.items.some((item) => (!item.adminOnly || admin) && activePath(pathname, item.href));
  }

  function closeNav() {
    setOpen(false);
    setSubmenuId(null);
  }

  return (
    <>
      <aside
        ref={primaryRef}
        onMouseEnter={() => setOpen(true)}
        onFocusCapture={() => setOpen(true)}
        className={`fixed inset-y-0 left-0 z-[70] hidden flex-col border-r border-line bg-surface transition-[width,box-shadow] duration-200 lg:flex ${open ? "w-[232px] shadow-panel" : "w-16"}`}
      >
        <div className="flex h-16 shrink-0 items-center border-b border-line px-3">
          <Link href={employee ? "/dashboard" : "/home"} onClick={closeNav} className="flex min-w-0 items-center gap-3">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-brand-900 text-[12px] font-bold text-white shadow-sm">SO</span>
            {open ? (
              <span className="min-w-0">
                <span className="block truncate text-sm font-semibold text-copy-strong">SalsysOS</span>
                <span className="block max-w-[150px] truncate text-[11px] text-copy-subtle">{organizationName}</span>
              </span>
            ) : null}
          </Link>
        </div>

        <nav className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden px-2 py-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <div className="space-y-1">
            {groups.map((group) => {
              const Icon = group.icon;
              const current = contains(group);
              if (group.directHref) {
                return (
                  <Link
                    key={group.id}
                    href={group.directHref}
                    onClick={closeNav}
                    title={open ? undefined : group.label}
                    className={`flex h-11 items-center rounded-ui transition ${open ? "gap-3 px-3" : "justify-center"} ${current ? "bg-brand-700 text-white shadow-sm" : "text-copy-muted hover:bg-surface-muted hover:text-copy-strong"}`}
                  >
                    <Icon size={19} />
                    {open ? <span className="text-[13px] font-semibold">{group.label}</span> : null}
                  </Link>
                );
              }
              const selected = submenuId === group.id;
              return (
                <button
                  key={group.id}
                  type="button"
                  onClick={() => { setOpen(true); setSubmenuId(selected ? null : group.id); }}
                  title={open ? undefined : group.label}
                  className={`flex h-11 w-full items-center rounded-ui transition ${open ? "gap-3 px-3" : "justify-center"} ${current ? "bg-brand-700 text-white shadow-sm" : selected ? "bg-brand-50 text-brand-900" : "text-copy-muted hover:bg-surface-muted hover:text-copy-strong"}`}
                >
                  <Icon size={19} />
                  {open ? (
                    <>
                      <span className="min-w-0 flex-1 truncate text-left text-[13px] font-semibold">{group.label}</span>
                      <ChevronRight size={14} />
                    </>
                  ) : null}
                </button>
              );
            })}
          </div>
        </nav>

        <div className="shrink-0 border-t border-line p-2">
          <button
            type="button"
            onClick={() => { askSalsys(); closeNav(); }}
            className={`flex h-10 w-full items-center rounded-ui text-copy-muted transition hover:bg-brand-50 hover:text-brand-700 ${open ? "gap-3 px-3" : "justify-center"}`}
          >
            <Sparkles size={18} />
            {open ? <span className="text-[13px] font-semibold">Ask Salsys</span> : null}
          </button>
          <div className={open ? "mt-2 flex items-center gap-2 px-3 py-1 text-[11px] text-copy-subtle" : "mt-2 flex justify-center py-1"}>
            <span className={`h-2 w-2 rounded-full ${mock ? "bg-amber-400" : "bg-emerald-500"}`} />
            {open ? (mock ? "Development" : "Live workspace") : null}
          </div>
        </div>
      </aside>

      {open && submenu && submenu.items.length ? (
        <aside
          ref={submenuRef}
          className={`fixed inset-y-0 left-[232px] z-[69] hidden flex-col border-r border-line bg-surface shadow-panel lg:flex ${submenu.id === "marketing" ? "w-[292px]" : "w-[272px]"}`}
        >
          <div className="flex min-h-20 shrink-0 items-start justify-between border-b border-line px-5 py-4">
            <div>
              <h2 className="text-[18px] font-semibold tracking-[-0.025em] text-copy-strong">{submenu.label}</h2>
              {submenu.description ? <p className="mt-1 max-w-[225px] text-[12px] leading-5 text-copy-muted">{submenu.description}</p> : null}
            </div>
            <button type="button" onClick={() => setSubmenuId(null)} className="grid h-8 w-8 place-items-center rounded-ui text-copy-subtle transition hover:bg-surface-muted hover:text-copy-strong">
              <X size={16} />
            </button>
          </div>
          <nav className="flex-1 overflow-y-auto px-3 py-4">
            {groupedItems.map(([groupLabel, items]) => (
              <section key={groupLabel || "default"} className={groupLabel ? "mb-5" : ""}>
                {groupLabel ? <div className="mb-1.5 px-3 text-[10px] font-bold uppercase tracking-[0.12em] text-copy-subtle">{groupLabel}</div> : null}
                <div className="space-y-1">
                  {items.map((item) => {
                    const Icon = item.icon;
                    const current = activePath(pathname, item.href);
                    return (
                      <Link
                        key={`${groupLabel}-${item.href}`}
                        href={item.href}
                        onClick={closeNav}
                        className={`flex items-center gap-3 rounded-ui px-3 py-2.5 transition ${current ? "bg-brand-100 text-brand-900" : "text-copy-muted hover:bg-surface-muted hover:text-copy-strong"}`}
                      >
                        <Icon size={15} className={current ? "text-brand-700" : "text-copy-subtle"} />
                        <span className="min-w-0 flex-1 truncate text-[13px] font-semibold">{item.label}</span>
                        {current ? <ChevronRight size={13} /> : null}
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
          .salsys-meta-sidebar-shell .legacy-shell-host > div > aside { display: none !important; }
          .salsys-meta-sidebar-shell .legacy-shell-host > div > div.min-h-screen { padding-left: 4rem !important; }
          .salsys-meta-sidebar-shell .legacy-shell-host button[aria-label="Open section menu"] { display: none !important; }
        }
      `}</style>
    </>
  );
}
