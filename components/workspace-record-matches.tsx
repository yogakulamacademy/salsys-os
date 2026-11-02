"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
type Match = { id: string; kind: string; title: string; href: string };
export function WorkspaceRecordMatches({
  query,
  onSelect,
}: {
  query: string;
  onSelect: () => void;
}) {
  const [read, setRead] = useState<{
    q: string;
    state: string;
    results: Match[];
    partial?: boolean;
  }>({ q: "", state: "idle", results: [] });
  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) return;
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setRead({ q, state: "loading", results: [] });
      try {
        const response = await fetch(
          `/api/workspace/search?q=${encodeURIComponent(q)}`,
          { signal: controller.signal, cache: "no-store" },
        );
        if (!response.ok) throw Error("Search unavailable");
        const data = await response.json();
        if (!controller.signal.aborted)
          setRead({
            q,
            state: data.demo ? "demo" : "ready",
            results: data.results,
            partial: data.partial,
          });
      } catch {
        if (!controller.signal.aborted)
          setRead({ q, state: "error", results: [] });
      }
    }, 250);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query]);
  if (query.trim().length < 2) return null;
  const current =
    read.q === query.trim()
      ? read
      : { state: "loading", results: [], partial: false };
  return (
    <div className="mb-4 border-b border-slate-100 pb-3 dark:border-slate-800">
      <h3 className="px-2 py-2 text-xs font-semibold text-slate-500">
        Matching records · limited to your access
      </h3>
      <div role="status" className="px-2 text-xs text-slate-500">
        {current.state === "loading"
          ? "Searching…"
          : current.state === "error"
            ? "Record search is unavailable. Workspace actions remain available."
            : current.state === "demo"
              ? "Demo mode: live record search is off."
              : current.partial
                ? "Some record sources could not be searched."
                : !current.results.length
                  ? "No matching records. Try a person, course or campaign name."
                  : null}
      </div>
      {current.results.map((item) => (
        <Link
          key={item.id}
          href={item.href}
          onClick={onSelect}
          className="flex items-center justify-between gap-3 rounded-lg px-3 py-2.5 hover:bg-violet-50 dark:hover:bg-slate-900"
        >
          <span className="truncate text-sm font-medium">{item.title}</span>
          <span className="shrink-0 text-xs text-slate-500">{item.kind}</span>
        </Link>
      ))}
    </div>
  );
}
