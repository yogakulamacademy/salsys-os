"use server";

import { revalidatePath } from "next/cache";

import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";

import { useMockData } from "@/lib/config";

import type { Channel, IntentLevel, LeadStage } from "@/types/crm";

const allowedStages: LeadStage[] = [
  "new",

  "contacted",

  "engaged",

  "qualified",

  "high_intent",

  "payment_pending",

  "enrolled",

  "nurture",

  "not_now",

  "lost",

  "unqualified",

  "duplicate",
];

const allowedIntents: IntentLevel[] = [
  "unknown",

  "low",

  "medium",

  "high",

  "very_high",
];

const allowedChannels: Channel[] = [
  "website",

  "instagram",

  "whatsapp",

  "email",

  "phone",

  "meta_lead_form",

  "other",
];

const allowedContactMethods = [
  "whatsapp",

  "sms",

  "phone",

  "email",

  "instagram",

  "other",
] as const;

const allowedContactDirections = ["outbound", "inbound"] as const;

const allowedContactOutcomes = [
  "attempted",

  "sent",

  "connected",

  "replied",

  "no_answer",

  "left_message",

  "follow_up_needed",

  "other",
] as const;

const allowedPaymentKinds = [
  "deposit",

  "balance",

  "full",

  "refund",

  "other",
] as const;

type PaymentKind = (typeof allowedPaymentKinds)[number];

function textValue(
  formData: FormData,

  key: string,
) {
  const value = String(formData.get(key) ?? "").trim();

  return value || null;
}

function monthDate(value: string | null) {
  if (!value) {
    return null;
  }

  return /^\d{4}-\d{2}$/.test(value) ? `${value}-01` : value;
}

function safeChannel(value: string | null): Channel {
  return allowedChannels.includes(value as Channel)
    ? (value as Channel)
    : "other";
}

function numberValue(
  formData: FormData,

  key: string,
) {
  const raw = textValue(
    formData,

    key,
  );

  if (raw === null) {
    return null;
  }

  const value = Number(raw);

  return Number.isFinite(value) ? value : null;
}

function currencyValue(formData: FormData) {
  const value = (
    textValue(
      formData,

      "potential_currency",
    ) ?? ""
  ).toUpperCase();

  return ["USD", "INR"].includes(value) ? value : null;
}

function istDateTimeToIso(value: string | null) {
  if (!value) {
    return new Date().toISOString();
  }

  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) {
    return null;
  }

  const parsed = new Date(`${value}:00+05:30`);

  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

