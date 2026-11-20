import type { InterestProfile } from "@/lib/interest-profile";

const BAND: Record<InterestProfile["interestBand"], { label: string; ring: string; chip: string }> = {
  hot: { label: "Hot", ring: "#dc2626", chip: "bg-red-50 text-red-700 border-red-200" },
  warm: { label: "Warm", ring: "#ea580c", chip: "bg-orange-50 text-orange-700 border-orange-200" },
  cool: { label: "Cool", ring: "#2563eb", chip: "bg-blue-50 text-blue-700 border-blue-200" },
  cold: { label: "Cold", ring: "#94a3b8", chip: "bg-slate-50 text-slate-600 border-slate-200" },
};

const CTA_LABELS: Record<string, string> = {
  enrol: "Enrol", pay: "Pay", whatsapp: "WhatsApp", call: "Call", email: "Email",
  fees: "Fees", dates: "Dates", contact: "Contact", other: "Other",
};

function ago(iso: string | null): string {
  if (!iso) return "—";
  const days = Math.floor((Date.now() - Date.parse(iso)) / 86_400_000);
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 30) return `${days} days ago`;
  return `${Math.round(days / 30)} months ago`;
}

function Ring({ score, color }: { score: number; color: string }) {
  const r = 26, c = 2 * Math.PI * r;
  return (
    <svg width="64" height="64" viewBox="0 0 64 64" aria-label={`Interest score ${score} out of 100`}>
      <circle cx="32" cy="32" r={r} fill="none" stroke="#eef0f3" strokeWidth="6" />
      <circle cx="32" cy="32" r={r} fill="none" stroke={color} strokeWidth="6" strokeLinecap="round"
        strokeDasharray={`${(score / 100) * c} ${c}`} transform="rotate(-90 32 32)" />
      <text x="32" y="37" textAnchor="middle" fontSize="16" fontWeight="700" fill="#0f172a">{score}</text>
    </svg>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-ui border border-line bg-surface-soft px-3 py-2">
      <div className="text-[10px] font-semibold uppercase tracking-wide text-copy-subtle">{label}</div>
      <div className="mt-0.5 text-sm font-semibold text-copy-strong">{value}</div>
    </div>
  );
}

/** Interest profile. Shows only the parts that have data, so it grows as tracking grows. */
export function InterestProfileCard({ profile }: { profile: InterestProfile | null }) {
  if (!profile) return null;
  const band = BAND[profile.interestBand];
  const ctas = Object.entries(profile.ctaClicks).sort((a, b) => b[1] - a[1]);
  const media = [
    profile.videoPlays ? `${profile.videoPlays} video play${profile.videoPlays > 1 ? "s" : ""}` : null,
    profile.videoCompletes ? `${profile.videoCompletes} watched to the end` : null,
    profile.galleryOpens ? `${profile.galleryOpens} photo views` : null,
    profile.brochure ? `${profile.brochure} brochure` : null,
    profile.faq ? `${profile.faq} FAQ opened` : null,
  ].filter(Boolean) as string[];
  const other = Object.entries(profile.otherActivity);
  const stats: [string, string][] = [];
  if (profile.visits) stats.push(["Visits", String(profile.visits)]);
  if (profile.pagesViewed) stats.push(["Pages", String(profile.pagesViewed)]);
  if (profile.readingMinutes) stats.push(["Reading", `${profile.readingMinutes} min`]);
  if (profile.maxScrollPercent) stats.push(["Deepest scroll", `${profile.maxScrollPercent}%`]);
  if (profile.priceViews) stats.push(["Price views", String(profile.priceViews)]);
  if (profile.lastSeenAt) stats.push(["Last seen", ago(profile.lastSeenAt)]);

  return (
    <section className="overflow-hidden rounded-panel border border-line bg-surface shadow-xs" data-testid="interest-profile">
      <div className="flex items-center justify-between gap-4 border-b border-line px-5 py-4">
        <div>
          <div className="eyebrow">Interest profile</div>
          <h2 className="section-title mt-1">What they care about</h2>
        </div>
        <div className="flex items-center gap-3">
          <span className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold ${band.chip}`}>{band.label}</span>
          <Ring score={profile.interestScore} color={band.ring} />
        </div>
      </div>

      <div className="space-y-4 px-5 py-4">
        {profile.reasons.length ? (
          <div>
            <div className="text-[11px] font-semibold text-copy-muted">Why this score</div>
            <ul className="mt-2 space-y-1.5">
              {profile.reasons.map((r) => (
                <li key={r.text} className="flex items-center justify-between gap-3 text-[13px]">
                  <span className="text-copy-strong">{r.text}</span>
                  <span className={`text-[11px] font-semibold ${r.points < 0 ? "text-red-600" : "text-emerald-700"}`}>
                    {r.points > 0 ? `+${r.points}` : r.points}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {stats.length ? (
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {stats.map(([l, v]) => <Stat key={l} label={l} value={v} />)}
          </div>
        ) : null}

        {profile.courses.length ? (
          <div>
            <div className="text-[11px] font-semibold text-copy-muted">Courses they looked at</div>
            <ul className="mt-2 space-y-1.5">
              {profile.courses.map((c) => (
                <li key={c.courseId ?? c.name} className="flex items-center justify-between gap-3 text-[13px]">
                  <span className="truncate capitalize text-copy-strong">{c.name}</span>
                  <span className="shrink-0 text-[11px] text-copy-subtle">
                    {c.views ? `${c.views} view${c.views > 1 ? "s" : ""}` : ""}{c.priceSeen ? " · saw price" : ""}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {profile.topics.length ? (
          <div>
            <div className="text-[11px] font-semibold text-copy-muted">What they asked about</div>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {profile.topics.map((t) => (
                <span key={t.key} className="rounded-full border border-line bg-surface-soft px-2.5 py-1 text-[11px] font-semibold text-copy-muted">
                  {t.label}{t.count > 1 ? ` ×${t.count}` : ""}
                </span>
              ))}
            </div>
          </div>
        ) : null}

        {ctas.length || media.length ? (
          <div className="grid gap-3 sm:grid-cols-2">
            {ctas.length ? (
              <div>
                <div className="text-[11px] font-semibold text-copy-muted">Buttons clicked</div>
                <div className="mt-1 text-[13px] text-copy-strong">{ctas.map(([k, n]) => `${CTA_LABELS[k] ?? k} ×${n}`).join(" · ")}</div>
              </div>
            ) : null}
            {media.length ? (
              <div>
                <div className="text-[11px] font-semibold text-copy-muted">Video, photos & brochure</div>
                <div className="mt-1 text-[13px] text-copy-strong">{media.join(" · ")}</div>
              </div>
            ) : null}
          </div>
        ) : null}

        {other.length ? (
          <div className="text-[11px] text-copy-subtle">
            Other activity: {other.map(([k, n]) => `${k.replace(/^web\./, "").replace(/_/g, " ")} ×${n}`).join(" · ")}
          </div>
        ) : null}

        {!profile.hasWebsiteData ? (
          <div className="rounded-ui border border-dashed border-line px-3 py-2.5 text-[12px] text-copy-muted">
            No website visits linked yet. Send them a course link from the Inbox: when they open it, their visits show up here.
          </div>
        ) : null}
      </div>
    </section>
  );
}
