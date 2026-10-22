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
import { type ComponentType, useEffect, useMemo, useRef, useState } from "react";
import { createClient as createBrowserClient } from "@/lib/supabase/browser";

type IconType = ComponentType<{ size?: number | string; strokeWidth?: number; className?: string }>;
type Item = { href: string; label: string; icon: IconType; group?: string; adminOnly?: boolean };
type Group = { id: string; label: string; icon: IconType; directHref?: string; description?: string; items: Item[] };
type WorkspaceContext = { activeWorkspace: { organizationName: string; role: string } | null };

const MARKETING_GROUP_ORDER = ["OVERVIEW", "PAID GROWTH", "ORGANIC GROWTH", "ANALYSIS", "SETTINGS"] as const;

function activePath(pathname: string, href: string) {
  if (href === "/home") return pathname === "/home" || pathname === "/dashboard";
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
      { id: "crm", label: "CRM", icon: UsersRound, description: "Leads, admissions and follow-up work.", items: [
        { href: "/leads", label: "Leads", icon: ContactRound },
        { href: "/admissions", label: "Admissions Desk", icon: ClipboardCheck },
        { href: "/pipeline", label: "Pipeline", icon: Boxes },
        { href: "/follow-ups", label: "Follow-ups", icon: ListTodo },
      ] },
      { id: "marketing", label: "Marketing", icon: Megaphone, description: "Understand acquisition, campaign performance and customer growth.", items: [
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
      ] },
      { id: "inbox", label: "Inbox", icon: Inbox, items: [{ href: "/conversations", label: "Conversations", icon: MessageSquareText }] },
      { id: "automation", label: "Automation", icon: Workflow, items: [{ href: "/automation", label: "Automations", icon: Workflow }] },
      { id: "operations", label: "Operations", icon: BookOpen, items: [{ href: "/course-management", label: "Course Management", icon: BookOpen }] },
      { id: "intelligence", label: "Intelligence", icon: BrainCircuit, items: [
        { href: "/contact-intelligence", label: "Customer 360", icon: BrainCircuit },
        { href: "/team-performance", label: "Team Performance", icon: UsersRound, adminOnly: true },
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
      <aside ref={primaryRef} onMouseEnter={() => setOpen(true)} onFocusCapture={() => setOpen(true)} className={`fixed inset-y-0 left-0 z-[70] hidden flex-col border-r border-slate-200 bg-white transition-[width,box-shadow] duration-200 lg:flex dark:border-slate-800 dark:bg-slate-950 ${open ? "w-[232px] shadow-2xl" : "w-16"}`}>
        <div className="flex h-16 shrink-0 items-center border-b border-slate-100 px-3 dark:border-slate-900">
          <Link href={employee ? "/dashboard" : "/home"} onClick={closeNav} className="flex min-w-0 items-center gap-3">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-slate-950 text-[12px] font-black text-white dark:bg-white dark:text-slate-950">SO</span>
            {open ? <span className="min-w-0"><span className="block truncate text-sm font-black text-slate-950 dark:text-white">SalsysOS</span><span className="block max-w-[150px] truncate text-[10px] text-slate-400">{organizationName}</span></span> : null}
          </Link>
        </div>

        <nav className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden px-2 py-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <div className="space-y-1">
            {groups.map((group) => {
              const Icon = group.icon;
              const current = contains(group);
              if (group.directHref) {
                return <Link key={group.id} href={group.directHref} onClick={closeNav} title={open ? undefined : group.label} className={`flex h-11 items-center rounded-lg transition ${open ? "gap-3 px-3" : "justify-center"} ${current ? "bg-slate-900 text-white dark:bg-white dark:text-slate-950" : "text-slate-600 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-900"}`}><Icon size={19}/>{open ? <span className="text-[12px] font-semibold">{group.label}</span> : null}</Link>;
              }
              const selected = submenuId === group.id;
              return <button key={group.id} type="button" onClick={() => { setOpen(true); setSubmenuId(selected ? null : group.id); }} title={open ? undefined : group.label} className={`flex h-11 w-full items-center rounded-lg transition ${open ? "gap-3 px-3" : "justify-center"} ${current ? "bg-slate-900 text-white dark:bg-white dark:text-slate-950" : selected ? "bg-slate-100 text-slate-950 dark:bg-slate-900 dark:text-white" : "text-slate-600 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-900"}`}><Icon size={19}/>{open ? <><span className="min-w-0 flex-1 truncate text-left text-[12px] font-semibold">{group.label}</span><ChevronRight size={14}/></> : null}</button>;
            })}
          </div>
        </nav>

        <div className="shrink-0 border-t border-slate-100 p-2 dark:border-slate-900">
          <button type="button" onClick={() => { askSalsys(); closeNav(); }} className={`flex h-10 w-full items-center rounded-lg text-slate-600 hover:bg-violet-50 hover:text-violet-700 dark:text-slate-400 ${open ? "gap-3 px-3" : "justify-center"}`}><Sparkles size={18}/>{open ? <span className="text-[12px] font-semibold">Ask Salsys</span> : null}</button>
          <div className={open ? "mt-2 flex items-center gap-2 px-3 py-1 text-[10px] text-slate-400" : "mt-2 flex justify-center py-1"}><span className={`h-2 w-2 rounded-full ${mock ? "bg-amber-400" : "bg-emerald-500"}`}/>{open ? (mock ? "Development" : "Live workspace") : null}</div>
        </div>
      </aside>

      {open && submenu && submenu.items.length ? (
        <aside ref={submenuRef} className={`fixed inset-y-0 left-[232px] z-[69] hidden flex-col border-r border-slate-200 bg-white shadow-2xl lg:flex dark:border-slate-800 dark:bg-slate-950 ${submenu.id === "marketing" ? "w-[292px]" : "w-[272px]"}`}>
          <div className="flex min-h-20 shrink-0 items-start justify-between border-b border-slate-100 px-5 py-4 dark:border-slate-900">
            <div><h2 className="text-[18px] font-black tracking-[-0.03em] text-slate-950 dark:text-white">{submenu.label}</h2>{submenu.description ? <p className="mt-1 max-w-[225px] text-[10px] leading-4 text-slate-400">{submenu.description}</p> : null}</div>
            <button type="button" onClick={() => setSubmenuId(null)} className="grid h-8 w-8 place-items-center rounded-lg text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-900"><X size={16}/></button>
          </div>
          <nav className="flex-1 overflow-y-auto px-3 py-4">
            {groupedItems.map(([groupLabel, items]) => <section key={groupLabel || "default"} className={groupLabel ? "mb-5" : ""}>
              {groupLabel ? <div className="mb-1.5 px-3 text-[9px] font-bold uppercase tracking-[0.16em] text-slate-400">{groupLabel}</div> : null}
              <div className="space-y-1">{items.map((item) => {
                const Icon = item.icon;
                const current = activePath(pathname, item.href);
                return <Link key={`${groupLabel}-${item.href}`} href={item.href} onClick={closeNav} className={`flex items-center gap-3 rounded-lg px-3 py-2.5 transition ${current ? "bg-[#dceede] text-[#153d33] dark:bg-emerald-950/40 dark:text-emerald-100" : "text-slate-600 hover:bg-slate-50 hover:text-slate-950 dark:text-slate-300 dark:hover:bg-slate-900"}`}><Icon size={15} className={current ? "text-emerald-700" : "text-slate-400"}/><span className="min-w-0 flex-1 truncate text-[12px] font-semibold">{item.label}</span>{current ? <ChevronRight size={13}/> : null}</Link>;
              })}</div>
            </section>)}
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
