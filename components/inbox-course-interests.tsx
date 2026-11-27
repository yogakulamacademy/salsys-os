"use client";
import { toast } from '@/lib/toast';
import { useFeedbackMessages } from '@/components/use-feedback-messages';

import { Star, X } from "lucide-react";
import { useTransition, useState } from "react";

import { setLeadInterestAction } from "@/app/conversations/interest-actions";

export type InboxInterest = {
  courseId: string;
  courseName: string;
  location: string | null;
  sources: string[];
  isPrimary: boolean;
  estimatedValue: number | null;
  currency: string | null;
};

const SOURCE_LABEL: Record<string, string> = {
  staff: "set by team", crm: "on lead", form: "form", form_page: "form page", fee_question: "asked fee/dates",
  message: "in chat", tracked_link: "opened link", ad: "ad", shared_post: "shared post", page_views: "viewed page",
};

function money(value: number | null, currency: string | null) {
  if (value == null || !currency) return null;
  return new Intl.NumberFormat(currency === "INR" ? "en-IN" : "en-US", { style: "currency", currency, maximumFractionDigits: 0 }).format(value);
}

/** Courses this lead is interested in, the main course and its estimated value (pipeline only, never quoted). */
export function InboxCourseInterests({ leadId, interests, valueNote }: { leadId: string; interests: InboxInterest[]; valueNote: string | null }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  useFeedbackMessages(error);
  const act = (courseId: string, action: "make_main" | "remove") => start(async () => {
    setError(null);
    const r = await setLeadInterestAction(leadId, courseId, action);
    if (!r.ok) setError(r.error); else toast.success(action === 'remove' ? 'Course interest removed.' : 'Main course updated.');
  });
  const primary = interests.find((i) => i.isPrimary);
  return (
    <section className="ibx-course-interests" aria-label="Course interests">
      <div className="flex items-center gap-2">
        <strong className="text-[12px]">Interested in</strong>
        {primary && money(primary.estimatedValue, primary.currency) ? (
          <span className="ml-auto rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-800" title="Estimated from the main course's price. For your pipeline only.">
            Value {money(primary.estimatedValue, primary.currency)}
          </span>
        ) : null}
      </div>
      {interests.length === 0 ? (
        <p className="mt-1 text-[11px] text-copy-muted">No course yet. It's filled in from forms, chats and course links.</p>
      ) : (
        <ul className="mt-2 grid gap-1.5">
          {interests.map((i) => (
            <li key={i.courseId} className={`rounded-lg border px-2 py-1.5 text-[11px] ${i.isPrimary ? "border-brand-200 bg-brand-50" : "border-line bg-white"}`}>
              <div className="flex items-center gap-1.5">
                {i.isPrimary ? <Star size={11} className="text-brand-600" aria-label="Main course" /> : null}
                <span className="min-w-0 flex-1 font-semibold">{i.courseName}{i.location ? ` · ${i.location.replace("-", " ")}` : ""}</span>
                {!i.isPrimary ? (
                  <button type="button" disabled={pending} onClick={() => act(i.courseId, "make_main")} className="text-[10px] font-semibold text-brand-700 hover:underline disabled:opacity-60">Make main</button>
                ) : null}
                <button type="button" disabled={pending} onClick={() => act(i.courseId, "remove")} aria-label={`Remove ${i.courseName}`} className="text-copy-muted hover:text-rose-700 disabled:opacity-60"><X size={12} /></button>
              </div>
              <div className="mt-0.5 text-[10px] text-copy-muted">
                {i.sources.map((s) => SOURCE_LABEL[s] ?? s).join(" · ")}
                {money(i.estimatedValue, i.currency) ? ` · ${money(i.estimatedValue, i.currency)}` : ""}
              </div>
            </li>
          ))}
        </ul>
      )}
      {valueNote ? <p className="mt-1.5 text-[10px] leading-4 text-copy-muted">{valueNote}</p> : null}
      {error ? <p className="mt-1 text-[11px] text-rose-700">{error}</p> : null}
    </section>
  );
}
