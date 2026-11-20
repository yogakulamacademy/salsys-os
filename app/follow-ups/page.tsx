import type { ReactNode } from "react";
import { ToastOnLoad } from "@/components/app-toast";

import Link from "next/link";

import {
  Check,
  CheckCircle2,
  CircleDollarSign,
  Clock,
  Globe,
  Hand,
  MessageCircleReply,
  RotateCcw,
  UserX,
} from "lucide-react";

import {
  closeSettledTasksAction,
  completeFollowUpAction,
  confirmLostFromTaskAction,
  snoozeFollowUpAction,
} from "@/app/actions/crm";

import { SubmitButton } from "@/components/submit-button";
import { ChannelBadge, EmptyState, PageHeader, StageBadge } from "@/components/ui";
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
import type { Channel, PipelineStage } from "@/types/crm";

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

const SECTION_PREVIEW = 6;

const KIND_ICON: Record<TaskKind, ReactNode> = {
  payment: <CircleDollarSign size={16} />,
  promised: <MessageCircleReply size={16} />,
  first_reply: <Globe size={16} />,
  handover: <Hand size={16} />,
  lost: <UserX size={16} />,
  other: <Clock size={16} />,
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

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        eyebrow="Sales · Tasks & Follow-ups"
        title="Tasks & Follow-ups"
        description={mock ? "Mock mode: changes are not saved." : undefined}
      />

      {/* Results show as a toast that fades (20 Nov 2026), not a banner. */}
      <ToastOnLoad message={query.notice ? noticeText(query.notice) : null} error={query.error ?? null} />

      <section aria-label="Today" className="flex flex-col gap-1.5 rounded-[18px] border border-line bg-surface p-5 shadow-card sm:p-6">
        <span className="text-[11px] font-bold uppercase tracking-[0.1em] text-brand-700">Today</span>
        <p className="max-w-[980px] text-xl font-bold leading-snug tracking-[-0.01em] text-copy-strong sm:text-[22px]">{story.headline}</p>
        <p className="text-[13px] text-copy-muted">
          {story.dueNow.toLocaleString("en-IN")} due now
          {story.lateOverWeek ? ` · ${story.lateOverWeek.toLocaleString("en-IN")} over a week late` : ""}
          {story.waiting ? ` · in ${story.waiting.toLocaleString("en-IN")} the lead wrote last and has no reply logged` : ""}
          {story.upcomingWeek ? ` · ${story.upcomingWeek.toLocaleString("en-IN")} more coming up this week` : ""}
        </p>
      </section>

      <section aria-label="Kinds of work" className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <KindCard kind="payment" story={story} note="At Payment pending or marked to check" />
        <KindCard kind="promised" story={story} note="They said “later” or gave you a time" />
        <KindCard
          kind="first_reply"
          story={story}
          note={story.oldestFormDays ? `No reply logged · oldest ${story.oldestFormDays} days` : "No reply logged yet"}
        />
        <KindCard kind="handover" story={story} note="AI paused and passed the chat to you" />
        <KindCard kind="lost" story={story} note="AI thinks they said no" />
      </section>

      <nav aria-label="Filter tasks" className="flex flex-wrap gap-2">
        <Tab href="/follow-ups" active={view === "all"} label="All due" count={story.dueNow} />
        {KIND_ORDER.filter((k) => story.counts[k] > 0).map((k) => (
          <Tab key={k} href={`/follow-ups?view=${k}`} active={view === k} label={KIND_LABEL[k]} count={story.counts[k]} />
        ))}
        <Tab href="/follow-ups?view=upcoming" active={view === "upcoming"} label="Coming up this week" count={story.upcomingWeek} />
      </nav>

      {settled.length && view === "all" ? (
        <section className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 px-5 py-4 dark:border-emerald-900 dark:bg-emerald-950/40">
          <div>
            <p className="text-sm font-semibold text-emerald-900 dark:text-emerald-200">
              {settled.length.toLocaleString("en-IN")} {settled.length === 1 ? "task is" : "tasks are"} for leads that are already enrolled or lost.
            </p>
            <p className="text-[13px] text-emerald-800/80 dark:text-emerald-300/80">
              {settled.slice(0, 4).map((t) => `${t.leadName} (${t.settledLabel?.toLowerCase()})`).join(", ")}
              {settled.length > 4 ? ` and ${settled.length - 4} more` : ""}
            </p>
          </div>
          <form action={closeSettledTasksAction}>
            {settled.map((t) => <input key={t.id} type="hidden" name="task_id" value={t.id} />)}
            <SubmitButton pendingLabel="Closing…" className="h-10 rounded-xl bg-emerald-700 px-4 text-sm font-semibold text-white hover:bg-emerald-800">
              Close {settled.length === 1 ? "it" : `all ${settled.length}`}
            </SubmitButton>
          </form>
        </section>
      ) : null}

      {view === "all" ? (
        story.dueNow === 0 ? (
          <CaughtUp />
        ) : (
          KIND_ORDER.filter((k) => story.counts[k] > 0).map((k) => {
            const rows = story.due.filter((t) => t.kind === k && !t.settled);
            return (
              <TaskSection key={k} kind={k} total={rows.length} view={view}>
                {rows.slice(0, SECTION_PREVIEW).map((t) => <TaskRow key={t.id} task={t} view={view} />)}
              </TaskSection>
            );
          })
        )
      ) : view === "upcoming" ? (
        <section className="overflow-hidden rounded-2xl border border-line bg-surface shadow-card">
          <header className="border-b border-line px-5 py-4">
            <h2 className="text-base font-bold text-copy-strong">Coming up this week</h2>
            <p className="text-[13px] text-copy-muted">Not due yet. Earliest first.</p>
          </header>
          {story.upcoming.length ? story.upcoming.map((t) => <TaskRow key={t.id} task={t} view={view} />) : <CaughtUp text="Nothing else is scheduled this week." />}
        </section>
      ) : (
        <TaskSection kind={view} total={story.due.filter((t) => t.kind === view).length} view={view} full>
          {story.due.filter((t) => t.kind === view).map((t) => <TaskRow key={t.id} task={t} view={view} />)}
        </TaskSection>
      )}
    </div>
  );
}

