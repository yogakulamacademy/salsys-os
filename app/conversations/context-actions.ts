"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

function textValue(formData: FormData, key: string) {
  const value = String(formData.get(key) ?? "").trim();
  return value || null;
}

function conversationUrl(leadId: string, params: Record<string, string>) {
  const search = new URLSearchParams({ lead: leadId, ...params });
  return `/conversations?${search.toString()}`;
}

export async function updateConversationLeadContextWithActivityAction(
  leadId: string,
  formData: FormData,
) {
  const courseId = textValue(formData, "course_id");
  const country = textValue(formData, "country");
  const supabase = await createClient();

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    redirect("/login");
  }

  const { data: canWorkLead, error: accessError } = await supabase.rpc(
    "can_work_lead",
    { p_lead_id: leadId },
  );

  if (accessError) {
    redirect(
      conversationUrl(leadId, {
        error: `Unable to verify lead access: ${accessError.message}`,
      }),
    );
  }

  if (canWorkLead !== true) {
    redirect(
      conversationUrl(leadId, {
        error: "You do not have access to this lead.",
      }),
    );
  }

  // Read only the fields needed to build a truthful before/after activity.
  // The admin client is created only after the signed-in actor passes
  // can_work_lead() for this exact lead.
  const admin = createAdminClient();
  const { data: before, error: beforeError } = await admin
    .from("leads")
    .select("organization_id,country,interested_course_id")
    .eq("id", leadId)
    .maybeSingle();

  if (beforeError || !before?.organization_id) {
    redirect(
      conversationUrl(leadId, {
        error: "Unable to load the current lead details before saving.",
      }),
    );
  }

  if (courseId) {
    const { data: course, error: courseError } = await admin
      .from("courses")
      .select("id")
      .eq("id", courseId)
      .eq("organization_id", before.organization_id)
      .maybeSingle();

    if (courseError || !course) {
      redirect(
        conversationUrl(leadId, {
          error: "The selected course is not available in this workspace.",
        }),
      );
    }
  }

  const { error: updateError } = await supabase.rpc("update_crm_lead_fields", {
    p_lead_id: leadId,
    p_patch: {
      interested_course_id: courseId,
      country,
    },
  });

  if (updateError) {
    redirect(
      conversationUrl(leadId, {
        error: `Unable to update lead details: ${updateError.message}`,
      }),
    );
  }

  const { data: after, error: afterError } = await admin
    .from("leads")
    .select("organization_id,country,interested_course_id")
    .eq("id", leadId)
    .maybeSingle();

  if (afterError || !after) {
    redirect(
      conversationUrl(leadId, {
        error:
          "Lead details were updated, but the saved values could not be read back for Activity. Refresh before editing again.",
      }),
    );
  }

  const changedCountry = (before.country || null) !== (after.country || null);
  const changedCourse =
    (before.interested_course_id || null) !== (after.interested_course_id || null);

  if (changedCountry || changedCourse) {
    const courseIds = [before.interested_course_id, after.interested_course_id]
      .filter((value): value is string => Boolean(value));

    const courseNames = new Map<string, string>();
    if (courseIds.length) {
      const { data: courseRows } = await admin
        .from("courses")
        .select("id,name")
        .eq("organization_id", before.organization_id)
        .in("id", [...new Set(courseIds)]);

      for (const row of courseRows ?? []) {
        courseNames.set(row.id, row.name);
      }
    }

    const details: string[] = [];
    if (changedCountry) {
      details.push(
        `Country: ${before.country || "Not recorded"} → ${after.country || "Not recorded"}`,
      );
    }
    if (changedCourse) {
      details.push(
        `Course: ${
          before.interested_course_id
            ? courseNames.get(before.interested_course_id) || "Previous course"
            : "Not selected"
        } → ${
          after.interested_course_id
            ? courseNames.get(after.interested_course_id) || "Selected course"
            : "Not selected"
        }`,
      );
    }

    const { error: activityError } = await admin.from("activities").insert({
      lead_id: leadId,
      activity_type: "lead_context_updated",
      actor_type: "human",
      actor_id: user.id,
      title: "Lead details updated",
      details: details.join(" · "),
      metadata: {
        source: "conversations",
        changes: {
          ...(changedCountry
            ? {
                country: {
                  before: before.country || null,
                  after: after.country || null,
                },
              }
            : {}),
          ...(changedCourse
            ? {
                interested_course_id: {
                  before: before.interested_course_id || null,
                  after: after.interested_course_id || null,
                },
              }
            : {}),
        },
      },
    });

    if (activityError) {
      console.error("Conversation lead edit activity insert failed", activityError);
      redirect(
        conversationUrl(leadId, {
          error:
            "Lead details were updated, but the Activity entry could not be recorded. The saved lead values are unchanged; refresh before editing again.",
        }),
      );
    }
  }

  revalidatePath("/conversations");
  revalidatePath(`/leads/${leadId}`);
  revalidatePath("/leads");
  revalidatePath("/dashboard");
  revalidatePath("/pipeline");
  revalidatePath("/funnel");
  revalidatePath("/revenue");

  redirect(
    conversationUrl(leadId, {
      notice: "lead-context-updated",
    }),
  );
}
