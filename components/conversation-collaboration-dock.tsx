"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  BellRing,
  Check,
  ChevronDown,
  ChevronUp,
  Clock3,
  MessageSquareText,
  Settings2,
  ShieldAlert,
  UserRound,
  UsersRound,
  X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

type TeamMember = { id: string; name: string; role: string };
type PresenceUser = { userId: string; name: string; lastSeenAt: string };
type WorkloadRow = {
  userId: string;
  name: string;
  role: string;
  actionLoad: number;
  assigned: number;
  needsReply: number;
  overdue: number;
  highIntent: number;
  paymentPending: number;
};
type CollaborationData = {
  currentUserId: string;
  organizationId: string;
  lead: { id: string; ownerUserId: string | null; stage: string };
  canManageAssignments: boolean;
  teamMembers: TeamMember[];
  presence: PresenceUser[];
  sla: { warningMinutes: number; breachMinutes: number; updatedAt: string | null };
  unreadMentions: number;
  workload: WorkloadRow[];
};
type ApiResponse = { ok: boolean; data?: CollaborationData; presence?: PresenceUser[]; error?: string };

export function ConversationCollaborationDock() {
  const params = useSearchParams();
  const leadId = params.get("lead")?.trim() ?? "";
  const [open, setOpen] = useState(false);
  const [data, setData] = useState<CollaborationData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [mentionedIds, setMentionedIds] = useState<string[]>([]);
  const [savingNote, setSavingNote] = useState(false);
  const [noteSuccess, setNoteSuccess] = useState<string | null>(null);
  const [warningMinutes, setWarningMinutes] = useState("60");
  const [breachMinutes, setBreachMinutes] = useState("240");
  const [savingSla, setSavingSla] = useState(false);

  const load = useCallback(async () => {
    if (!leadId) {
      setData(null);
      return;
    }
    setLoading(true);
    try {
      const response = await fetch(`/api/conversations/collaboration?lead=${encodeURIComponent(leadId)}`, {
        cache: "no-store",
      });
      const payload = (await response.json()) as ApiResponse;
      if (!response.ok || !payload.ok || !payload.data) {
        throw new Error(payload.error || "Unable to load collaboration state.");
      }
      setData(payload.data);
      setWarningMinutes(String(payload.data.sla.warningMinutes));
      setBreachMinutes(String(payload.data.sla.breachMinutes));
      setError(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to load collaboration state.");
    } finally {
      setLoading(false);
    }
  }, [leadId]);

  const heartbeat = useCallback(async () => {
    if (!leadId) return;
    try {
      const response = await fetch("/api/conversations/collaboration", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "heartbeat", leadId }),
      });
      const payload = (await response.json()) as ApiResponse;
      if (response.ok && payload.ok && payload.presence) {
        setData((current) => (current ? { ...current, presence: payload.presence ?? current.presence } : current));
      }
    } catch {
      // Presence is advisory; do not disrupt the working inbox if heartbeat fails.
    }
  }, [leadId]);

  useEffect(() => {
    setData(null);
    setNote("");
    setMentionedIds([]);
    setNoteSuccess(null);
    if (!leadId) return;
    void load();
    void heartbeat();
    const timer = window.setInterval(() => void heartbeat(), 20_000);
    return () => window.clearInterval(timer);
  }, [heartbeat, leadId, load]);

  const otherViewers = useMemo(
    () => data?.presence.filter((row) => row.userId !== data.currentUserId) ?? [],
    [data],
  );

  if (!leadId) return null;

  const badgeCount = otherViewers.length + (data?.unreadMentions ?? 0);

  return (
    <div className="fixed bottom-4 right-4 z-[70] flex max-h-[calc(100vh-2rem)] flex-col items-end sm:bottom-5 sm:right-5">
      {open ? (
        <section className="mb-2 flex max-h-[min(720px,calc(100vh-5.5rem))] w-[min(390px,calc(100vw-2rem))] flex-col overflow-hidden rounded-2xl border border-line bg-surface shadow-2xl">
          <header className="flex shrink-0 items-center justify-between border-b border-line px-4 py-3">
            <div>
              <div className="flex items-center gap-2 text-[13px] font-semibold text-copy-strong">
                <UsersRound size={15} className="text-brand-700" /> Team collaboration
              </div>
              <div className="mt-0.5 text-[10.5px] text-copy-muted">Presence · mentions · SLA · workload</div>
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="grid h-8 w-8 place-items-center rounded-lg text-copy-muted transition hover:bg-surface-soft hover:text-copy-strong"
              aria-label="Close collaboration panel"
            >
              <X size={14} />
            </button>
          </header>

          <div className="min-h-0 flex-1 overflow-y-auto">
            {loading && !data ? (
              <div className="px-4 py-8 text-center text-[12px] text-copy-muted">Loading collaboration state…</div>
            ) : null}
            {error ? (
              <div className="m-3 rounded-lg border border-danger/20 bg-red-50 px-3 py-2 text-[11px] text-danger">{error}</div>
            ) : null}
            {data ? (
              <>
                <PresenceSection currentUserId={data.currentUserId} viewers={data.presence} />
                <MentionNoteSection
                  members={data.teamMembers.filter((member) => member.id !== data.currentUserId)}
                  note={note}
                  setNote={setNote}
                  mentionedIds={mentionedIds}
                  setMentionedIds={setMentionedIds}
                  saving={savingNote}
                  success={noteSuccess}
                  onSave={async () => {
                    const value = note.trim();
                    if (!value || savingNote) return;
                    setSavingNote(true);
                    setNoteSuccess(null);
                    setError(null);
                    try {
                      const response = await fetch("/api/conversations/collaboration", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ action: "add_note", leadId, note: value, mentionedUserIds: mentionedIds }),
                      });
                      const payload = (await response.json()) as ApiResponse;
                      if (!response.ok || !payload.ok) throw new Error(payload.error || "Unable to save note.");
                      setNote("");
                      setMentionedIds([]);
                      setNoteSuccess("Internal note saved. Mentioned teammates were notified.");
                      window.dispatchEvent(new CustomEvent("salsys:conversation-activity-changed", { detail: { leadId } }));
                    } catch (cause) {
                      setError(cause instanceof Error ? cause.message : "Unable to save note.");
                    } finally {
                      setSavingNote(false);
                    }
                  }}
                />

                {data.unreadMentions > 0 ? (
                  <section className="border-b border-line px-4 py-4">
                    <div className="flex items-center justify-between gap-3 rounded-xl border border-brand-100 bg-brand-50 p-3">
                      <div className="flex items-start gap-2.5">
                        <BellRing size={15} className="mt-0.5 shrink-0 text-brand-700" />
                        <div>
                          <div className="text-[12px] font-semibold text-copy-strong">
                            {data.unreadMentions} unread mention{data.unreadMentions === 1 ? "" : "s"}
                          </div>
                          <div className="mt-0.5 text-[10.5px] text-copy-muted">A teammate tagged you in an internal note on this lead.</div>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={async () => {
                          const response = await fetch("/api/conversations/collaboration", {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({ action: "mark_mentions_read", leadId }),
                          });
                          if (response.ok) setData((current) => (current ? { ...current, unreadMentions: 0 } : current));
                        }}
                        className="shrink-0 rounded-lg border border-line bg-surface px-2.5 py-1.5 text-[10.5px] font-semibold text-brand-700"
                      >
                        Mark read
                      </button>
                    </div>
                  </section>
                ) : null}

                <SlaSection
                  sla={data.sla}
                  canManage={data.canManageAssignments}
                  warningMinutes={warningMinutes}
                  breachMinutes={breachMinutes}
                  setWarningMinutes={setWarningMinutes}
                  setBreachMinutes={setBreachMinutes}
                  saving={savingSla}
                  onSave={async () => {
                    if (savingSla) return;
                    setSavingSla(true);
                    setError(null);
                    try {
                      const response = await fetch("/api/conversations/collaboration", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                          action: "update_sla",
                          leadId,
                          warningMinutes: Number(warningMinutes),
                          breachMinutes: Number(breachMinutes),
                        }),
                      });
                      const payload = (await response.json()) as ApiResponse;
                      if (!response.ok || !payload.ok) throw new Error(payload.error || "Unable to save SLA settings.");
                      await load();
                    } catch (cause) {
                      setError(cause instanceof Error ? cause.message : "Unable to save SLA settings.");
                    } finally {
                      setSavingSla(false);
                    }
                  }}
                />

                {data.canManageAssignments ? <WorkloadSection rows={data.workload} ownerUserId={data.lead.ownerUserId} /> : null}
              </>
            ) : null}
          </div>
        </section>
      ) : null}

      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className={`relative inline-flex h-11 items-center gap-2 rounded-full border px-4 text-[12px] font-semibold shadow-lg transition ${
          otherViewers.length > 0
            ? "border-amber-200 bg-amber-50 text-amber-800"
            : "border-brand-200 bg-surface text-brand-700 hover:bg-brand-50"
        }`}
      >
        {otherViewers.length > 0 ? <ShieldAlert size={15} /> : <UsersRound size={15} />}
        {otherViewers.length > 0 ? `${otherViewers.length} teammate viewing` : "Collaborate"}
        {badgeCount > 0 ? (
          <span className="absolute -right-1 -top-1 grid min-h-5 min-w-5 place-items-center rounded-full bg-danger px-1 text-[9px] font-bold text-white">
            {badgeCount > 9 ? "9+" : badgeCount}
          </span>
        ) : null}
        {open ? <ChevronDown size={13} /> : <ChevronUp size={13} />}
      </button>
    </div>
  );
}

