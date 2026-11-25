"use client";

import { useRouter } from "next/navigation";
import { useRef, type FormHTMLAttributes } from "react";

import { toast } from "@/lib/toast";

// A <form> that never reloads the page (owner request, 25 Nov 2026): it runs a
// server action that returns { ok, message }, shows a toast, and refreshes the
// page data in place (scroll position and open panels stay as they are).
// Use with actions wrapped by asResult (lib/action-result.ts).

export type ToastActionResult = { ok: boolean; message: string } | void | null | undefined;

type Props = Omit<FormHTMLAttributes<HTMLFormElement>, "action"> & {
  action: (formData: FormData) => Promise<ToastActionResult>;
  /** Clear the fields after a successful submit (default true). */
  resetOnSuccess?: boolean;
  /** Re-read the page's data after success (default true). */
  refresh?: boolean;
  onDone?: (result: { ok: boolean; message: string }) => void;
};

export function ToastForm({ action, resetOnSuccess = true, refresh = true, onDone, children, ...rest }: Props) {
  const router = useRouter();
  const ref = useRef<HTMLFormElement>(null);
  return (
    <form
      ref={ref}
      {...rest}
      action={async (formData) => {
        const raw = await action(formData);
        const result = raw && typeof raw === "object" ? raw : { ok: true, message: "Saved." };
        if (result.ok) {
          toast.success(result.message || "Saved.");
          if (resetOnSuccess) ref.current?.reset();
          if (refresh) router.refresh();
        } else {
          toast.error("Something went wrong", { description: result.message });
        }
        onDone?.(result);
      }}
    >
      {children}
    </form>
  );
}
