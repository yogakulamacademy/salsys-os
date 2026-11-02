import type { DashboardPeriodSelection } from "./dashboard-period-data";
import {
  projectHome,
  type HomeInput,
  type HomeLead,
  type HomeStage,
  type HomeMessage,
} from "./home-command-center";

/** Explicit demo-only evidence. Never selected by live reads. */
export function getHomeDemo(period: DashboardPeriodSelection) {
  const leads: HomeLead[] = [],
    stages: HomeStage[] = [],
    messages: HomeMessage[] = [];
  const at = (offset: number, old = false) =>
    new Date(
      Date.parse(old ? period.previousStartIso : period.startIso) +
        (offset % period.days) * 86400000 +
        3600000,
    ).toISOString();
  for (let i = 0; i < 120; i++) {
    const old = i >= 72;
    const id = `demo-lead-${i}`;
    leads.push({
      id,
      display_name: `Sample enquiry ${i + 1}`,
      lead_code: `DEMO-${i + 1}`,
      created_at: at(i, old),
      first_touch_source: [
        "Instagram",
        "Instagram",
        "Instagram",
        "Direct",
        "Google",
      ][i % 5],
      interested_course_id: `course-${i % 4}`,
    });
    if (i % 8 !== 0)
      stages.push({
        id: `stage-${i}`,
        lead_id: id,
        to_stage:
          i % 5 === 0 ? "enrolled" : i % 3 === 0 ? "qualified" : "contacted",
        changed_at: at(i, old),
      });
    for (let j = 0; j < (i % 6) + 1; j++)
      messages.push({
        id: `message-${i}-${j}`,
        conversation_id: `conversation-${i}`,
        lead_id: id,
        created_at: at(i + j, old),
        direction: j % 2 ? "outbound" : "inbound",
        sender_type: j % 2 ? "human" : "lead",
        status: j % 2 ? "sent" : "received",
      });
  }
  const available = <T>(rows: T[]) => ({ rows, available: true });
  const input: HomeInput = {
    leads: available(leads),
    stages: available(stages),
    messages: available(messages),
    courses: available(
      [
        "200H Yoga Training",
        "300H Advanced Training",
        "Prenatal Training",
        "Sound Healing",
      ].map((name, i) => ({ id: `course-${i}`, name })),
    ),
    payments: available([
      {
        id: "demo-receipt",
        lead_id: "demo-lead-0",
        amount: 100000,
        currency: "INR",
        payment_kind: "deposit",
        status: "paid",
        paid_at: at(0),
      },
      {
        id: "demo-refund",
        lead_id: "demo-lead-0",
        amount: 20000,
        currency: "INR",
        payment_kind: "refund",
        status: "refunded",
        paid_at: at(0),
      },
    ]),
  };
  return projectHome(input, period);
}
