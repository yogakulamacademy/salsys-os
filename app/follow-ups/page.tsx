import { ToastOnLoad } from "@/components/app-toast";

import Link from "next/link";

import {
  Check,
  CheckCircle2,
  RotateCcw,
} from "lucide-react";

import {
  closeSettledTasksAction,
  completeFollowUpAction,
  confirmLostFromTaskAction,
  snoozeFollowUpAction,
} from "@/app/actions/crm";

import { SubmitButton } from "@/components/submit-button";
import { ActionCards, initialsOf, type ActionCardItem } from "@/components/crm/action-cards";
import { EmptyState, PageHeader } from "@/components/ui";
import { getFollowUpsWorkspace } from "@/lib/followups-data";
import { getFollowupsStory } from "@/lib/followups-story-data";
import {
  buildFollowupsStory,
  KIND_LABEL,
  KIND_ORDER,
  type FollowupsStory,
  type ShapedTask,
  type TaskKind,
} from "@/lib/followups-story";
import { compactMoney } from "@/lib/home-data-health";
import { isMockMode } from "@/lib/data";
import { formatDateTime } from "@/lib/format";

// Tasks & Follow-ups (owner request, 20 Nov 2026): the open tasks were one
// oldest-first list of 157 with a date picker on every row. They are five
// different jobs, so the page now says what is waiting in one sentence, sorts
// tasks into those jobs, shows why each exists (what the lead said), and turns
// the common answers into one click: done, snooze to tomorrow / 3 days / next
// week, confirm Lost, or close tasks for leads that are already settled.

type View = "all" | TaskKind | "upcoming";

type FollowUpsPageProps = {
  searchParams: Promise<{ notice?: string; error?: string; view?: string }>;
};


const KIND_HINT: Record<TaskKind, string> = {
  payment: "Payment verification: confirm the money arrived, then mark them enrolled.",
  promised: "They told you when to come back. Most useful first: hottest stage, then the longest wait.",
  first_reply: "Enrolment, reservation and contact forms first, then the newest brochure requests.",
  handover: "The AI stopped on these chats and needs a person to reply.",
  lost: "The AI read their messages as a no. Mark them Lost, or keep them if you'd rather try again.",
  other: "Everything else that is due.",
};

function parseView(value: string | undefined): View {
  if (value === "upcoming" || (KIND_ORDER as string[]).includes(value ?? "")) return value as View;
  return "all";
}

async function loadStory(): Promise<FollowupsStory> {
  if (!isMockMode()) {
    const story = await getFollowupsStory();
    if (story) return story;
  }
  // Mock mode or the live read failed: fall back to the older read model.
  const workspace = await getFollowUpsWorkspace({ page: 1, pageSize: 100 });
  return buildFollowupsStory(
    workspace.tasks.map((t) => ({
      id: t.id, leadId: t.leadId, leadName: t.leadName, leadCode: t.leadCode, stage: t.stage, title: t.title,
      description: null, dueAt: t.dueAt, createdById: null, taskType: t.taskType, channel: t.channel, origin: null,
      lastInboundAt: null, lastOutboundAt: null, lastInboundText: null, value: null, currency: null, course: null,
    })),
    new Date(),
  );
}

