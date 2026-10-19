import type { ReactNode } from 'react';
import Link from 'next/link';
import { Activity, GitBranch, ListChecks, LockKeyhole, MessageSquareText, Settings2, ShieldCheck, Sparkles, Workflow } from 'lucide-react';

const links = [
  { href: '/automation', label: 'Smart Triggers', icon: GitBranch },
  { href: '/automation/recipes', label: 'Starter Recipes', icon: Sparkles },
  { href: '/automation/flow-builder', label: 'Flow Builder', icon: Workflow },
  { href: '/automation/approvals', label: 'Approval Queue', icon: ListChecks },
  { href: '/automation/templates', label: 'WhatsApp Templates', icon: MessageSquareText },
  { href: '/automation/runs', label: 'Runtime Monitor', icon: Activity },
  { href: '/automation/pilot', label: 'Pilot Control', icon: LockKeyhole },
  { href: '/automation/readiness', label: 'Rollout Readiness', icon: ShieldCheck },
  { href: '/automation/settings', label: 'Settings', icon: Settings2 },
];

export default function AutomationLayout({ children }: { children: ReactNode }) {
  return (
    <div className="space-y-5">
      <nav
        aria-label="Automation workspace"
        className="flex flex-wrap gap-2 rounded-2xl border border-slate-200 bg-white p-2 shadow-sm"
      >
        {links.map(({ href, label, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            className="inline-flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold text-slate-700 transition hover:bg-violet-50 hover:text-violet-700"
          >
            <Icon size={15} />
            {label}
          </Link>
        ))}
      </nav>
      {children}
    </div>
  );
}
