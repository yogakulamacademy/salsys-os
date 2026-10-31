import Link from "next/link";
import { redirect } from "next/navigation";
import { Activity, MessageSquareText, UsersRound } from "lucide-react";

import TeamPerformancePage from "@/app/team-performance/page";
import { ContactPerformanceWorkspace } from "@/components/performance/contact-performance-workspace";
import { PerformanceOperatingBrief } from "@/components/performance/performance-operating-brief";
import { createClient } from "@/lib/supabase/server";

type PerformanceView = "team" | "response" | "communication";

type PageQuery = {
  view?: string;
  range?: string;
  start?: string;
  end?: string;
  employee?: string;
  notice?: string;
  error?: string;
};

export const dynamic = "force-dynamic";

export default async function PerformancePage({ searchParams }: { searchParams: Promise<PageQuery> }) {
  const query = await searchParams;
  await requirePerformanceAccess();

  const view: PerformanceView = query.view === "response" || query.view === "communication" ? query.view : "team";

  const teamSearchParams = Promise.resolve({
    range: query.range,
    start: query.start,
    end: query.end,
    employee: query.employee,
    notice: query.notice,
    error: query.error,
  });

  return (
    <div className="space-y-5">
      <PerformanceNavigation active={view} />

      {view === "response" ? (
        <ContactPerformanceWorkspace mode="response" />
      ) : view === "communication" ? (
        <ContactPerformanceWorkspace mode="communication" />
      ) : (
        <>
          <PerformanceOperatingBrief />
          <TeamPerformancePage searchParams={teamSearchParams} />
        </>
      )}
    </div>
  );
}

function PerformanceNavigation({ active }: { active: PerformanceView }) {
  const items = [
    {
      key: "team" as const,
      label: "Team & Assignment",
      detail: "Workload, output, outcomes and lead ownership",
      icon: UsersRound,
    },
    {
      key: "response" as const,
      label: "Response & SLA",
      detail: "Coverage gaps and first-response evidence",
      icon: Activity,
    },
    {
      key: "communication" as const,
      label: "Communication",
      detail: "Channels, contact activity and observed windows",
      icon: MessageSquareText,
    },
  ];

  return (
    <section className="rounded-2xl border border-line bg-surface p-2 shadow-sm">
      <div className="flex gap-2 overflow-x-auto">
        {items.map((item) => {
          const Icon = item.icon;
          const current = active === item.key;
          return (
            <Link
              key={item.key}
              href={item.key === "team" ? "/performance" : `/performance?view=${item.key}`}
              className={`min-w-[210px] flex-1 rounded-xl px-4 py-3 transition ${
                current
                  ? "bg-brand-700 text-white shadow-sm"
                  : "text-copy-muted hover:bg-surface-muted hover:text-copy-strong"
              }`}
            >
              <div className="flex items-center gap-2 text-sm font-semibold">
                <Icon size={16} strokeWidth={1.8} />
                {item.label}
              </div>
              <div className={`mt-1 text-[10px] leading-4 ${current ? "text-white/75" : "text-copy-subtle"}`}>
                {item.detail}
              </div>
            </Link>
          );
        })}
      </div>
    </section>
  );
}

async function requirePerformanceAccess() {
  const mock = process.env.NEXT_PUBLIC_USE_MOCK_DATA !== "false";
  if (mock) return;

  const supabase = await createClient();
  const { data: isAdmin, error } = await supabase.rpc("is_crm_admin");
  if (error || isAdmin !== true) redirect("/dashboard?restricted=1");
}