export default async function FollowUpsPage({ searchParams }: FollowUpsPageProps) {
  const query = await searchParams;
  const view = parseView(query.view);
  const story = await loadStory();
  const mock = isMockMode();
  const settled = story.due.filter((t) => t.settled);

  const cardNote: Record<TaskKind, string> = {
    payment: story.due.filter((t) => t.kind === "payment" && t.saysPaid).length
      ? `${story.due.filter((t) => t.kind === "payment" && t.saysPaid).length} say they've paid`
      : "At Payment pending or marked to check",
    promised: "Said “later” or gave a time",
    first_reply: story.oldestFormDays ? `No reply logged · oldest ${story.oldestFormDays} days` : "No reply logged yet",
    handover: "AI paused and passed it to you",
    lost: "AI thinks they said no",
    other: "Everything else that is due",
  };
  const cards: ActionCardItem[] = (["payment", "promised", "first_reply", "handover", "lost"] as TaskKind[])
    .filter((k) => story.counts[k] > 0)
    .map((k) => ({
      count: story.counts[k],
      title: k === "lost" ? "Confirm “Lost?”" : KIND_LABEL[k],
      detail: cardNote[k],
      cta: k === "lost" ? "Review" : "Open",
      href: `/follow-ups?view=${k}`,
      tone: k === "payment" ? "money" : k === "first_reply" ? "attention" : k === "lost" ? "neutral" : "brand",
    }));

  // One list in the order of the jobs (payments first), settled ones left out.
  const order = new Map(KIND_ORDER.map((k, i) => [k, i]));
  const rows =
    view === "all"
      ? story.due.filter((t) => !t.settled).sort((x, y) => (order.get(x.kind) ?? 9) - (order.get(y.kind) ?? 9))
      : view === "upcoming"
        ? story.upcoming
        : story.due.filter((t) => t.kind === view);

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Tasks & follow-ups"
        description={
          <span className="text-[15px] leading-7 text-copy">
            {mock ? "Mock mode: changes are not saved. " : null}
            <strong className="font-semibold text-copy-strong">{story.headline}</strong>
            {story.lateOverWeek ? ` ${story.lateOverWeek.toLocaleString("en-IN")} are over a week late.` : ""}
          </span>
        }
        actions={
          story.counts.payment > 0 ? (
            <Link href="/follow-ups?view=payment" className="btn-primary">Start with payments</Link>
          ) : undefined
        }
      />

      {/* Results show as a toast that fades (20 Nov 2026), not a banner. */}
      <ToastOnLoad message={query.notice ? noticeText(query.notice) : null} error={query.error ?? null} />

      <ActionCards items={cards} label="Kinds of work" />

      {settled.length && view === "all" ? (
        <section className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-emerald-50 px-4 py-2.5 text-[13px] dark:bg-emerald-950/30">
          <p className="min-w-0 text-emerald-900 dark:text-emerald-200">
            <strong>
              {settled.length.toLocaleString("en-IN")} {settled.length === 1 ? "task is" : "tasks are"} for leads already enrolled or lost
            </strong>{" "}
            ({settled.slice(0, 3).map((t) => t.leadName).join(", ")}{settled.length > 3 ? ` and ${settled.length - 3} more` : ""}).
          </p>
          <form action={closeSettledTasksAction}>
            {settled.map((t) => <input key={t.id} type="hidden" name="task_id" value={t.id} />)}
            <SubmitButton pendingLabel="Closing…" className="text-[13px] font-semibold text-emerald-800 hover:underline dark:text-emerald-200">
              Close {settled.length === 1 ? "it" : `all ${settled.length}`} →
            </SubmitButton>
          </form>
        </section>
      ) : null}

      <section className="overflow-hidden rounded-2xl border border-line bg-surface shadow-card">
        <div className="border-b border-line px-4 py-3">
          <nav aria-label="Filter tasks" className="flex flex-wrap items-center gap-1 rounded-xl bg-surface-soft p-1 sm:inline-flex">
            <Tab href="/follow-ups" active={view === "all"} label="All due" count={story.dueNow} />
            {KIND_ORDER.filter((k) => story.counts[k] > 0).map((k) => (
              <Tab key={k} href={`/follow-ups?view=${k}`} active={view === k} label={k === "lost" ? "Confirm Lost?" : KIND_LABEL[k]} count={story.counts[k]} />
            ))}
            <Tab href="/follow-ups?view=upcoming" active={view === "upcoming"} label="Coming up" count={story.upcomingWeek} />
          </nav>
          {view !== "all" && view !== "upcoming" ? <p className="mt-2 text-[13px] text-copy-muted">{KIND_HINT[view]}</p> : null}
          {view === "upcoming" ? <p className="mt-2 text-[13px] text-copy-muted">Not due yet. Earliest first.</p> : null}
        </div>
        {rows.length ? (
          <div className="overflow-x-auto">
            <div role="table" aria-label="Tasks" className="min-w-[1100px]">
              <div role="row" className="grid grid-cols-[minmax(220px,1.3fr)_minmax(220px,1.5fr)_minmax(260px,2fr)_130px_minmax(250px,1.3fr)] gap-4 border-b border-line px-5 py-2.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-copy-muted">
                <span role="columnheader">Who</span>
                <span role="columnheader">Course · value</span>
                <span role="columnheader">Why now</span>
                <span role="columnheader">Due</span>
                <span role="columnheader">Do it</span>
              </div>
              {rows.map((t) => <TaskRow key={t.id} task={t} view={view} />)}
            </div>
          </div>
        ) : (
          <CaughtUp text={view === "upcoming" ? "Nothing else is scheduled this week." : undefined} />
        )}
      </section>
    </div>
  );
}


