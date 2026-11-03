import Link from "next/link";
import { ArrowRight } from "lucide-react";

type HomeEmptyVariant = "activity" | "sources" | "batches" | "revenue" | "queue" | "status";

type HomeEmptyStateProps = {
  variant: HomeEmptyVariant;
  title: string;
  description: string;
  compact?: boolean;
  unavailable?: boolean;
  action?: { href: string; label: string };
};

/**
 * Subtle, decorative illustration for truly empty or explicitly unavailable
 * Home panels. Never renders fictional figures, trends, status, or transactions.
 */
function EmptyIllustration({ variant }: { variant: HomeEmptyVariant }) {
  const common = "stroke-current";
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      viewBox="0 0 176 108"
      className="h-[96px] w-[156px] max-w-full text-brand-600 dark:text-brand-300"
      fill="none"
    >
      <rect x="14" y="9" width="148" height="89" rx="18" fill="currentColor" fillOpacity="0.04" />
      <circle cx="151" cy="23" r="11" fill="currentColor" fillOpacity="0.07" />
      <circle cx="26" cy="88" r="8" fill="currentColor" fillOpacity="0.06" />

      {variant === "activity" ? (
        <g className={common} strokeLinecap="round" strokeLinejoin="round">
          <rect x="36" y="26" width="104" height="61" rx="10" strokeOpacity="0.23" strokeWidth="1.5" />
          <path d="M48 73H129M49 40V73" strokeOpacity="0.22" strokeWidth="1.5" />
          <path d="M53 62L70 57L86 61L102 48L122 50" strokeWidth="2.5" strokeOpacity="0.55" strokeDasharray="5 6" />
          <circle cx="102" cy="48" r="4" fill="currentColor" fillOpacity="0.17" strokeWidth="1.5" />
          <path d="M112 36H127" strokeOpacity="0.2" strokeWidth="2" />
        </g>
      ) : null}

      {variant === "sources" ? (
        <g className={common} strokeLinecap="round" strokeLinejoin="round">
          <rect x="39" y="26" width="98" height="62" rx="10" strokeOpacity="0.23" strokeWidth="1.5" />
          {[0, 1, 2].map((index) => (
            <g key={index}>
              <circle cx="54" cy={42 + index * 16} r="3" fill="currentColor" fillOpacity="0.15" strokeOpacity="0.5" strokeWidth="1.2" />
              <path d={"M65 " + (42 + index * 16) + "H" + (index === 0 ? 115 : index === 1 ? 100 : 89)} strokeWidth="5" strokeOpacity={0.35 - index * 0.06} />
            </g>
          ))}
        </g>
      ) : null}

      {variant === "batches" ? (
        <g className={common} strokeLinecap="round" strokeLinejoin="round">
          <rect x="44" y="25" width="91" height="66" rx="11" strokeOpacity="0.28" strokeWidth="1.6" />
          <path d="M44 44H135" strokeOpacity="0.3" strokeWidth="1.6" />
          <path d="M67 19V33M111 19V33" strokeOpacity="0.55" strokeWidth="3" />
          {[0, 1, 2].map((index) => (
            <g key={index}>
              <rect x={57 + index * 23} y="55" width="13" height="9" rx="2.5" fill="currentColor" fillOpacity="0.11" />
              <rect x={57 + index * 23} y="70" width="13" height="9" rx="2.5" fill="currentColor" fillOpacity="0.07" />
            </g>
          ))}
        </g>
      ) : null}

      {variant === "revenue" ? (
        <g className={common} strokeLinecap="round" strokeLinejoin="round">
          <path d="M55 23H117L128 35V88H55Z" strokeWidth="1.6" strokeOpacity="0.27" />
          <path d="M117 23V35H128" strokeWidth="1.6" strokeOpacity="0.27" />
          <circle cx="87" cy="50" r="11" fill="currentColor" fillOpacity="0.08" strokeOpacity="0.35" strokeWidth="1.7" />
          <path d="M82 50H92M87 45V55" strokeWidth="1.5" strokeOpacity="0.55" />
          <path d="M70 72H112M70 79H98" strokeOpacity="0.23" strokeWidth="2" />
        </g>
      ) : null}

      {variant === "queue" ? (
        <g className={common} strokeLinecap="round" strokeLinejoin="round">
          <path d="M41 37Q41 27 52 27H119Q130 27 130 38V68Q130 79 119 79H74L57 89V79H52Q41 79 41 68Z" strokeOpacity="0.27" strokeWidth="1.6" />
          <circle cx="67" cy="52" r="3.2" fill="currentColor" fillOpacity="0.25" />
          <circle cx="87" cy="52" r="3.2" fill="currentColor" fillOpacity="0.25" />
          <circle cx="107" cy="52" r="3.2" fill="currentColor" fillOpacity="0.25" />
          <path d="M65 65H106" strokeOpacity="0.18" strokeWidth="2" />
        </g>
      ) : null}

      {variant === "status" ? (
        <g className={common} strokeLinecap="round" strokeLinejoin="round">
          <rect x="47" y="28" width="83" height="58" rx="11" strokeOpacity="0.26" strokeWidth="1.5" />
          <path d="M65 46H112M65 58H98M65 70H105" strokeOpacity="0.23" strokeWidth="2" />
          <circle cx="121" cy="32" r="10" fill="currentColor" fillOpacity="0.10" strokeOpacity="0.3" strokeWidth="1.5" />
          <path d="M117 32H125" strokeOpacity="0.55" strokeWidth="2" />
        </g>
      ) : null}
    </svg>
  );
}

export function HomeEmptyState({
  variant,
  title,
  description,
  compact = false,
  unavailable = false,
  action,
}: HomeEmptyStateProps) {
  return (
    <div
      data-testid="home-empty-state"
      data-empty-variant={variant}
      data-evidence-state={unavailable ? "unavailable" : "empty"}
      className={
        "flex min-w-0 flex-col items-center justify-center rounded-xl bg-surface-muted/55 px-4 text-center " +
        (compact ? "min-h-[174px] py-3.5" : "min-h-[225px] py-5")
      }
    >
      <EmptyIllustration variant={variant} />
      <p className="mt-1 text-[13px] font-semibold text-copy-strong">{title}</p>
      <p className="mt-1.5 max-w-[330px] text-[11px] leading-[18px] text-copy-muted">
        {description}
      </p>
      {action ? (
        <Link
          href={action.href}
          className="mt-3 inline-flex min-h-9 items-center gap-1 rounded-ui px-2 text-xs font-semibold text-brand-700 hover:text-brand-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-700 dark:text-brand-300"
        >
          {action.label} <ArrowRight size={13} aria-hidden="true" />
        </Link>
      ) : null}
    </div>
  );
}
