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
  /**
   * Also call router.refresh() after success (default false). Actions wrapped
   * by asResult already revalidate, which refreshes the page in the same
   * response; refreshing again doubled every page load (25 Nov 2026 load fix).
   */
  refresh?: boolean;
  onDone?: (result: { ok: boolean; message: string }) => void;
};

export function ToastForm({ action, resetOnSuccess = true, refresh = false, onDone, children, ...rest }: Props) {
  const router = useRouter();
  const ref = useRef<HTMLFormElement>(null);
  return (
    <form
      ref={ref}
      {...rest}
      action={async (formData) => {
        let raw: ToastActionResult;
        try { raw = await action(formData); }
        catch {
          const result = { ok: false, message: 'Unable to complete the request. Your changes have not been confirmed. Please try again.' };
          toast.error('Something went wrong', { description: result.message });
          onDone?.(result);
          return;
        }
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
