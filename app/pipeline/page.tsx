import { redirect } from "next/navigation";

import { PipelineWorkspace } from "@/components/crm/pipeline-workspace";
import { useMockData } from "@/lib/config";
import { getPipelineSnapshot } from "@/lib/pipeline-data";
import { createClient } from "@/lib/supabase/server";

export default async function PipelinePage() {
  if (useMockData) {
    redirect("/admissions?view=pipeline");
  }

  const supabase = await createClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    redirect("/login?next=%2Fpipeline");
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role,active")
    .eq("id", user.id)
    .maybeSingle();

  if (!profile || profile.active !== true) {
    redirect("/login?next=%2Fpipeline");
  }

  if (profile.role !== "admissions") {
    redirect("/admissions?view=pipeline");
  }

  const snapshot = await getPipelineSnapshot();
  return <PipelineWorkspace snapshot={snapshot} />;
}