function KindCard({ kind, story, note }: { kind: TaskKind; story: FollowupsStory; note: string }) {
  const n = story.counts[kind];
  return (
    <Link
      href={`/follow-ups?view=${kind}`}
      className={`flex flex-col gap-1 rounded-2xl border bg-surface p-4 shadow-card transition hover:border-line-strong ${n ? "border-line" : "border-line opacity-70"}`}
    >
      <span className="flex items-center gap-2 text-[13px] font-semibold text-copy-muted">
        <span className="text-brand-700">{KIND_ICON[kind]}</span>
        {KIND_LABEL[kind]}
      </span>
      <span className="text-[28px] font-bold leading-tight tracking-[-0.02em] text-copy-strong">{n.toLocaleString("en-IN")}</span>
      <span className="text-[12px] leading-snug text-copy-muted">{note}</span>
    </Link>
  );
}

function Tab({ href, active, label, count }: { href: string; active: boolean; label: string; count: number }) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={`inline-flex h-9 items-center gap-2 rounded-full border px-3.5 text-[13px] font-semibold transition ${
        active ? "border-brand-600 bg-brand-600 text-white" : "border-line bg-surface text-copy-strong hover:border-line-strong"
      }`}
    >
      {label}
      <span className={`rounded-full px-1.5 text-[11px] ${active ? "bg-white/20" : "bg-surface-soft text-copy-muted"}`}>{count.toLocaleString("en-IN")}</span>
    </Link>
  );
}