function Tab({ href, active, label, count }: { href: string; active: boolean; label: string; count: number }) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={`inline-flex h-9 items-center gap-1.5 rounded-lg px-3 text-[13px] font-medium transition ${
        active ? "bg-brand-700 text-white shadow-sm" : "text-copy-muted hover:bg-surface hover:text-copy-strong"
      }`}
    >
      {label}
      <span className={`text-[12px] tabular-nums ${active ? "text-white/85" : "text-copy-subtle"}`}>{count.toLocaleString("en-IN")}</span>
    </Link>
  );
}




const CHANNEL_DOT: Record<string, string> = {
  instagram: "bg-pink-500", whatsapp: "bg-emerald-500", website: "bg-blue-500", email: "bg-slate-400",
};

function TaskRow({ task, view }: { task: ShapedTask; view: View }) {
  const value = task.value != null ? `≈ ${compactMoney(task.value, task.currency ?? "INR")}` : null;
  const action =
    task.kind === "payment"
      ? { label: "Check payment", href: `/conversations?lead=${task.leadId}` }
      : task.kind === "first_reply" || task.kind === "handover"
        ? { label: "Reply", href: `/conversations?lead=${task.leadId}` }
        : { label: "Open chat", href: `/conversations?lead=${task.leadId}` };
  const dueTone = task.due.late
    ? task.due.daysLate > 7
      ? "bg-rose-50 text-rose-700 dark:bg-rose-950/50 dark:text-rose-200"
      : "bg-orange-50 text-orange-700 dark:bg-orange-950/50 dark:text-orange-200"
    : "bg-brand-50 text-brand-700 dark:bg-brand-950/40 dark:text-brand-200";
  const channel = String(task.channel || "").toLowerCase();

  return (
    <div role="row" className="grid grid-cols-[minmax(220px,1.3fr)_minmax(220px,1.5fr)_minmax(260px,2fr)_130px_minmax(250px,1.3fr)] items-center gap-4 border-b border-line px-5 py-3 last:border-b-0">
      <div role="cell" className="flex min-w-0 items-center gap-3">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-brand-50 text-[12px] font-bold text-brand-700 dark:bg-brand-950/30 dark:text-brand-300">{initialsOf(task.leadName)}</span>
        <div className="min-w-0">
          <Link href={`/leads/${task.leadId}`} className="block truncate text-[14px] font-semibold text-copy-strong hover:underline">{task.leadName}</Link>
          {channel ? (
            <span className="flex items-center gap-1.5 text-[12px] text-copy-muted">
              <span className={`h-1.5 w-1.5 rounded-full ${CHANNEL_DOT[channel] ?? "bg-slate-400"}`} aria-hidden="true" />
              {channel.charAt(0).toUpperCase() + channel.slice(1)}
            </span>
          ) : null}
        </div>
      </div>
      <div role="cell" className="min-w-0 truncate text-[13px] text-copy">
        {[task.course, value].filter(Boolean).join(" · ") || <span className="text-copy-subtle">Course not known yet</span>}
      </div>
      <div role="cell" className="min-w-0 text-[13px] leading-snug text-copy" title={task.lastInboundText ?? undefined}>
        <span className="line-clamp-2">{task.why}</span>
        {task.saysPaid ? <span className="mt-0.5 block text-[12px] font-semibold text-emerald-700 dark:text-emerald-300">Says they paid</span> : null}
      </div>
      <div role="cell">
        <span title={formatDateTime(task.dueAt)} className={`inline-flex rounded-lg px-2 py-1 text-[12px] font-semibold ${dueTone}`}>{task.due.label}</span>
      </div>
      <div role="cell" className="flex flex-wrap items-center gap-1.5">
        {task.settled ? (
          <span className="text-[12px] font-semibold text-emerald-700 dark:text-emerald-300">{task.settledLabel}</span>
        ) : task.kind === "lost" ? (
          <>
            <form action={confirmLostFromTaskAction}>
              <input type="hidden" name="task_id" value={task.id} />
              <input type="hidden" name="lead_id" value={task.leadId} />
              <input type="hidden" name="view" value={view} />
              <SubmitButton pendingLabel="Saving…" className="h-8 rounded-lg bg-copy-strong px-3 text-[13px] font-semibold text-surface hover:opacity-90">Mark Lost</SubmitButton>
            </form>
            <form action={completeFollowUpAction}>
              <input type="hidden" name="task_id" value={task.id} />
              <input type="hidden" name="lead_id" value={task.leadId} />
              <input type="hidden" name="return_to" value="follow-ups" />
              <input type="hidden" name="view" value={view} />
              <SubmitButton pendingLabel="Saving…" className="h-8 rounded-lg border border-line px-3 text-[13px] font-semibold text-copy-strong hover:border-line-strong">Keep them</SubmitButton>
            </form>
            <ChatLink leadId={task.leadId} label="Read the chat" />
          </>
        ) : (
          <>
            <Link href={action.href} className="inline-flex h-8 items-center rounded-lg bg-brand-600 px-3 text-[13px] font-semibold text-white hover:bg-brand-700">{action.label}</Link>
            <LaterMenu task={task} view={view} />
          </>
        )}
        <form action={completeFollowUpAction}>
          <input type="hidden" name="task_id" value={task.id} />
          <input type="hidden" name="lead_id" value={task.leadId} />
          <input type="hidden" name="return_to" value="follow-ups" />
          <input type="hidden" name="view" value={view} />
          <SubmitButton
            pendingLabel=""
            title="Mark done"
            aria-label={`Mark the task for ${task.leadName} done`}
            className="flex h-8 w-8 items-center justify-center rounded-lg border border-line text-copy-muted hover:border-emerald-600 hover:bg-emerald-50 hover:text-emerald-700"
          >
            <Check size={14} aria-hidden="true" />
          </SubmitButton>
        </form>
      </div>
    </div>
  );
}

