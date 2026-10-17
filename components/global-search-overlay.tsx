"use client";

import { BookOpen, ContactRound, Loader2, MessageSquareText, Search, X } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";

type SearchItem = {
  id: string;
  score: number | null;
  entityType: string | null;
  entityId: string | null;
  source: Record<string, unknown>;
  highlights: Record<string, string[]>;
};

type SearchResponse = {
  ok: boolean;
  query?: string;
  total?: number;
  took_ms?: number;
  items?: SearchItem[];
  error?: string;
};

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function plainHighlight(value: string) {
  return value.replace(/<\/?mark>/gi, "").replace(/\s+/g, " ").trim();
}

function firstHighlight(item: SearchItem) {
  for (const field of ["display_name", "document_title", "summary", "body", "content"]) {
    const value = item.highlights[field]?.[0];
    if (value) return plainHighlight(value).slice(0, 220);
  }
  return "";
}

function resultTitle(item: SearchItem) {
  const source = item.source;
  return (
    text(source.display_name) ||
    text(source.document_title) ||
    text(source.lead_code) ||
    (item.entityType === "message" ? "Conversation message" : "Search result")
  );
}

function resultDescription(item: SearchItem) {
  const highlighted = firstHighlight(item);
  if (highlighted) return highlighted;

  const source = item.source;
  return (
    text(source.summary) ||
    text(source.body) ||
    text(source.content) ||
    text(source.preferred_location) ||
    text(source.country) ||
    ""
  ).slice(0, 220);
}

function entityLabel(entityType: string | null) {
  switch (entityType) {
    case "lead":
      return "Lead";
    case "conversation":
      return "Conversation";
    case "message":
      return "Message";
    case "knowledge_chunk":
      return "Knowledge";
    default:
      return "Result";
  }
}

function ResultIcon({ entityType }: { entityType: string | null }) {
  if (entityType === "lead") return <ContactRound size={17} />;
  if (entityType === "knowledge_chunk") return <BookOpen size={17} />;
  return <MessageSquareText size={17} />;
}

function destination(item: SearchItem) {
  if (item.entityType === "lead" && item.entityId) {
    return `/leads/${encodeURIComponent(item.entityId)}`;
  }

  const leadId = text(item.source.lead_id);
  if ((item.entityType === "conversation" || item.entityType === "message") && leadId) {
    return `/conversations?lead=${encodeURIComponent(leadId)}`;
  }

  return null;
}

