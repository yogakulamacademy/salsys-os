import type { DashboardPeriodSelection } from "./dashboard-period-data";

export type HomeLead = {
  id: string;
  display_name: string | null;
  lead_code: string;
  created_at: string;
  first_touch_source: string | null;
  interested_course_id: string | null;
};
export type HomeStage = {
  id: string;
  lead_id: string;
  to_stage: string;
  changed_at: string;
};
export type HomeMessage = {
  id: string;
  conversation_id: string;
  lead_id: string;
  created_at: string;
  direction: string;
  sender_type: string;
  status: string;
};
export type HomePayment = {
  id: string;
  lead_id: string;
  amount: number | string;
  currency: string;
  payment_kind: string;
  status: string;
  paid_at: string | null;
};
export type HomeCourse = { id: string; name: string };
export type Evidence<T> = { rows: T[]; available: boolean };
export type HomeInput = {
  leads: Evidence<HomeLead>;
  stages: Evidence<HomeStage>;
  messages: Evidence<HomeMessage>;
  payments: Evidence<HomePayment>;
  courses: Evidence<HomeCourse>;
};
export type HomeRecord = {
  id: string;
  name: string;
  detail: string;
  at: string;
  href: string;
  groupId?: string;
};
export type HomeMetric = {
  current: number | null;
  previous: number | null;
  records: HomeRecord[];
};
export type HomeProjection = ReturnType<typeof projectHome>;
export type HomeDetail =
  | "leads"
  | "qualified"
  | "enrolled"
  | "conversations"
  | "replies"
  | "revenue"
  | "contacted"
  | "source"
  | "course";

const ranks: Record<string, number> = {
  new: 0,
  contacted: 1,
  engaged: 1,
  qualified: 2,
  high_intent: 2,
  payment_pending: 2,
  enrolled: 3,
  closed_won: 3,
};
export function inWindow(at: string | null, start: string, end: string) {
  const time = Date.parse(at ?? "");
  return (
    Number.isFinite(time) && time >= Date.parse(start) && time < Date.parse(end)
  );
}
const utcDay = (at: string) =>
  Number.isFinite(Date.parse(at))
    ? new Date(at).toISOString().slice(0, 10)
    : "";