function TaskSection({ kind, total, view, full, children }: { kind: TaskKind; total: number; view: View; full?: boolean; children: ReactNode }) {
  return (
    <section className="overflow-hidden rounded-2xl border border-line bg-surface shadow-card">
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-line px-5 py-4">
        <div>
          <h2 className="flex items-center gap-2 text-base font-bold text-copy-strong">
            <span className="text-brand-700">{KIND_ICON[kind]}</span>
            {KIND_LABEL[kind]}
            <span className="rounded-full bg-surface-soft px-2 py-0.5 text-xs font-semibold text-copy-muted">{total.toLocaleString("en-IN")}</span>
          </h2>
          <p className="mt-0.5 text-[13px] text-copy-muted">{KIND_HINT[kind]}</p>
          {kind === "payment" ? (
            <p className="mt-1 text-[13px]">
              <Link href="/leads#says-paid" className="font-semibold text-brand-700 hover:underline">See leads who wrote that they paid</Link>
            </p>
          ) : null}
        </div>
        {!full && total > SECTION_PREVIEW ? (
          <Link href={`/follow-ups?view=${kind}`} className="inline-flex h-9 items-center rounded-xl border border-line px-3 text-[13px] font-semibold text-copy-strong hover:border-line-strong">
            See all {total.toLocaleString("en-IN")}
          </Link>
        ) : null}
      </header>
      <div>{total ? children : <CaughtUp />}</div>
    </section>
  );
}

function money(task: ShapedTask) {
  if (task.value == null) return null;
  return `Worth about ${compactMoney(task.value, task.currency ?? "INR")}`;
}

function waitedText(since: string | null) {
  if (!since) return null;
  const days = Math.floor((Date.now() - Date.parse(since)) / 86_400_000);
  if (!Number.isFinite(days)) return null;
  if (days <= 0) return "Waiting since today";
  return days > 14 ? `No reply logged · ${days}d` : `Waiting ${days}d for you`;
}