export async function createLeadAction(formData: FormData) {
  if (useMockData) {
    redirect("/leads?notice=mock-create");
  }

  const firstName = textValue(
    formData,

    "first_name",
  );

  if (!firstName) {
    redirect("/leads/new?error=First%20name%20is%20required");
  }

  const potentialMode =
    textValue(
      formData,

      "potential_value_mode",
    ) === "manual"
      ? "manual"
      : "batch_default";

  const manualPotentialValue = numberValue(
    formData,

    "potential_value",
  );

  const manualCurrency = currencyValue(formData);

  if (
    potentialMode === "manual" &&
    (manualPotentialValue === null || manualPotentialValue < 0)
  ) {
    redirect(
      "/leads/new?error=" +
        encodeURIComponent("Enter a valid potential value."),
    );
  }

  if (potentialMode === "manual" && !manualCurrency) {
    redirect(
      "/leads/new?error=" +
        encodeURIComponent("Select INR or USD for the potential value."),
    );
  }

  const supabase = await createClient();

  const {
    data,

    error,
  } = await supabase.rpc(
    "create_crm_lead",

    {
      p_first_name: firstName,

      p_last_name: textValue(
        formData,

        "last_name",
      ),

      p_email: textValue(
        formData,

        "email",
      ),

      p_phone: textValue(
        formData,

        "phone",
      ),

      p_course_id: textValue(
        formData,

        "course_id",
      ),

      p_preferred_batch_id: textValue(
        formData,

        "preferred_batch_id",
      ),

      p_preferred_location: textValue(
        formData,

        "preferred_location",
      ),

      p_preferred_month: monthDate(
        textValue(
          formData,

          "preferred_month",
        ),
      ),

      p_preferred_mode: textValue(
        formData,

        "preferred_mode",
      ),

      p_country: textValue(
        formData,

        "country",
      ),

      p_timezone: textValue(
        formData,

        "timezone",
      ),

      p_lead_creation_channel: safeChannel(
        textValue(
          formData,

          "lead_creation_channel",
        ),
      ),

      p_current_contact_channel: safeChannel(
        textValue(
          formData,

          "current_contact_channel",
        ),
      ),

      p_first_touch_source: textValue(
        formData,

        "first_touch_source",
      ),

      p_first_touch_medium: textValue(
        formData,

        "first_touch_medium",
      ),

      p_first_touch_campaign: textValue(
        formData,

        "first_touch_campaign",
      ),

      p_notes: textValue(
        formData,

        "notes",
      ),
    },
  );

  if (error) {
    redirect(`/leads/new?error=${encodeURIComponent(error.message)}`);
  }

  const id = Array.isArray(data) ? data[0]?.id : (data as any)?.id;

  if (id && potentialMode === "manual") {
    const { error: valueError } = await supabase.rpc(
      "update_crm_lead_fields",

      {
        p_lead_id: id,

        p_patch: {
          potential_value: manualPotentialValue,

          potential_currency: manualCurrency,

          potential_value_source: "manual",
        },
      },
    );

    if (valueError) {
      redirect(
        `/leads/${id}/edit?error=${encodeURIComponent(valueError.message)}`,
      );
    }
  }

  revalidatePath("/leads");

  revalidatePath("/dashboard");

  revalidatePath("/revenue");

  redirect(id ? `/leads/${id}` : "/leads");
}

export async function updateLeadAction(
  leadId: string,

  formData: FormData,
) {
  if (useMockData) {
    redirect(`/leads/${leadId}?notice=mock-update`);
  }

  const intentRaw = textValue(
    formData,

    "intent",
  );

  const intent: IntentLevel = allowedIntents.includes(intentRaw as IntentLevel)
    ? (intentRaw as IntentLevel)
    : "unknown";

  const channel = safeChannel(
    textValue(
      formData,

      "current_contact_channel",
    ),
  );

  const preferredBatchId = textValue(
    formData,

    "preferred_batch_id",
  );

  const potentialMode =
    textValue(
      formData,

      "potential_value_mode",
    ) === "manual"
      ? "manual"
      : "batch_default";

  const manualPotentialValue = numberValue(
    formData,

    "potential_value",
  );

  const manualCurrency = currencyValue(formData);

  if (
    potentialMode === "manual" &&
    (manualPotentialValue === null || manualPotentialValue < 0)
  ) {
    redirect(
      `/leads/${leadId}/edit?error=${encodeURIComponent(
        "Enter a valid potential value.",
      )}`,
    );
  }

  if (potentialMode === "manual" && !manualCurrency) {
    redirect(
      `/leads/${leadId}/edit?error=${encodeURIComponent(
        "Select INR or USD for the potential value.",
      )}`,
    );
  }

  let potentialFields: {
    potential_value: number | null;

    potential_currency: string | null;

    potential_value_source: string | null;
  };

  if (potentialMode === "manual") {
    potentialFields = {
      potential_value: manualPotentialValue,

      potential_currency: manualCurrency,

      potential_value_source: "manual",
    };
  } else if (preferredBatchId) {
    potentialFields = {
      potential_value: null,

      potential_currency: null,

      potential_value_source: "batch_default",
    };
  } else {
    potentialFields = {
      potential_value: null,

      potential_currency: null,

      potential_value_source: null,
    };
  }

  const supabase = await createClient();

  const { error } = await supabase.rpc(
    "update_crm_lead_fields",

    {
      p_lead_id: leadId,

      p_patch: {
        interested_course_id: textValue(
          formData,

          "course_id",
        ),

        preferred_batch_id: preferredBatchId,

        preferred_location: textValue(
          formData,

          "preferred_location",
        ),

        preferred_month: monthDate(
          textValue(
            formData,

            "preferred_month",
          ),
        ),

        preferred_mode: textValue(
          formData,

          "preferred_mode",
        ),

        country: textValue(
          formData,

          "country",
        ),

        timezone: textValue(
          formData,

          "timezone",
        ),

        current_contact_channel: channel,

        intent,

        summary: textValue(
          formData,

          "summary",
        ),

        notes: textValue(
          formData,

          "notes",
        ),

        ...potentialFields,
      },
    },
  );

  if (error) {
    redirect(
      `/leads/${leadId}/edit?error=${encodeURIComponent(error.message)}`,
    );
  }

  revalidatePath(`/leads/${leadId}`);

  revalidatePath(`/leads/${leadId}/edit`);

  revalidatePath("/leads");

  revalidatePath("/dashboard");

  revalidatePath("/revenue");

  redirect(`/leads/${leadId}?notice=updated`);
}