export function percentageChange(
  current: number | null,
  previous: number | null,
) {
  return current === null || previous === null || previous === 0
    ? null
    : Math.round(((current - previous) / Math.abs(previous)) * 1000) / 10;
}
export function homeHref(
  period: DashboardPeriodSelection,
  params: Record<string, string> = {},
) {
  return `/home?${new URLSearchParams({ period: period.preset, from: period.startDate, to: period.endDate, ...params })}`;
}
export function projectHome(
  input: HomeInput,
  period: DashboardPeriodSelection,
) {
  const current = (at: string | null) =>
    inWindow(at, period.startIso, period.endExclusiveIso);
  const previous = (at: string | null) =>
    inWindow(at, period.previousStartIso, period.previousEndExclusiveIso);
  const leads = input.leads.rows;
  const selected = leads.filter((l) => current(l.created_at));
  const preceding = leads.filter((l) => previous(l.created_at));
  const leadRecord = (l: HomeLead): HomeRecord => ({
    id: l.id,
    name: l.display_name || l.lead_code,
    detail: l.lead_code,
    at: l.created_at,
    href: `/leads/${encodeURIComponent(l.id)}`,
  });
  const leadById = new Map(leads.map((l) => [l.id, l]));
  const rankMap = (end: string) =>
    input.stages.rows.reduce((map, s) => {
      const lead = leadById.get(s.lead_id);
      if (
        lead &&
        Date.parse(s.changed_at) >= Date.parse(lead.created_at) &&
        Date.parse(s.changed_at) < Date.parse(end)
      )
        map.set(
          s.lead_id,
          Math.max(map.get(s.lead_id) ?? 0, ranks[s.to_stage] ?? -1),
        );
      return map;
    }, new Map<string, number>());
  const currentRanks = rankMap(period.endExclusiveIso),
    previousRanks = rankMap(period.previousEndExclusiveIso);
  const reached = (rows: HomeLead[], rank: number, end: string) =>
    rows.filter(
      (l) =>
        ((end === period.endExclusiveIso ? currentRanks : previousRanks).get(
          l.id,
        ) ?? 0) >= rank,
    );
  const cohortAvailable = input.leads.available && input.stages.available;
  const metric = (
    rows: HomeRecord[],
    prev: number,
    available: boolean,
  ): HomeMetric => ({
    current: available ? rows.length : null,
    previous: available ? prev : null,
    records: available ? rows : [],
  });
  const qualified = metric(
    reached(selected, 2, period.endExclusiveIso).map(leadRecord),
    reached(preceding, 2, period.previousEndExclusiveIso).length,
    cohortAvailable,
  );
  const contacted = metric(
    reached(selected, 1, period.endExclusiveIso).map(leadRecord),
    reached(preceding, 1, period.previousEndExclusiveIso).length,
    cohortAvailable,
  );
  const cohortEnrolled = metric(
    reached(selected, 3, period.endExclusiveIso).map(leadRecord),
    reached(preceding, 3, period.previousEndExclusiveIso).length,
    cohortAvailable,
  );
  // Enrolled KPI counts actual enrolled-stage transitions, not closed-won or Enrollment records.
  const enrolledIn = (test: (at: string) => boolean) => [
    ...new Map(
      input.stages.rows
        .filter((s) => s.to_stage === "enrolled" && test(s.changed_at))
        .map((s) => [s.lead_id, s]),
    ).values(),
  ];
  const enrolled = metric(
    enrolledIn(current).map((s) => ({
      id: s.lead_id,
      name: "Enrolled lead",
      detail: "CRM stage transition",
      at: s.changed_at,
      href: `/leads/${encodeURIComponent(s.lead_id)}`,
    })),
    enrolledIn(previous).length,
    input.stages.available,
  );
  const accepted = input.messages.rows.filter((m) =>
    ["received", "sent", "delivered", "read"].includes(m.status),
  );
  const conversationRows = (test: (at: string) => boolean) => [
    ...new Map(
      accepted
        .filter((m) => test(m.created_at))
        .map((m) => [m.conversation_id, m]),
    ).values(),
  ];
  const messageRecord = (m: HomeMessage): HomeRecord => ({
    id: m.id,
    groupId: m.conversation_id,
    name: `Conversation · ${m.conversation_id.slice(0, 8)}`,
    detail:
      m.direction === "outbound" && m.sender_type === "human"
        ? "Human reply"
        : "Message activity",
    at: m.created_at,
    href: `/conversations?lead=${encodeURIComponent(m.lead_id)}`,
  });
  const conversations = metric(
    conversationRows(current).map(messageRecord),
    conversationRows(previous).length,
    input.messages.available,
  );
  const humanReplies = accepted.filter(
    (m) => m.direction === "outbound" && m.sender_type === "human",
  );
  const replies = metric(
    humanReplies.filter((m) => current(m.created_at)).map(messageRecord),
    humanReplies.filter((m) => previous(m.created_at)).length,
    input.messages.available,
  );
  const trend = Array.from({ length: period.days }, (_, i) => {
    const date = new Date(Date.parse(period.startIso) + i * 86400000)
      .toISOString()
      .slice(0, 10);
    const daily = accepted.filter((m) => utcDay(m.created_at) === date);
    return {
      date,
      conversations: new Set(daily.map((m) => m.conversation_id)).size,
      replies: daily.filter(
        (m) => m.direction === "outbound" && m.sender_type === "human",
      ).length,
    };
  });
  const groups = (key: (l: HomeLead) => string) =>
    [
      ...selected
        .reduce((map, l) => {
          const k = key(l);
          const bucket = map.get(k) ?? [];
          bucket.push(leadRecord(l));
          map.set(k, bucket);
          return map;
        }, new Map<string, HomeRecord[]>())
        .entries(),
    ]
      .map(([name, records]) => ({ name, count: records.length, records }))
      .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
  const sources = input.leads.available
    ? groups((l) => l.first_touch_source?.trim() || "Unknown")
    : [];
  const courseMap = new Map(input.courses.rows.map((c) => [c.id, c.name]));
  const courses =
    input.leads.available && input.courses.available
      ? groups((l) =>
          l.interested_course_id
            ? courseMap.get(l.interested_course_id) || "Unavailable course"
            : "Not selected",
        )
      : [];
  const money = new Map<
    string,
    { current: number; previous: number; records: HomeRecord[] }
  >();
  let invalidPayments = false;
  for (const p of input.payments.rows) {
    if (!(current(p.paid_at) || previous(p.paid_at))) continue;
    const signed =
      p.payment_kind === "refund" && ["paid", "refunded"].includes(p.status)
        ? -1
        : p.payment_kind !== "refund" && p.status === "paid"
          ? 1
          : 0;
    if (!signed) continue;
    const amount = Number(p.amount);
    const currency = String(p.currency ?? "")
      .trim()
      .toUpperCase();
    if (
      !Number.isFinite(amount) ||
      amount < 0 ||
      !/^[A-Z]{3}$/.test(currency)
    ) {
      invalidPayments = true;
      continue;
    }
    const bucket = money.get(currency) ?? {
      current: 0,
      previous: 0,
      records: [],
    };
    const cents = Math.round(amount * 100) * signed;
    if (current(p.paid_at)) {
      bucket.current += cents;
      bucket.records.push({
        id: p.id,
        name: `${currency} ${(cents / 100).toLocaleString()}`,
        detail: signed < 0 ? "Refund" : "Paid receipt",
        at: p.paid_at!,
          href: `/leads/${encodeURIComponent(p.lead_id)}`,
      });
    } else bucket.previous += cents;
    money.set(currency, bucket);
  }
  return {
    leads: metric(
      selected.map(leadRecord),
      preceding.length,
      input.leads.available,
    ),
    qualified,
    contacted,
    enrolled,
    cohortEnrolled,
    conversations,
    replies,
    trend,
    sources,
    courses,
    dailyConversations: input.messages.available
      ? accepted.filter((m) => current(m.created_at)).map(messageRecord)
      : [],
    courseAvailable: input.leads.available && input.courses.available,
    revenueAvailable: input.payments.available && !invalidPayments,
    revenue:
      input.payments.available && !invalidPayments
        ? [...money.entries()]
            .map(([currency, b]) => ({
              currency,
              current: b.current / 100,
              previous: b.previous / 100,
              records: b.records,
            }))
            .sort((a, b) => a.currency.localeCompare(b.currency))
        : [],
  };
}

export function selectHomeRecords(
  model: HomeProjection,
  detail: string,
  value = "",
  day = "",
  currency = "",
) {
  let records: HomeRecord[] = [];
  if (
    [
      "leads",
      "qualified",
      "contacted",
      "enrolled",
      "cohortEnrolled",
      "conversations",
      "replies",
    ].includes(detail)
  )
    records = model[detail as "leads"].records;
  if (detail === "source")
    records = model.sources.find((s) => s.name === value)?.records ?? [];
  if (detail === "course")
    records = model.courses.find((s) => s.name === value)?.records ?? [];
  if (detail === "revenue")
    records = model.revenue.find((r) => r.currency === currency)?.records ?? [];
  if (detail === "conversations" && day)
    records = [
      ...new Map(
        model.dailyConversations
          .filter((r) => utcDay(r.at) === day)
          .map((r) => [r.groupId, r]),
      ).values(),
    ];
  return records
    .filter((r) => !day || utcDay(r.at) === day)
    .sort((a, b) => b.at.localeCompare(a.at) || a.id.localeCompare(b.id));
}