function ChatLink({ leadId, label, primary }: { leadId: string; label: string; primary?: boolean }) {
  const href = label === "Open lead" ? `/leads/${leadId}` : `/conversations?lead=${leadId}`;
  return (
    <Link
      href={href}
      className={`inline-flex h-9 items-center rounded-xl px-3.5 text-[13px] font-semibold ${
        primary ? "bg-brand-600 text-white hover:bg-brand-700" : "border border-line text-copy-strong hover:border-line-strong"
      }`}
    >
      {label}
    </Link>
  );
}

function LaterMenu({ task, view }: { task: ShapedTask; view: View }) {
  const presets: Array<[number, string]> = [[1, "Tomorrow"], [3, "In 3 days"], [7, "Next week"]];
  return (
    <details className="group relative">
      <summary className="flex h-8 cursor-pointer list-none items-center gap-1 rounded-lg border border-line px-2.5 text-[13px] font-semibold text-copy-strong hover:border-line-strong">
        <RotateCcw size={12} aria-hidden="true" /> Later ▾
      </summary>
      <div className="absolute right-0 top-9 z-20 flex w-72 flex-col gap-1 rounded-xl border border-line bg-surface p-2 shadow-card">
        {presets.map(([days, label]) => (
          <form key={days} action={snoozeFollowUpAction}>
            <input type="hidden" name="task_id" value={task.id} />
            <input type="hidden" name="snooze_days" value={days} />
            <input type="hidden" name="view" value={view} />
            <SubmitButton pendingLabel="…" className="h-8 w-full rounded-lg px-2.5 text-left text-[13px] font-medium text-copy-strong hover:bg-surface-soft">{label}</SubmitButton>
          </form>
        ))}
        <form action={snoozeFollowUpAction} className="flex items-center gap-1.5 border-t border-line pt-2">
          <input type="hidden" name="task_id" value={task.id} />
          <input type="hidden" name="view" value={view} />
          <input
            type="datetime-local"
            name="due_at"
            required
            aria-label={`New time for ${task.leadName}`}
            className="h-8 min-w-0 flex-1 rounded-lg border border-line bg-surface px-1.5 text-[12px] text-copy-strong"
          />
          <SubmitButton pendingLabel="…" className="h-8 rounded-lg bg-brand-600 px-2 text-[12px] font-semibold text-white">Reschedule</SubmitButton>
        </form>
      </div>
    </details>
  );
}

function CaughtUp({ text = "Nothing is waiting here." }: { text?: string }) {
  return (
    <div className="px-5 py-8">
      <EmptyState title="You’re caught up" description={text} icon={<CheckCircle2 size={20} />} compact />
    </div>
  );
}

function noticeText(notice: string) {
  const closed = notice.match(/^closed-(\d+)$/);
  if (closed) return `Closed ${closed[1]} ${closed[1] === "1" ? "task" : "tasks"}.`;
  const messages: Record<string, string> = {
    completed: "Done. Task closed.",
    snoozed: "Task rescheduled.",
    "lost-confirmed": "Moved to Lost and the suggestion closed.",
    "mock-complete": "Mock mode: task was not changed.",
    "mock-snooze": "Mock mode: task was not changed.",
  };
  return messages[notice] ?? notice;
}
