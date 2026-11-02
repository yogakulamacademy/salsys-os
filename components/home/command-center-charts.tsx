"use client";

import { useId, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { CalendarDays, RefreshCw, X } from "lucide-react";
import { useModalFocus } from "@/components/use-modal-focus";
import type { HomeRecord } from "@/lib/home-command-center";

export function HomeRefresh() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return (
    <button
      type="button"
      className="home-secondary"
      aria-label="Refresh Home evidence"
      disabled={pending}
      onClick={() => startTransition(() => router.refresh())}
    >
      <RefreshCw size={15} className={pending ? "animate-spin" : ""} />
      <span>{pending ? "Refreshing…" : "Refresh"}</span>
    </button>
  );
}

export function HomeTrend({
  points,
  href,
}: {
  points: { date: string; conversations: number; replies: number }[];
  href: string;
}) {
  const router = useRouter();
  const id = useId().replace(/:/g, "");
  const [series, setSeries] = useState({ conversations: true, replies: true });
  return (
    <>
      <div className="home-chart-legend">
        {(["conversations", "replies"] as const).map((key) => (
          <button
            key={key}
            type="button"
            aria-pressed={series[key]}
            onClick={() => setSeries((s) => ({ ...s, [key]: !s[key] }))}
          >
            <i className={key} style={{ opacity: series[key] ? 1 : 0.25 }} />
            {key === "conversations" ? "Conversations" : "Human replies"}
          </button>
        ))}
      </div>
      <div
        className="home-trend"
        role="group"
        aria-label="Daily conversation activity"
      >
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart
            data={points}
            margin={{ top: 12, right: 10, left: -22, bottom: 0 }}
            onClick={(state) => {
              if (state?.activeTooltipIndex == null) return;
              const index = Number(state?.activeTooltipIndex);
              const point = points[index];
              if (point) router.push(`${href}&day=${point.date}`);
            }}
          >
            <defs>
              <linearGradient id={`${id}-fill`} x1="0" x2="0" y1="0" y2="1">
                <stop offset="0%" stopColor="#7344ff" stopOpacity={0.28} />
                <stop offset="100%" stopColor="#7344ff" stopOpacity={0.02} />
              </linearGradient>
            </defs>
            <CartesianGrid vertical={false} stroke="var(--home-line)" />
            <XAxis
              dataKey="date"
              tickLine={false}
              axisLine={false}
              minTickGap={26}
              tick={{ fill: "var(--home-muted)", fontSize: 10 }}
              tickFormatter={(date) =>
                new Date(`${date}T00:00:00Z`).toLocaleDateString("en-GB", {
                  day: "numeric",
                  month: "short",
                  timeZone: "UTC",
                })
              }
            />
            <YAxis
              allowDecimals={false}
              tickLine={false}
              axisLine={false}
              tick={{ fill: "var(--home-muted)", fontSize: 10 }}
            />
            <Tooltip
              contentStyle={{
                background: "var(--home-surface)",
                border: "1px solid var(--home-line)",
                borderRadius: 10,
                color: "var(--home-ink)",
                fontSize: 12,
              }}
              labelFormatter={(label) => String(label)}
            />
            <Area
              type="monotone"
              dataKey="conversations"
              name="Conversations"
              hide={!series.conversations}
              stroke="#6d35ff"
              strokeWidth={2.5}
              fill={`url(#${id}-fill)`}
              isAnimationActive={false}
            />
            <Area
              type="monotone"
              dataKey="replies"
              name="Human replies"
              hide={!series.replies}
              stroke="#bba1ff"
              strokeWidth={2}
              fill="transparent"
              isAnimationActive={false}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
      <details className="home-chart-table">
        <summary>View daily data</summary>
        <div>
          <table>
            <caption>
              Daily activity · UTC. A conversation can be active on multiple
              days.
            </caption>
            <thead>
              <tr>
                <th>Date</th>
                <th>Conversations</th>
                <th>Human replies</th>
              </tr>
            </thead>
            <tbody>
              {points.map((p) => (
                <tr key={p.date}>
                  <th>{p.date}</th>
                  <td>
                    <Link href={`${href}&day=${p.date}`}>
                      {p.conversations}
                    </Link>
                  </td>
                  <td>
                    <Link
                      href={`${href.replace("detail=conversations", "detail=replies")}&day=${p.date}`}
                    >
                      {p.replies}
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </>
  );
}

export function HomeDatePicker({
  start,
  end,
  label,
}: {
  start: string;
  end: string;
  label: string;
}) {
  return (
    <details className="home-date-picker">
      <summary>
        <CalendarDays size={16} />
        {label}
      </summary>
      <div className="home-date-popover">
        <strong>Reporting period</strong>
        <div className="home-date-presets">
          {[
            ["today", "Today"],
            ["yesterday", "Yesterday"],
            ["7d", "Last 7 days"],
            ["30d", "Last 30 days"],
            ["month", "This month"],
            ["lastmonth", "Last month"],
          ].map(([p, l]) => (
            <Link href={`/home?period=${p}`} key={p}>
              {l}
            </Link>
          ))}
        </div>
        <form action="/home">
          <input type="hidden" name="period" value="custom" />
          <label>
            Start date
            <input
              type="date"
              name="from"
              defaultValue={start}
              max={new Date().toISOString().slice(0, 10)}
              required
            />
          </label>
          <label>
            End date
            <input
              type="date"
              name="to"
              defaultValue={end}
              max={new Date().toISOString().slice(0, 10)}
              required
            />
          </label>
          <button className="home-primary" type="submit">
            Apply range
          </button>
          <small>UTC · up to 366 days</small>
        </form>
      </div>
    </details>
  );
}

export function HomeRecordDialog({
  title,
  records,
  total,
  page,
  baseHref,
  closeHref,
  period,
  description,
}: {
  title: string;
  records: HomeRecord[];
  total: number;
  page: number;
  baseHref: string;
  closeHref: string;
  period: string;
  description: string;
}) {
  const router = useRouter();
  const ref = useRef<HTMLDivElement>(null);
  useModalFocus(true, ref, () => router.push(closeHref, { scroll: false }));
  return (
    <div className="home-dialog-layer">
      <div
        data-modal-backdrop
        className="home-dialog-backdrop"
        onClick={() => router.push(closeHref, { scroll: false })}
      />
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-labelledby="home-record-title"
        tabIndex={-1}
        className="home-record-dialog"
      >
        <header>
          <div>
            <h2 id="home-record-title">{title}</h2>
            <p>
              {period} · {total.toLocaleString()} records
            </p>
          </div>
          <button
            type="button"
            aria-label="Close records"
            onClick={() => router.push(closeHref, { scroll: false })}
          >
            <X size={20} />
          </button>
        </header>
        <p className="home-record-description">{description}</p>
        <div className="home-record-scroll">
          <table>
            <thead>
              <tr>
                <th>Record</th>
                <th>Evidence</th>
                <th>Date · UTC</th>
              </tr>
            </thead>
            <tbody>
              {records.map((r) => (
                <tr key={r.id}>
                  <td>
                    <Link href={r.href}>{r.name}</Link>
                  </td>
                  <td>{r.detail}</td>
                  <td>
                    {new Date(r.at).toLocaleDateString("en-GB", {
                      timeZone: "UTC",
                    })}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!records.length && (
            <p className="home-record-description">
              No matching records. Unavailable evidence is never replaced with
              all-time totals.
            </p>
          )}
        </div>
        <footer>
          <span>
            Page {page} of {Math.max(1, Math.ceil(total / 50))}
          </span>
          {page > 1 && (
            <Link href={`${baseHref}&recordPage=${page - 1}`} scroll={false}>
              Previous
            </Link>
          )}
          {page * 50 < total && (
            <Link href={`${baseHref}&recordPage=${page + 1}`} scroll={false}>
              Next
            </Link>
          )}
        </footer>
      </div>
    </div>
  );
}