function PresenceSection({ currentUserId, viewers }: { currentUserId: string; viewers: PresenceUser[] }) {
  const others = viewers.filter((viewer) => viewer.userId !== currentUserId);
  return (
    <section className="border-b border-line px-4 py-4">
      <div className="flex items-center justify-between gap-3">
        <div className="text-[11px] font-bold uppercase tracking-[0.1em] text-copy-subtle">Live presence</div>
        <span className="text-[10.5px] text-copy-muted">{viewers.length} active</span>
      </div>
      {others.length > 0 ? (
        <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-3">
          <div className="flex gap-2">
            <ShieldAlert size={15} className="mt-0.5 shrink-0 text-amber-700" />
            <div>
              <div className="text-[12px] font-semibold text-amber-900">Another teammate has this lead open</div>
              <div className="mt-1 text-[10.5px] leading-5 text-amber-800">
                {others.map((viewer) => viewer.name).join(", ")} · coordinate before replying or changing ownership.
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="mt-3 flex items-center gap-2 rounded-xl bg-surface-soft px-3 py-2.5 text-[11px] text-copy-muted">
          <Check size={13} className="text-emerald-600" /> No editing collision detected.
        </div>
      )}
    </section>
  );
}

function MentionNoteSection({
  members,
  note,
  setNote,
  mentionedIds,
  setMentionedIds,
  saving,
  success,
  onSave,
}: {
  members: TeamMember[];
  note: string;
  setNote: (value: string) => void;
  mentionedIds: string[];
  setMentionedIds: (value: string[]) => void;
  saving: boolean;
  success: string | null;
  onSave: () => Promise<void>;
}) {
  return (
    <section className="border-b border-line px-4 py-4">
      <div className="flex items-center gap-2 text-[12px] font-semibold text-copy-strong">
        <MessageSquareText size={14} className="text-brand-700" /> Internal note + @mention
      </div>
      <textarea
        value={note}
        onChange={(event) => setNote(event.target.value)}
        rows={3}
        maxLength={4000}
        placeholder="Add context for the team…"
        className="mt-3 w-full resize-y rounded-xl border border-line bg-surface-soft px-3 py-2.5 text-[12px] leading-5 text-copy-strong outline-none focus:border-brand-600 focus:ring-2 focus:ring-brand-700/10"
      />
      {members.length > 0 ? (
        <div className="mt-2 flex max-h-20 flex-wrap gap-1.5 overflow-y-auto">
          {members.map((member) => {
            const selected = mentionedIds.includes(member.id);
            return (
              <button
                key={member.id}
                type="button"
                onClick={() => {
                  if (selected) {
                    setMentionedIds(mentionedIds.filter((id) => id !== member.id));
                    return;
                  }
                  setMentionedIds([...mentionedIds, member.id]);
                  if (!note.includes(`@${member.name}`)) {
                    setNote(`${note}${note && !note.endsWith(" ") ? " " : ""}@${member.name} `);
                  }
                }}
                className={`rounded-full border px-2 py-1 text-[10px] font-semibold transition ${
                  selected ? "border-brand-200 bg-brand-50 text-brand-700" : "border-line bg-surface text-copy-muted hover:text-copy-strong"
                }`}
              >
                @{member.name}
              </button>
            );
          })}
        </div>
      ) : null}
      <div className="mt-3 flex items-center justify-between gap-3">
        <div className="min-w-0 text-[10.5px] text-copy-muted">
          {success || (mentionedIds.length > 0 ? `${mentionedIds.length} teammate${mentionedIds.length === 1 ? "" : "s"} will be notified.` : "Internal only — nothing is sent to the lead.")}
        </div>
        <button
          type="button"
          onClick={() => void onSave()}
          disabled={!note.trim() || saving}
          className="shrink-0 rounded-lg bg-brand-700 px-3 py-2 text-[11px] font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
        >
          {saving ? "Saving…" : "Save note"}
        </button>
      </div>
    </section>
  );
}