export async function recordPaymentAction(
  leadId: string,

  formData: FormData,
) {
  if (useMockData) {
    redirect(`/leads/${leadId}?notice=mock-payment`);
  }

  const kindRaw = textValue(
    formData,

    "payment_kind",
  );

  const paymentKind: PaymentKind = allowedPaymentKinds.includes(
    kindRaw as PaymentKind,
  )
    ? (kindRaw as PaymentKind)
    : "other";

  const amount = numberValue(
    formData,

    "payment_amount",
  );

  if (amount === null || amount <= 0) {
    redirect(
      `/leads/${leadId}?error=${encodeURIComponent(
        "Enter a valid payment amount.",
      )}`,
    );
  }

  const currency = (
    textValue(
      formData,

      "payment_currency",
    ) ?? ""
  ).toUpperCase();

  if (!["USD", "INR"].includes(currency)) {
    redirect(
      `/leads/${leadId}?error=${encodeURIComponent("Select INR or USD.")}`,
    );
  }

  const provider = textValue(
    formData,

    "payment_provider",
  );

  const reference = textValue(
    formData,

    "payment_reference",
  );

  const notes = textValue(
    formData,

    "payment_notes",
  );

  const paidAtRaw = textValue(
    formData,

    "paid_at",
  );

  let paidAt = new Date().toISOString();

  if (paidAtRaw) {
    const parsed = new Date(paidAtRaw);

    if (Number.isNaN(parsed.getTime())) {
      redirect(
        `/leads/${leadId}?error=${encodeURIComponent("Invalid payment date.")}`,
      );
    }

    paidAt = parsed.toISOString();
  }

  const status = paymentKind === "refund" ? "refunded" : "paid";

  const supabase = await createClient();

  const {
    data: payment,

    error,
  } = await supabase

    .from("payments")

    .insert({
      lead_id: leadId,

      payment_kind: paymentKind,

      status,

      amount,

      currency,

      provider,

      external_payment_id: reference,

      paid_at: paidAt,

      metadata: {
        source: "crm_manual",

        notes,
      },
    })

    .select("id")

    .single();

  if (error) {
    redirect(`/leads/${leadId}?error=${encodeURIComponent(error.message)}`);
  }

  await supabase

    .from("activities")

    .insert({
      lead_id: leadId,

      activity_type:
        paymentKind === "refund" ? "refund_recorded" : "payment_recorded",

      actor_type: "human",

      title: paymentKind === "refund" ? "Refund recorded" : "Payment recorded",

      details: `${currency} ${amount}` + (provider ? ` · ${provider}` : ""),

      metadata: {
        payment_id: payment?.id,

        payment_kind: paymentKind,

        currency,

        amount,

        reference,
      },
    });

  revalidatePath(`/leads/${leadId}`);

  revalidatePath("/leads");

  revalidatePath("/dashboard");

  revalidatePath("/revenue");

  redirect(`/leads/${leadId}?notice=payment-recorded`);
}

