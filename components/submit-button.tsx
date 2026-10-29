"use client";

import type { ButtonHTMLAttributes, ReactNode } from "react";
import { useFormStatus } from "react-dom";
import { Loader2 } from "lucide-react";

export function SubmitButton({
  children,
  pendingLabel = "Saving...",
  pendingIcon,
  disabled,
  className = "btn-primary",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  children: ReactNode;
  pendingLabel?: string;
  pendingIcon?: ReactNode;
}) {
  const { pending } = useFormStatus();
  const isDisabled = disabled || pending;

  return (
    <button
      {...props}
      type={props.type ?? "submit"}
      disabled={isDisabled}
      aria-disabled={isDisabled}
      aria-busy={pending}
      className={`${className} disabled:cursor-not-allowed disabled:opacity-60 disabled:transform-none`}
    >
      {pending ? (
        <>
          {pendingIcon ?? <Loader2 size={15} className="animate-spin" aria-hidden="true" />}
          <span>{pendingLabel}</span>
        </>
      ) : (
        children
      )}
    </button>
  );
}