function SlaSection({
  sla,
  canManage,
  warningMinutes,
  breachMinutes,
  setWarningMinutes,
  setBreachMinutes,
  saving,
  onSave,
}: {
  sla: CollaborationData["sla"];
  canManage: boolean;
  warningMinutes: string;
  breachMinutes: string;
  setWarningMinutes: (value: string) => void;
  setBreachMinutes: (value: string) => void;
  saving: boolean;
  onSave: () => Promise<void>;
}) {
  return (
    <section className="border-b border-line px-4 py-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-[12px] font-semibold text-copy-strong">
          <Clock3 size={14} className="text-brand-700" /> Conversation SLA
        </div>
        <Settings2 size={13} className="text-copy-subtle" />
      </div>
      <div className="mt-2 text-[10.5px] leading-5 text-copy-muted">
        Warn after {formatMinutes(sla.warningMinutes)} · breach after {formatMinutes(sla.breachMinutes)}.
      </div>
      {canManage ? (
        <div className="mt-3 grid grid-cols-[1fr_1fr_auto] gap-2">
          <label>
            <span className="mb-1 block text-[9px] font-semibold uppercase tracking-[0.08em] text-copy-subtle">Warn min</span>
            <input type="number" min={5} max={1440} value={warningMinutes} onChange={(event) => setWarningMinutes(event.target.value)} className="input h-9 w-full text-[11px]" />
          </label>
          <label>
            <span className="mb-1 block text-[9px] font-semibold uppercase tracking-[0.08em] text-copy-subtle">Breach min</span>
            <input type="number" min={10} max={10080} value={breachMinutes} onChange={(event) => setBreachMinutes(event.target.value)} className="input h-9 w-full text-[11px]" />
          </label>
          <button type="button" onClick={() => void onSave()} disabled={saving} className="mt-[17px] h-9 rounded-lg border border-line bg-surface px-3 text-[10.5px] font-semibold text-brand-700 disabled:opacity-50">
            {saving ? "…" : "Save"}
          </button>
        </div>
      ) : null}
    </section>
  );
}