export function GlobalSearchOverlay() {
  const pathname = usePathname();
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const requestRef = useRef<AbortController | null>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [items, setItems] = useState<SearchItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeIndex, setActiveIndex] = useState(0);

  const hidden = pathname.startsWith("/login") || pathname.startsWith("/forgot-password") || pathname.startsWith("/reset-password");

  useEffect(() => {
    if (hidden) return;

    function handleShortcut(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setOpen(true);
        window.setTimeout(() => inputRef.current?.focus(), 0);
      }

      if (event.key === "Escape") {
        setOpen(false);
      }
    }

    document.addEventListener("keydown", handleShortcut);
    return () => document.removeEventListener("keydown", handleShortcut);
  }, [hidden]);

  useEffect(() => {
    if (!open) {
      requestRef.current?.abort();
      setLoading(false);
      return;
    }

    const normalized = query.trim();
    if (normalized.length < 2) {
      requestRef.current?.abort();
      setItems([]);
      setTotal(0);
      setError(null);
      setLoading(false);
      setActiveIndex(0);
      return;
    }

    const timer = window.setTimeout(async () => {
      requestRef.current?.abort();
      const controller = new AbortController();
      requestRef.current = controller;
      setLoading(true);
      setError(null);

      try {
        const params = new URLSearchParams({ q: normalized, limit: "10" });
        const response = await fetch(`/api/search/v1?${params.toString()}`, {
          cache: "no-store",
          signal: controller.signal,
        });
        const body = (await response.json().catch(() => null)) as SearchResponse | null;

        if (!response.ok || !body?.ok) {
          if (response.status === 401) throw new Error("Your session has expired. Please sign in again.");
          if (response.status === 409) throw new Error("Your workspace needs attention before search can run.");
          if (response.status === 403) throw new Error("Select an active workspace to search.");
          throw new Error("Search is temporarily unavailable.");
        }

        setItems(Array.isArray(body.items) ? body.items.slice(0, 10) : []);
        setTotal(Number(body.total || 0));
        setActiveIndex(0);
      } catch (searchError) {
        if (searchError instanceof DOMException && searchError.name === "AbortError") return;
        setItems([]);
        setTotal(0);
        setError(searchError instanceof Error ? searchError.message : "Search is temporarily unavailable.");
      } finally {
        if (requestRef.current === controller) setLoading(false);
      }
    }, 250);

    return () => window.clearTimeout(timer);
  }, [open, query]);

  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [open]);

  const navigableItems = useMemo(() => items.map((item) => destination(item)), [items]);

  function activate(index: number) {
    const item = items[index];
    if (!item) return;
    const href = navigableItems[index];
    if (!href) return;
    setOpen(false);
    setQuery("");
    router.push(href);
  }

  function handleInputKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((value) => Math.min(value + 1, Math.max(items.length - 1, 0)));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((value) => Math.max(value - 1, 0));
    } else if (event.key === "Enter") {
      event.preventDefault();
      activate(activeIndex);
    }
  }

  if (hidden) return null;

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setOpen(true);
          window.setTimeout(() => inputRef.current?.focus(), 0);
        }}
        className="fixed bottom-5 right-5 z-40 hidden items-center gap-2 rounded-full border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 shadow-lg transition hover:border-slate-300 hover:bg-slate-50 md:inline-flex dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
        aria-label="Open global search"
      >
        <Search size={15} />
        Search
        <kbd className="rounded border border-slate-200 px-1.5 py-0.5 text-[10px] font-medium text-slate-500 dark:border-slate-700">⌘K</kbd>
      </button>

      {open && (
        <div
          className="fixed inset-0 z-[100] flex items-start justify-center bg-slate-950/45 px-4 pt-[12vh] backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-label="Global search"
          onMouseDown={(event) => {
            if (event.currentTarget === event.target) setOpen(false);
          }}
        >
          <div className="w-full max-w-2xl overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl dark:border-slate-700 dark:bg-slate-900">
            <div className="flex items-center gap-3 border-b border-slate-200 px-4 dark:border-slate-700">
              <Search size={18} className="shrink-0 text-slate-400" />
              <input
                ref={inputRef}
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                onKeyDown={handleInputKeyDown}
                placeholder="Search leads, conversations, messages and knowledge..."
                className="h-14 min-w-0 flex-1 bg-transparent text-sm text-slate-900 outline-none placeholder:text-slate-400 dark:text-slate-100"
                aria-label="Search this workspace"
                autoComplete="off"
              />
              {loading && <Loader2 size={17} className="animate-spin text-slate-400" />}
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-200"
                aria-label="Close search"
              >
                <X size={17} />
              </button>
            </div>

            <div className="max-h-[58vh] overflow-y-auto p-2">
              {query.trim().length < 2 && (
                <div className="px-4 py-10 text-center text-sm text-slate-500">
                  Type at least 2 characters to search the active workspace.
                </div>
              )}

              {query.trim().length >= 2 && error && (
                <div className="px-4 py-10 text-center text-sm text-slate-500">{error}</div>
              )}

              {query.trim().length >= 2 && !loading && !error && items.length === 0 && (
                <div className="px-4 py-10 text-center text-sm text-slate-500">No matching results.</div>
              )}

              {items.map((item, index) => {
                const href = navigableItems[index];
                const selected = index === activeIndex;
                return (
                  <button
                    key={`${item.id}-${index}`}
                    type="button"
                    disabled={!href}
                    onMouseEnter={() => setActiveIndex(index)}
                    onClick={() => activate(index)}
                    className={`flex w-full items-start gap-3 rounded-xl px-3 py-3 text-left transition ${
                      selected ? "bg-slate-100 dark:bg-slate-800" : "hover:bg-slate-50 dark:hover:bg-slate-800/70"
                    } ${href ? "cursor-pointer" : "cursor-default"}`}
                  >
                    <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                      <ResultIcon entityType={item.entityType} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-2">
                        <span className="truncate text-sm font-semibold text-slate-900 dark:text-slate-100">{resultTitle(item)}</span>
                        <span className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                          {entityLabel(item.entityType)}
                        </span>
                      </span>
                      {resultDescription(item) && (
                        <span className="mt-1 block line-clamp-2 text-xs leading-5 text-slate-500 dark:text-slate-400">
                          {resultDescription(item)}
                        </span>
                      )}
                    </span>
                  </button>
                );
              })}
            </div>

            <div className="flex items-center justify-between border-t border-slate-200 px-4 py-2.5 text-[11px] text-slate-400 dark:border-slate-700">
              <span>{items.length > 0 ? `${Math.min(items.length, total)} of ${total} results` : "Workspace-scoped search"}</span>
              <span>↑↓ Navigate · Enter Open · Esc Close</span>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
