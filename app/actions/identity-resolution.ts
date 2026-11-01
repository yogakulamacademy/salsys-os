"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";

export async function dismissIdentityResolutionConflictAction(formData: FormData) {
  const conflictId = String(formData.get("conflict_id") ?? "").trim();

  if (!conflictId) {
    redirect(
      "/data-quality?error=" +
        encodeURIComponent("Identity conflict ID is required."),
    );
  }

  const supabase = await createClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    redirect(
      "/data-quality?error=" +
        encodeURIComponent("Your session has expired. Please sign in again."),
    );
  }

  const { error } = await (supabase as any).rpc(
    "dismiss_identity_resolution_conflict_v1",
    {
      p_conflict_id: conflictId,
    },
  );

  if (error) {
    redirect(
      "/data-quality?error=" +
        encodeURIComponent(error.message),
    );
  }

  revalidatePath("/data-quality");
  revalidatePath("/customer-360");
  revalidatePath("/system-health");

  redirect("/data-quality?notice=identity-conflict-dismissed");
}
