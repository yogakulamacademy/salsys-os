import type { ReactNode } from "react";
import { redirect } from "next/navigation";

import { isMockMode } from "@/lib/data";
import { createClient } from "@/lib/supabase/server";

export default async function DashboardLayout({
  children,
}: {
  children: ReactNode;
}) {
  if (isMockMode()) {
    redirect("/home");
  }

  const supabase = await createClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    redirect("/login");
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role,active")
    .eq("id", user.id)
    .maybeSingle();

  if (!profile || profile.active !== true) {
    redirect("/login");
  }

  if (
    profile.role === "owner" ||
    profile.role === "admin" ||
    profile.role === "manager"
  ) {
    redirect("/home");
  }

  return <>{children}</>;
}
