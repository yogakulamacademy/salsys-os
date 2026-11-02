/** Original decorative SVGs: shared empty-state language without image requests. */
export function EmptyArtwork({ variant = "list" }: { variant?: "list" | "conversation" | "connection" }) {
  return (
    <svg className="ui-empty-artwork" viewBox="0 0 180 144" fill="none" aria-hidden="true" focusable="false">
      <circle cx="90" cy="76" r="57" fill="currentColor" opacity=".07" />
      {variant === "conversation" ? <>
        <rect x="35" y="28" width="118" height="43" rx="10" fill="var(--app-surface)" stroke="var(--app-border)" />
        <circle cx="54" cy="49" r="9" fill="currentColor" />
        <path d="m50 49 3 3 5-6" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M73 44h58M73 53h43" stroke="var(--app-text-subtle)" strokeWidth="4" strokeLinecap="round" opacity=".55" />
        <rect x="46" y="81" width="107" height="36" rx="9" fill="var(--app-surface)" stroke="var(--app-border)" />
        <path d="M63 94h64M63 103h40" stroke="var(--app-text-subtle)" strokeWidth="4" strokeLinecap="round" opacity=".3" />
        <circle cx="29" cy="109" r="4" fill="currentColor" opacity=".2" />
      </> : variant === "connection" ? <>
        <rect x="31" y="47" width="45" height="45" rx="12" fill="var(--app-surface)" stroke="var(--app-border)" />
        <rect x="105" y="47" width="45" height="45" rx="12" fill="var(--app-surface)" stroke="var(--app-border)" />
        <path d="M76 69h29M54 60v18M45 69h18M119 69h17" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
        <circle cx="90" cy="112" r="4" fill="currentColor" opacity=".2" />
      </> : <>
        <rect x="50" y="24" width="82" height="102" rx="9" fill="var(--app-surface)" stroke="var(--app-border)" />
        <rect x="50" y="24" width="82" height="30" rx="8" fill="currentColor" />
        <path d="M62 36h26M62 44h43" stroke="white" strokeWidth="4" strokeLinecap="round" opacity=".9" />
        <path d="M64 68h42M64 80h32M64 92h45M64 104h24" stroke="currentColor" strokeWidth="5" strokeLinecap="round" opacity=".12" />
        <circle cx="143" cy="108" r="6" fill="currentColor" opacity=".14" />
      </>}
    </svg>
  );
}