export async function updateLeadStageAction(
  leadId: string,

  formData: FormData,
) {
  if (useMockData) {
    redirect(`/leads/${leadId}?notice=mock-stage`);
  }

  const rawStage = textValue(
    formData,

    "stage",
  );

  if (!allowedStages.includes(rawStage as LeadStage)) {
    redirect(`/leads/${leadId}?error=Invalid%20stage`);
  }

  const supabase = await createClient();

  const { data: claims } = await supabase.auth.getClaims();

  const { error } = await supabase.rpc(
    "set_lead_stage",

    {
      p_lead_id: leadId,

      p_new_stage: rawStage,

      p_changed_by_type: "human",

      p_changed_by_id: claims?.claims?.sub ?? null,

      p_reason: textValue(
        formData,

        "reason",
      ),
    },
  );

  if (error) {
    redirect(`/leads/${leadId}?error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath(`/leads/${leadId}`);

  revalidatePath("/leads");

  revalidatePath("/pipeline");

  revalidatePath("/dashboard");

  revalidatePath("/revenue");

  redirect(`/leads/${leadId}?notice=stage-updated`);
}

export async function createFollowUpAction(
  leadId: string,

  formData: FormData,
) {
  if (useMockData) {
    redirect(`/leads/${leadId}?notice=mock-followup`);
  }

  const title = textValue(
    formData,

    "title",
  );

  const dueAt = textValue(
    formData,

    "due_at",
  );

  if (!title || !dueAt) {
    redirect(
      `/leads/${leadId}?error=Follow-up%20title%20and%20time%20are%20required`,
    );
  }

  const supabase = await createClient();

  const { error } = await supabase.rpc(
    "create_followup_task",

    {
      p_lead_id: leadId,

      p_title: title,

      p_due_at: new Date(dueAt!).toISOString(),

      p_description: textValue(
        formData,

        "description",
      ),
    },
  );

  if (error) {
    redirect(`/leads/${leadId}?error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath(`/leads/${leadId}`);

  revalidatePath("/follow-ups");

  revalidatePath("/dashboard");

  redirect(`/leads/${leadId}?notice=followup-created`);
}

export async function completeFollowUpAction(formData: FormData) {
  const taskId = textValue(
    formData,

    "task_id",
  );

  const leadId = textValue(
    formData,

    "lead_id",
  );

  if (!taskId) {
    return;
  }

  if (useMockData) {
    redirect("/follow-ups?notice=mock-complete");
  }

  const supabase = await createClient();

  const { error } = await supabase.rpc(
    "complete_followup_task",

    {
      p_task_id: taskId,
    },
  );

  if (error) {
    redirect(`/follow-ups?error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath("/follow-ups");

  revalidatePath("/dashboard");

  if (leadId) {
    revalidatePath(`/leads/${leadId}`);
  }

  redirect("/follow-ups?notice=completed");
}

export async function logLeadContactAction(
  leadId: string,

  formData: FormData,
) {
  if (useMockData) {
    redirect(`/leads/${leadId}?notice=mock-contact-logged`);
  }

  const method = textValue(
    formData,

    "contact_method",
  );

  const direction = textValue(
    formData,

    "contact_direction",
  );

  const outcome = textValue(
    formData,

    "contact_outcome",
  );

  const comment = textValue(
    formData,

    "contact_comment",
  );

  const contactedAt = istDateTimeToIso(
    textValue(
      formData,

      "contacted_at",
    ),
  );

  const durationMinutes = numberValue(
    formData,

    "call_duration_minutes",
  );

  if (
    !allowedContactMethods.includes(
      method as (typeof allowedContactMethods)[number],
    )
  ) {
    redirect(
      `/leads/${leadId}?error=${encodeURIComponent(
        "Select a valid contact method.",
      )}`,
    );
  }

  if (
    !allowedContactDirections.includes(
      direction as (typeof allowedContactDirections)[number],
    )
  ) {
    redirect(
      `/leads/${leadId}?error=${encodeURIComponent(
        "Select a valid contact direction.",
      )}`,
    );
  }

  if (
    !allowedContactOutcomes.includes(
      outcome as (typeof allowedContactOutcomes)[number],
    )
  ) {
    redirect(
      `/leads/${leadId}?error=${encodeURIComponent(
        "Select a valid contact outcome.",
      )}`,
    );
  }

  if (!comment) {
    redirect(
      `/leads/${leadId}?error=${encodeURIComponent(
        "Add a short comment about the contact.",
      )}`,
    );
  }

  if (!contactedAt) {
    redirect(
      `/leads/${leadId}?error=${encodeURIComponent(
        "Enter a valid contact date and time.",
      )}`,
    );
  }

  if (
    durationMinutes !== null &&
    (durationMinutes < 0 || durationMinutes > 480)
  ) {
    redirect(
      `/leads/${leadId}?error=${encodeURIComponent(
        "Call duration must be between 0 and 480 minutes.",
      )}`,
    );
  }

  const callDurationSeconds =
    durationMinutes === null ? null : Math.round(durationMinutes * 60);

  const supabase = await createClient();

  const { error } = await supabase.rpc(
    "log_lead_contact",

    {
      p_lead_id: leadId,

      p_method: method,

      p_direction: direction,

      p_outcome: outcome,

      p_comment: comment,

      p_contacted_at: contactedAt,

      p_call_duration_seconds: callDurationSeconds,
    },
  );

  if (error) {
    redirect(`/leads/${leadId}?error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath(`/leads/${leadId}`);

  revalidatePath("/leads");

  revalidatePath("/dashboard");

  revalidatePath("/pipeline");

  revalidatePath("/conversations");

  revalidatePath("/team-performance");

  redirect(`/leads/${leadId}?notice=contact-logged`);
}

export async function logLeadInteractionAction(
  leadId: string,

  formData: FormData,
) {
  if (useMockData) {
    redirect(`/leads/${leadId}?notice=mock-interaction`);
  }

  const channel = safeChannel(
    textValue(
      formData,

      "channel",
    ),
  );

  const directionRaw = textValue(
    formData,

    "direction",
  );

  const direction = directionRaw === "inbound" ? "inbound" : "outbound";

  const body = textValue(
    formData,

    "body",
  );

  const conversationId = textValue(
    formData,

    "conversation_id",
  );

  if (!body) {
    redirect(`/leads/${leadId}?error=Interaction%20text%20is%20required`);
  }

  const supabase = await createClient();

  const { error } = await supabase.rpc(
    "log_lead_interaction",

    {
      p_lead_id: leadId,

      p_channel: channel,

      p_direction: direction,

      p_body: body,

      p_conversation_id: conversationId,
    },
  );

  if (error) {
    redirect(`/leads/${leadId}?error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath(`/leads/${leadId}`);

  revalidatePath("/leads");

  revalidatePath("/dashboard");

  revalidatePath("/pipeline");

  revalidatePath("/conversations");

  redirect(`/leads/${leadId}?notice=interaction-logged`);
}

export async function snoozeFollowUpAction(formData: FormData) {
  const taskId = textValue(
    formData,

    "task_id",
  );

  const dueAt = textValue(
    formData,

    "due_at",
  );

  if (!taskId || !dueAt) {
    redirect("/follow-ups?error=Task%20and%20new%20time%20are%20required");
  }

  if (useMockData) {
    redirect("/follow-ups?notice=mock-snooze");
  }

  const supabase = await createClient();

  const { error } = await supabase.rpc(
    "snooze_followup_task",

    {
      p_task_id: taskId,

      p_due_at: new Date(dueAt).toISOString(),
    },
  );

  if (error) {
    redirect(`/follow-ups?error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath("/follow-ups");

  revalidatePath("/dashboard");

  redirect("/follow-ups?notice=snoozed");
}
