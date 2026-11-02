/** Shared product mark. Tenant names remain separate from product branding. */
export function BrandMark({ className = "", size = "default" }: { className?: string; size?: "default" | "large" }) {
  return <span aria-hidden="true" className={`salsys-brand-mark ${size === "large" ? "salsys-brand-mark-large" : ""} ${className}`}>S</span>;
}

export function BrandIdentity({ version }: { version?: string }) {
  return (
    <span className="salsys-brand-identity">
      <span className="salsys-brand-name">SalsysOS{version ? <span className="salsys-brand-version">{version}</span> : null}</span>
      <span className="salsys-brand-descriptor">Sales + Analysis Operating System</span>
    </span>
  );
}