function TaskRow({ task, view }: { task: ShapedTask; view: View }) {
  const extras = [task.course, money(task)].filter(Boolean).join(" · ");
  const waiting = task.waiting && !task.settled ? waitedText(task.lastInboundAt) : null;
  const showLastMessage =
    task.lastInboundText && task.kind !== "promised" && task.kind !== "lost" && task.kind !== "first_reply";

  return (
    <article className="flex gap-3 border-b border-line px-5 py-4 last:border-b-0">
      <form action={completeFollowUpAction} className="pt-0.5">
        <input type="hidden" name="task_id" value={task.id} />
        <input type="hidden" name="lead_id" value={task.leadId} />
        <input type="hidden" name="return_to" value="follow-ups" />
        <input type="hidden" name="view" value={view} />
        <SubmitButton
          pendingLabel=""
          title="Mark done"
          aria-label={`Mark the task for ${task.leadName} done`}
          className="flex h-8 w-8 items-center justify-center rounded-full border border-line-strong text-copy-muted hover:border-emerald-600 hover:bg-emerald-50 hover:text-emerald-700"
        >
          <Check size={15} aria-hidden="true" />
        </SubmitButton>
      </form>

      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1.5">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <Link href={`/leads/${task.leadId}`} className="text-[15px] font-semibold text-copy-strong hover:underline">{task.leadName}</Link>
            <StageBadge stage={task.stage as PipelineStage} />
            {task.saysPaid ? (
              <span className="rounded-md bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-200">Says they paid</span>
            ) : null}
            {task.taskType === "payment_check" ? (
              <span className="rounded-md bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-800 dark:bg-amber-950/50 dark:text-amber-200">Payment verification</span>
            ) : null}
            {extras ? <span className="text-[13px] text-copy-muted">{extras}</span> : null}
          </div>
          <div className="flex items-center gap-2">
            {waiting ? (
              <span className="rounded-full bg-brand-50 px-2.5 py-0.5 text-[11px] font-semibold text-brand-800 dark:bg-brand-950/50 dark:text-brand-200">{waiting}</span>
            ) : null}
            <ChannelBadge channel={task.channel as Channel} />
            <span
              title={formatDateTime(task.dueAt)}
              className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${
                task.due.late
                  ? task.due.daysLate > 7
                    ? "bg-rose-50 text-rose-700 dark:bg-rose-950/50 dark:text-rose-200"
                    : "bg-amber-50 text-amber-800 dark:bg-amber-950/50 dark:text-amber-200"
                  : "bg-surface-soft text-copy-muted"
              }`}
            >
              <Clock size={12} aria-hidden="true" />
              {task.due.label}
            </span>
          </div>
        </div>

        <p className="text-[14px] leading-snug text-copy-strong">{task.why}</p>
        {showLastMessage ? (
          <p className="text-[13px] text-copy-muted">Last message from them: “{task.lastInboundText}”</p>
        ) : null}

        <div className="flex flex-wrap items-center gap-2">
          {task.settled ? (
            <span className="text-[13px] font-semibold text-emerald-700 dark:text-emerald-300">{task.settledLabel}: this task can be closed with ✓</span>
          ) : task.kind === "lost" ? (
            <>
              <form action={confirmLostFromTaskAction}>
                <input type="hidden" name="task_id" value={task.id} />
                <input type="hidden" name="lead_id" value={task.leadId} />
                <input type="hidden" name="view" value={view} />
                <SubmitButton pendingLabel="Saving…" className="h-9 rounded-xl bg-copy-strong px-3.5 text-[13px] font-semibold text-surface hover:opacity-90">
                  Mark Lost
                </SubmitButton>
              </form>
              <form action={completeFollowUpAction}>
                <input type="hidden" name="task_id" value={task.id} />
                <input type="hidden" name="lead_id" value={task.leadId} />
                <input type="hidden" name="return_to" value="follow-ups" />
                <input type="hidden" name="view" value={view} />
                <SubmitButton pendingLabel="Saving…" className="h-9 rounded-xl border border-line px-3.5 text-[13px] font-semibold text-copy-strong hover:border-line-strong">
                  Keep them
                </SubmitButton>
              </form>
              <ChatLink leadId={task.leadId} label="Read the chat" />
            </>
          ) : (
            <>
              <ChatLink leadId={task.leadId} label={task.kind === "first_reply" ? "Open lead" : "Open chat"} primary />
              <SnoozeButtons task={task} view={view} />
            </>
          )}
        </div>
      </div>
    </article>
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

function SnoozeButtons({ task, view }: { task: ShapedTask; view: View }) {
  const presets: Array<[number, string]> = [[1, "Tomorrow"], [3, "In 3 days"], [7, "Next week"]];
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="inline-flex items-center gap-1 pl-1 text-[12px] text-copy-muted">
        <RotateCcw size={12} aria-hidden="true" /> Reschedule:
      </span>
      {presets.map(([days, label]) => (
        <form key={days} action={snoozeFollowUpAction}>
          <input type="hidden" name="task_id" value={task.id} />
          <input type="hidden" name="snooze_days" value={days} />
          <input type="hidden" name="view" value={view} />
          <SubmitButton pendingLabel="…" className="h-8 rounded-lg border border-line px-2.5 text-[12px] font-semibold text-copy-strong hover:border-line-strong">
            {label}
          </SubmitButton>
        </form>
      ))}
      <details className="group relative">
        <summary className="flex h-8 cursor-pointer list-none items-center rounded-lg px-2 text-[12px] font-semibold text-brand-700 hover:underline">Pick a time</summary>
        <form action={snoozeFollowUpAction} className="absolute left-0 top-9 z-10 flex items-center gap-2 rounded-xl border border-line bg-surface p-2 shadow-card">
          <input type="hidden" name="task_id" value={task.id} />
          <input type="hidden" name="view" value={view} />
          <input
            type="datetime-local"
            name="due_at"
            required
            aria-label={`New time for ${task.leadName}`}
            className="h-8 rounded-lg border border-line bg-surface px-2 text-[12px] text-copy-strong"
          />
          <SubmitButton pendingLabel="Saving…" className="h-8 rounded-lg bg-brand-600 px-3 text-[12px] font-semibold text-white">
            Reschedule
          </SubmitButton>
        </form>
      </details>
    </div>
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