function WorkloadSection({ rows, ownerUserId }: { rows: WorkloadRow[]; ownerUserId: string | null }) {
  return (
    <section className="px-4 py-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-[12px] font-semibold text-copy-strong">
          <UserRound size={14} className="text-brand-700" /> Supervisor workload
        </div>
        <Link href="/team-performance" className="text-[10.5px] font-semibold text-brand-700">Full report</Link>
      </div>
      {rows.length === 0 ? (
        <div className="mt-3 rounded-xl bg-surface-soft px-3 py-3 text-[10.5px] text-copy-muted">Workload metrics are unavailable for this workspace.</div>
      ) : (
        <div className="mt-3 space-y-2">
          {rows.slice(0, 6).map((row) => (
            <div key={row.userId} className={`rounded-xl border p-3 ${row.userId === ownerUserId ? "border-brand-200 bg-brand-50/60" : "border-line bg-surface"}`}>
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="truncate text-[11.5px] font-semibold text-copy-strong">{row.name}{row.userId === ownerUserId ? " · Owner" : ""}</div>
                  <div className="mt-0.5 text-[9.5px] capitalize text-copy-subtle">{row.role.replaceAll("_", " ")}</div>
                </div>
                <div className={`rounded-lg px-2 py-1 text-[10px] font-bold ${loadTone(row.actionLoad)}`}>{row.actionLoad} load</div>
              </div>
              <div className="mt-2 grid grid-cols-4 gap-1 text-center">
                <MiniMetric label="Owned" value={row.assigned} />
                <MiniMetric label="Reply" value={row.needsReply} />
                <MiniMetric label="Overdue" value={row.overdue} />
                <MiniMetric label="Hot" value={row.highIntent + row.paymentPending} />
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function MiniMetric({ label, value }: { label: string; value: number }) {
  return <div className="rounded-md bg-surface-soft px-1.5 py-1.5"><div className="text-[10px] font-semibold text-copy-strong">{value}</div><div className="mt-0.5 text-[8px] uppercase tracking-[0.06em] text-copy-subtle">{label}</div></div>;
}

function formatMinutes(value: number) {
  if (value < 60) return `${value}m`;
  if (value % 60 === 0) return `${value / 60}h`;
  return `${Math.floor(value / 60)}h ${value % 60}m`;
}

function loadTone(value: number) {
  if (value >= 20) return "bg-red-50 text-danger";
  if (value >= 10) return "bg-amber-50 text-amber-700";
  return "bg-emerald-50 text-emerald-700";
}