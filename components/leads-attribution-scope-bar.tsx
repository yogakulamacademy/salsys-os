"use client";

import { Filter, X } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import type { LeadsAttributionScope } from "@/lib/leads-attribution-scope";

export function LeadsAttributionScopeBar({ scope }: { scope: LeadsAttributionScope }) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();

  const active = Boolean(scope.creationChannel || scope.lastTouchSource);
  if (!active) return null;

  function clear(keys: Array<"creation_channel" | "last_touch_source">) {
    const next = new URLSearchParams(searchParams.toString());
    for (const key of keys) next.delete(key);
    next.delete("page");
    const query = next.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
  }

  return (
    <section className="rounded-panel border border-brand-100 bg-brand-50/55 px-4 py-3 shadow-xs dark:border-brand-900/50 dark:bg-brand-950/15">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.08em] text-brand-700 dark:text-brand-300">
            <Filter size={12} /> Attribution investigation
          </div>
          <p className="mt-1 text-xs leading-5 text-copy-muted">
            Exact destination scope is active. These filters are applied by the Leads read model, not by fuzzy search or cross-model substitution.
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            {scope.creationChannel ? (
              <ScopeChip
                label="Creation Channel"
                value={scope.creationChannel}
                onClear={() => clear(["creation_channel"])}
              />
            ) : null}
            {scope.lastTouchSource ? (
              <ScopeChip
                label="Last Marketing Touch"
                value={scope.lastTouchSource}
                onClear={() => clear(["last_touch_source"])}
              />
            ) : null}
          </div>
        </div>
        <button
          type="button"
          onClick={() => clear(["creation_channel", "last_touch_source"])}
          className="inline-flex h-9 shrink-0 items-center justify-center gap-1.5 rounded-ui border border-line bg-surface px-3 text-[11px] font-semibold text-copy-muted transition hover:border-line-strong hover:text-brand-700"
        >
          <X size={12} /> Clear attribution scope
        </button>
      </div>
    </section>
  );
}

function ScopeChip({
  label,
  value,
  onClear,
}: {
  label: string;
  value: string;
  onClear: () => void;
}) {
  return (
    <span className="inline-flex items-center overflow-hidden rounded-full border border-brand-100 bg-surface text-[10px] shadow-xs dark:border-brand-900/50">
      <span className="px-2 py-1 text-copy-subtle">{label}</span>
      <span className="border-l border-brand-100 px-2 py-1 font-semibold text-copy-strong dark:border-brand-900/50">
        {pretty(value)}
      </span>
      <button
        type="button"
        onClick={onClear}
        aria-label={`Clear ${label}`}
        className="border-l border-brand-100 px-1.5 py-1 text-copy-subtle transition hover:text-brand-700 dark:border-brand-900/50"
      >
        <X size={10} />
      </button>
    </span>
  );
}

function pretty(value: string) {
  return value
    .replaceAll("_", " ")
    .replaceAll("-", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}
