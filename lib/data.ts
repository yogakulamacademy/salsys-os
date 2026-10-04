import {
  mockCampaigns,
  mockFollowUps,
  mockLeadDetails,
  mockLeads,
} from "./mock-data";

import type {
  CampaignPerformance,
  Channel,
  FollowUp,
  LeadDetail,
  LeadOverview,
  LeadStage,
  Touchpoint,
} from "@/types/crm";

import { createClient } from "@/lib/supabase/server";

import { useMockData } from "@/lib/config";

/* =========================================================



   TYPES



========================================================= */

export type CourseOption = {
  id: string;

  name: string;

  code: string;
};

export type CourseBatchOption = {
  id: string;

  courseId: string;

  batchCode: string;

  location?: string;

  mode?: string;

  startDate?: string;

  endDate?: string;

  startTime?: string;

  endTime?: string;

  timezone?: string;

  capacity?: number;

  seatsRemaining?: number;

  expectedValue?: number;

  currency?: string;
};

export type LeadPayment = {
  id: string;

  paymentKind: "deposit" | "balance" | "full" | "refund" | "other";

  status: "pending" | "paid" | "failed" | "refunded" | "partially_refunded";

  amount: number;

  currency: string;

  provider?: string;

  externalPaymentId?: string;

  paidAt?: string;

  createdAt: string;

  notes?: string;
};

/*



 * Extended lead data used by the Lead Detail page.



 * These fields come from the new CRM enrichment columns.



 */

export type EnrichedLeadDetail = LeadDetail & {
  preferredLocation?: string;

  potentialValue?: number;

  potentialCurrency?: string;

  potentialValueSource?: string;

  geoCountry?: string;

  geoRegion?: string;

  geoCity?: string;

  geoTimezone?: string;

  leadOrigin?: string;

  landingPage?: string;

  firstTouchSource?: string;

  firstTouchMedium?: string;

  firstTouchCampaign?: string;

  lastTouchSource?: string;

  lastTouchMedium?: string;

  lastTouchCampaign?: string;
};

/* =========================================================



   HELPERS



========================================================= */

function monthLabel(value?: string | null) {
  if (!value) {
    return undefined;
  }

  /*



   * Existing database values may contain either:



   *



   * 2027-02-01



   *



   * or other stored month/date representations.



   */

  const date = new Date(`${value.slice(0, 10)}T00:00:00Z`);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("en", {
    month: "long",

    year: "numeric",

    timeZone: "UTC",
  }).format(date);
}

/* =========================================================



   MAP LEAD ROW



========================================================= */

function mapLeadRow(row: any): LeadOverview {
  return {
    id: row.id,

    leadCode: row.lead_code,

    name: row.lead_name || row.display_name || row.lead_code,

    email: row.email ?? undefined,

    phone: row.phone ?? undefined,

    course: row.course_name ?? "Not selected",

    location: row.preferred_location ?? "—",

    country: row.country ?? "—",

    stage: row.current_stage,

    intent: row.intent,

    firstTouchSource: row.first_touch_source ?? "Unknown",

    firstTouchMedium: row.first_touch_medium ?? "Unknown",

    firstTouchCampaign: row.first_touch_campaign ?? "Unattributed",

    leadCreationChannel: row.lead_creation_channel ?? "other",

    currentContactChannel: row.current_contact_channel ?? "other",

    owner: row.owner_name ?? (row.owner_user_id ? "Assigned" : "Unassigned"),

    lastContactedAt: row.last_contacted_at ?? undefined,

    nextFollowupAt: row.next_followup_at ?? undefined,

    createdAt: row.created_at,

    value:
      row.enrollment_value == null ? undefined : Number(row.enrollment_value),

    currency: row.enrollment_currency ?? undefined,
  };
}

/* =========================================================

   CURRENT CRM IDENTITY

========================================================= */

async function getCurrentCrmIdentity(supabase: any) {
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return {
      user: null,
      role: null as string | null,
      active: false,
      fullName: null as string | null,
    };
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name,role,active")
    .eq("id", user.id)
    .maybeSingle();

  return {
    user,
    role: profile?.role ?? null,
    active: profile?.active === true,
    fullName: profile?.full_name ?? null,
  };
}

async function getCurrentOrganizationId(supabase: any): Promise<string> {
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    throw new Error(
      "Unable to resolve current organization: user is not authenticated.",
    );
  }

  const { data: memberships, error: membershipError } = await supabase
    .from("organization_members")
    .select("organization_id")
    .eq("user_id", user.id)
    .eq("active", true)
    .limit(2);

  if (membershipError) {
    throw new Error(
      `Unable to resolve current organization: ${membershipError.message}`,
    );
  }

  if (!memberships || memberships.length === 0) {
    throw new Error("No active organization membership was found.");
  }

  if (memberships.length > 1) {
    throw new Error(
      "Multiple active organization memberships were found. Workspace selection is required.",
    );
  }

  return String(memberships[0].organization_id);
}

/* =========================================================



   GET LEADS



========================================================= */

export async function getLeads(): Promise<LeadOverview[]> {
  if (useMockData) {
    return mockLeads;
  }

  const supabase = await createClient();

  const identity = await getCurrentCrmIdentity(supabase);
  const organizationId = await getCurrentOrganizationId(supabase);

  const employee =
    identity.active &&
    identity.role === "admissions" &&
    Boolean(identity.user?.id);

  let query = supabase

    .from("v_leads_overview")

    .select("*")
    .eq("organization_id", organizationId)

    .order("created_at", {
      ascending: false,
    })

    .limit(500);

  /*

   * Employee list queries are explicitly scoped to the logged-in owner.

   * The database RLS remains the primary boundary; this is an additional

   * application-level guard so employee UI never receives another owner's row.

   */

  if (employee && identity.user) {
    query = query.eq("owner_user_id", identity.user.id);
  }

  const { data, error } = await query;

  if (error) {
    throw new Error(`Unable to load leads: ${error.message}`);
  }

  const rows = data ?? [];

  if (!employee || rows.length === 0) {
    return rows.map(mapLeadRow);
  }

  /*

   * Employees receive masked contact values from the secure RPC.

   * Never serialize raw phone/email values from the overview row to staff.

   */

  const { data: secureContacts, error: contactError } = await supabase.rpc(
    "get_admissions_lead_contacts_secure",

    {
      p_lead_ids: rows.map((row: any) => row.id),
    },
  );

  if (contactError) {
    throw new Error(
      `Unable to load masked lead contacts: ${contactError.message}`,
    );
  }

  const contactByLead = new Map<string, any>(
    (secureContacts ?? []).map((contact: any) => [contact.lead_id, contact]),
  );

  return rows.map((row: any) => {
    const contact = contactByLead.get(row.id);

    return mapLeadRow({
      ...row,

      email: contact?.email ?? null,

      phone: contact?.phone ?? contact?.whatsapp ?? null,
    });
  });
}

/* =========================================================



   GET SINGLE LEAD



========================================================= */

export async function getLead(id: string): Promise<EnrichedLeadDetail | null> {
  if (useMockData) {
    return (mockLeadDetails[id] ?? null) as EnrichedLeadDetail | null;
  }

  const supabase = await createClient();

  /*

   * Explicitly authorize the lead before loading related records.

   * Admin can access any lead; Employee can access only their assigned lead.

   */

  const { data: canAccess, error: accessError } = await supabase.rpc(
    "can_access_lead",

    {
      p_lead_id: id,
    },
  );

  if (accessError) {
    throw new Error(`Unable to authorize lead access: ${accessError.message}`);
  }

  if (!canAccess) {
    return null;
  }

  const organizationId = await getCurrentOrganizationId(supabase);

  /* =======================================================



     LOAD ALL LEAD DATA



  ======================================================= */

  const [
    leadResult,

    enrichmentResult,

    contactsResult,

    touchpointsResult,

    stagesResult,

    messagesResult,

    enrollmentResult,
  ] = await Promise.all([
    /* -----------------------------------------------------



       EXISTING LEAD VIEW



    ----------------------------------------------------- */

    supabase
      .from("v_leads_overview")
      .select("*")
      .eq("organization_id", organizationId)
      .eq("id", id)
      .maybeSingle(),

    /* -----------------------------------------------------



       NEW LEAD INTELLIGENCE







       Read directly from leads table.







       This avoids needing to modify



       v_leads_overview right now.



    ----------------------------------------------------- */

    supabase

      .from("leads")

      .select(
        `



        preferred_location,



        preferred_month,



        preferred_mode,







        potential_value,



        potential_currency,



        potential_value_source,







        geo_country,



        geo_region,



        geo_city,



        geo_timezone,







        lead_origin,



        landing_page,







        first_touch_source,



        first_touch_medium,



        first_touch_campaign,







        last_touch_source,



        last_touch_medium,



        last_touch_campaign



      `,
      )

      .eq("id", id)

      .maybeSingle(),

    /* -----------------------------------------------------



       CONTACT INFORMATION



    ----------------------------------------------------- */

    supabase.rpc("get_admissions_lead_contacts_secure", {
      p_lead_ids: [id],
    }),

    /* -----------------------------------------------------



       WEBSITE / MARKETING TOUCHPOINTS



    ----------------------------------------------------- */

    supabase

      .from("touchpoints")

      .select(
        `



        id,



        event_type,



        source,



        medium,



        occurred_at,



        landing_page,



        campaign_name,



        channel,



        geo_country,



        geo_region,



        geo_city,



        metadata



      `,
      )

      .eq("lead_id", id)

      .order("occurred_at", {
        ascending: true,
      })

      .limit(100),

    /* -----------------------------------------------------



       LEAD STAGE HISTORY



    ----------------------------------------------------- */

    supabase

      .from("lead_stage_history")

      .select(
        `



        id,



        to_stage,



        changed_at,



        reason,



        changed_by_type



      `,
      )

      .eq("lead_id", id)

      .order("changed_at", {
        ascending: true,
      })

      .limit(100),

    /* -----------------------------------------------------



       RECENT MESSAGES



    ----------------------------------------------------- */

    supabase

      .from("messages")

      .select(
        `



        id,



        direction,



        sender_type,



        body,



        created_at,



        conversations(channel)



      `,
      )

      .eq("lead_id", id)

      .order("created_at", {
        ascending: false,
      })

      .limit(12),

    /* -----------------------------------------------------



       ENROLLMENT VALUE



    ----------------------------------------------------- */

    supabase

      .from("enrollments")

      .select(
        `



        total_value,



        currency



      `,
      )

      .eq("lead_id", id)

      .order("created_at", {
        ascending: false,
      })

      .limit(1)

      .maybeSingle(),
  ]);

  /* =======================================================



     MAIN LEAD ERROR



  ======================================================= */

  if (leadResult.error) {
    throw new Error(`Unable to load lead: ${leadResult.error.message}`);
  }

  if (!leadResult.data) {
    return null;
  }

  /* =======================================================



     ENRICHMENT ERROR



  ======================================================= */

  if (enrichmentResult.error) {
    throw new Error(
      `Unable to load lead intelligence: ${enrichmentResult.error.message}`,
    );
  }

  if (contactsResult.error) {
    throw new Error(
      `Unable to load secure contact details: ${contactsResult.error.message}`,
    );
  }

  /* =======================================================



     MERGE VIEW + LEADS TABLE



  ======================================================= */

  const row: any = {
    ...leadResult.data,

    ...(enrichmentResult.data ?? {}),
  };

  /* =======================================================



     BUILD BASE LEAD



  ======================================================= */

  const base = mapLeadRow({
    ...row,

    enrollment_value: enrollmentResult.data?.total_value,

    enrollment_currency: enrollmentResult.data?.currency,
  });

  /* =======================================================



     CONTACT DETAILS



  ======================================================= */

  const secureContact = (contactsResult.data ?? [])[0] as any;

  const email = secureContact?.email ?? undefined;

  const phone = secureContact?.phone ?? secureContact?.whatsapp ?? undefined;

  /* =======================================================



     WEBSITE / MARKETING JOURNEY



  ======================================================= */

  const touchpoints: Touchpoint[] = [
    ...((touchpointsResult.data ?? []).map((point: any) => {
      /*



       * Geographic location



       * associated with this event.



       */

      const pointLocation = [
        point.geo_city,

        point.geo_region,

        point.geo_country,
      ]

        .filter(Boolean)

        .join(", ");

      /*



       * Build richer detail line.



       */

      const detailParts = [
        point.campaign_name ? `Campaign: ${point.campaign_name}` : null,

        point.landing_page ? `Page: ${point.landing_page}` : null,

        pointLocation ? `Location: ${pointLocation}` : null,

        point.metadata?.detail ? String(point.metadata.detail) : null,
      ].filter(Boolean);

      /*



       * Detect event category.



       */

      let kind: Touchpoint["kind"];

      if (point.event_type?.includes("message")) {
        kind = "message";
      } else if (point.event_type?.includes("payment")) {
        kind = "payment";
      } else if (
        point.channel === "website" ||
        point.event_type?.includes("page") ||
        point.event_type?.includes("form") ||
        point.event_type?.includes("whatsapp")
      ) {
        kind = "website";
      } else {
        kind = "marketing";
      }

      return {
        id: `touch-${point.id}`,

        label: point.event_type?.replaceAll("_", " ") || "Touchpoint",

        source: point.source || point.channel || "Tracking",

        medium: point.medium || undefined,

        timestamp: point.occurred_at,

        detail: detailParts.length ? detailParts.join(" · ") : undefined,

        kind,
      };
    }) as Touchpoint[]),

    /* -----------------------------------------------------



       CRM STAGE HISTORY



    ----------------------------------------------------- */

    ...((stagesResult.data ?? []).map((stage: any) => ({
      id: `stage-${stage.id}`,

      label: `Moved to ${String(stage.to_stage).replaceAll("_", " ")}`,

      source: stage.changed_by_type === "ai" ? "AI" : "CRM",

      timestamp: stage.changed_at,

      detail: stage.reason || undefined,

      kind: "stage" as const,
    })) as Touchpoint[]),
  ].sort(
    (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
  );

  /* =======================================================



     MESSAGES



  ======================================================= */

  const lastMessages = (messagesResult.data ?? [])

    .reverse()

    .map((message: any) => ({
      id: message.id,

      direction: message.direction as "inbound" | "outbound",

      sender:
        message.sender_type === "lead"
          ? base.name
          : message.sender_type === "ai"
            ? "AI Agent"
            : "Admissions",

      body: message.body || "[Non-text message]",

      timestamp: message.created_at,

      channel: ((Array.isArray(message.conversations)
        ? message.conversations[0]?.channel
        : message.conversations?.channel) ||
        base.currentContactChannel ||
        "other") as Channel,
    }));

  /* =======================================================



     POTENTIAL VALUE



  ======================================================= */

  let potentialValue: number | undefined;

  if (row.potential_value != null) {
    potentialValue = Number(row.potential_value);
  } else if (enrollmentResult.data?.total_value != null) {
    potentialValue = Number(enrollmentResult.data.total_value);
  } else {
    potentialValue = base.value ?? undefined;
  }

  const potentialCurrency =
    row.potential_currency ||
    enrollmentResult.data?.currency ||
    base.currency ||
    undefined;

  /* =======================================================



     RETURN FINAL LEAD



  ======================================================= */

  return {
    ...base,

    /* -----------------------------------------------------



       PERSON



    ----------------------------------------------------- */

    /* ---------------------------------------------------------



   PERSON



--------------------------------------------------------- */

    firstName: row.first_name ?? undefined,

    lastName: row.last_name ?? undefined,

    /* ---------------------------------------------------------



   COURSE



--------------------------------------------------------- */

    interestedCourseId: row.interested_course_id ?? undefined,

    preferredBatchId: row.preferred_batch_id ?? undefined,

    /* ---------------------------------------------------------



   REVENUE FORECAST



--------------------------------------------------------- */

    potentialValue:
      row.potential_value == null ? undefined : Number(row.potential_value),

    potentialValueSource: row.potential_value_source ?? undefined,

    /* -----------------------------------------------------



       CONTACT



    ----------------------------------------------------- */

    email: email,

    phone: phone,

    /* -----------------------------------------------------



       PREFERRED LOCATION



    ----------------------------------------------------- */

    location: row.preferred_location ?? base.location ?? "—",

    preferredLocation: row.preferred_location ?? undefined,

    /* -----------------------------------------------------



       PREFERRED MONTH



    ----------------------------------------------------- */

    preferredMonthRaw: row.preferred_month
      ? String(row.preferred_month).slice(0, 7)
      : undefined,

    preferredMonth: monthLabel(row.preferred_month),

    /* -----------------------------------------------------



       MODE



    ----------------------------------------------------- */

    preferredMode: row.preferred_mode ?? undefined,

    /* -----------------------------------------------------



       VALUE



    ----------------------------------------------------- */

    value: potentialValue,

    currency: potentialCurrency,

    /* -----------------------------------------------------



       VISITOR LOCATION







       This is approximate visitor IP geography,



       NOT the manually selected country.



    ----------------------------------------------------- */

    geoCountry: row.geo_country ?? undefined,

    geoRegion: row.geo_region ?? undefined,

    geoCity: row.geo_city ?? undefined,

    geoTimezone: row.geo_timezone ?? undefined,

    /* -----------------------------------------------------



       EXISTING MANUAL TIMEZONE



    ----------------------------------------------------- */

    timezone: row.timezone ?? undefined,

    /* -----------------------------------------------------



       LEAD ORIGIN



    ----------------------------------------------------- */

    leadOrigin: row.lead_origin ?? undefined,

    landingPage: row.landing_page ?? undefined,

    /* -----------------------------------------------------



       FIRST TOUCH



    ----------------------------------------------------- */

    firstTouchSource:
      row.first_touch_source ?? base.firstTouchSource ?? undefined,

    firstTouchMedium:
      row.first_touch_medium ?? base.firstTouchMedium ?? undefined,

    firstTouchCampaign:
      row.first_touch_campaign ?? base.firstTouchCampaign ?? undefined,

    /* -----------------------------------------------------



       LAST TOUCH



    ----------------------------------------------------- */

    lastTouchSource: row.last_touch_source ?? undefined,

    lastTouchMedium: row.last_touch_medium ?? undefined,

    lastTouchCampaign: row.last_touch_campaign ?? undefined,

    /* -----------------------------------------------------



       CRM SUMMARY



    ----------------------------------------------------- */

    summary: row.summary ?? "No CRM summary yet.",

    notes: row.notes ?? "No internal notes yet.",

    /* -----------------------------------------------------



       JOURNEY



    ----------------------------------------------------- */

    touchpoints,

    /* -----------------------------------------------------



       CONVERSATIONS



    ----------------------------------------------------- */

    lastMessages,
  };
}

/* =========================================================



   LEAD PAYMENTS



========================================================= */

export async function getLeadPayments(leadId: string): Promise<LeadPayment[]> {
  if (useMockData) {
    return [];
  }

  const supabase = await createClient();

  const { data, error } = await supabase

    .from("payments")

    .select(
      `



      id,



      payment_kind,



      status,



      amount,



      currency,



      provider,



      external_payment_id,



      paid_at,



      metadata,



      created_at



    `,
    )

    .eq("lead_id", leadId)

    .order("created_at", {
      ascending: false,
    });

  if (error) {
    throw new Error(`Unable to load payments: ${error.message}`);
  }

  return (data ?? []).map((row: any) => ({
    id: row.id,

    paymentKind: row.payment_kind,

    status: row.status,

    amount: Number(row.amount ?? 0),

    currency: String(row.currency ?? "").toUpperCase(),

    provider: row.provider ?? undefined,

    externalPaymentId: row.external_payment_id ?? undefined,

    paidAt: row.paid_at ?? undefined,

    createdAt: row.created_at,

    notes: row.metadata?.notes ?? undefined,
  }));
}

/* =========================================================



   FOLLOW UPS



========================================================= */

export async function getFollowUps(): Promise<FollowUp[]> {
  if (useMockData) {
    return mockFollowUps;
  }

  const supabase = await createClient();

  const identity = await getCurrentCrmIdentity(supabase);
  const organizationId = await getCurrentOrganizationId(supabase);

  const employee =
    identity.active &&
    identity.role === "admissions" &&
    Boolean(identity.user?.id);

  let query = supabase

    .from("v_followups_due")

    .select("*")
    .eq("organization_id", organizationId)

    .order("due_at", {
      ascending: true,
    })

    .limit(250);

  if (employee && identity.user) {
    const { data: ownedLeads, error: ownedError } = await supabase

      .from("leads")

      .select("id")
      .eq("organization_id", organizationId)

      .eq("owner_user_id", identity.user.id)

      .limit(500);

    if (ownedError) {
      throw new Error(`Unable to load assigned leads: ${ownedError.message}`);
    }

    const ownedLeadIds = (ownedLeads ?? []).map((lead: any) => lead.id);

    if (ownedLeadIds.length === 0) {
      return [];
    }

    query = query.in("lead_id", ownedLeadIds);
  }

  const { data, error } = await query;

  if (error) {
    throw new Error(`Unable to load follow-ups: ${error.message}`);
  }

  return (data ?? []).map((row: any) => ({
    id: row.task_id,

    leadId: row.lead_id,

    leadCode: row.lead_code,

    leadName: row.lead_name,

    title: row.title,

    dueAt: row.due_at,

    stage: row.current_stage as LeadStage,

    intent: row.intent,

    channel: (row.current_contact_channel ?? "other") as Channel,
  }));
}

/* =========================================================



   COURSES



========================================================= */

export async function getCourses(): Promise<CourseOption[]> {
  if (useMockData) {
    const unique = new Map<string, CourseOption>();

    mockLeads.forEach((lead, index) => {
      if (!unique.has(lead.course)) {
        unique.set(lead.course, {
          id: `mock-course-${index}`,
          code: `MOCK-${index}`,
          name: lead.course,
        });
      }
    });

    return [...unique.values()];
  }

  const supabase = await createClient();
  const organizationId = await getCurrentOrganizationId(supabase);

  const { data, error } = await supabase
    .from("courses")
    .select("id,code,name")
    .eq("organization_id", organizationId)
    .eq("active", true)
    .order("name");

  if (error) {
    throw new Error(`Unable to load courses: ${error.message}`);
  }

  return data ?? [];
}

/* =========================================================



   COURSE BATCHES



========================================================= */

export async function getCourseBatches(): Promise<CourseBatchOption[]> {
  if (useMockData) {
    return [];
  }

  const supabase = await createClient();
  const organizationId = await getCurrentOrganizationId(supabase);

  const { data, error } = await supabase
    .from("course_batches")
    .select(
      `
        id,
        course_id,
        batch_code,
        location,
        mode,
        start_date,
        end_date,
        start_time,
        end_time,
        timezone,
        capacity,
        seats_remaining,
        expected_value,
        currency
      `,
    )
    .eq("organization_id", organizationId)
    .eq("active", true)
    .order("start_date", {
      ascending: true,
    });

  if (error) {
    throw new Error(`Unable to load course batches: ${error.message}`);
  }

  return (data ?? []).map((row: any) => ({
    id: row.id,
    courseId: row.course_id,
    batchCode: row.batch_code,
    location: row.location ?? undefined,
    mode: row.mode ?? undefined,
    startDate: row.start_date ?? undefined,
    endDate: row.end_date ?? undefined,
    startTime: row.start_time ?? undefined,
    endTime: row.end_time ?? undefined,
    timezone: row.timezone ?? undefined,
    capacity: row.capacity == null ? undefined : Number(row.capacity),
    seatsRemaining:
      row.seats_remaining == null ? undefined : Number(row.seats_remaining),
    expectedValue:
      row.expected_value == null ? undefined : Number(row.expected_value),
    currency: row.currency ?? undefined,
  }));
}

/* =========================================================



   CAMPAIGNS



========================================================= */

export async function getCampaigns(): Promise<CampaignPerformance[]> {
  /*



   * Campaign spend ingestion



   * will be connected later



   * to Google Ads / Meta Ads.



   */

  return mockCampaigns;
}

/* =========================================================



   MOCK MODE



========================================================= */

export function isMockMode() {
  return useMockData;
}

/* =========================================================



   PIPELINE COUNTS



========================================================= */

export async function getPipelineCounts(): Promise<Record<LeadStage, number>> {
  const empty: Record<LeadStage, number> = {
    new: 0,

    contacted: 0,

    engaged: 0,

    qualified: 0,

    high_intent: 0,

    payment_pending: 0,

    enrolled: 0,

    nurture: 0,

    not_now: 0,

    lost: 0,

    unqualified: 0,

    duplicate: 0,
  };

  if (useMockData) {
    const { dashboardStageCounts } = await import("./mock-data");

    return dashboardStageCounts;
  }

  const supabase = await createClient();

  const identity = await getCurrentCrmIdentity(supabase);
  const organizationId = await getCurrentOrganizationId(supabase);

  if (identity.active && identity.role === "admissions" && identity.user) {
    const { data, error } = await supabase

      .from("leads")

      .select("current_stage")
      .eq("organization_id", organizationId)

      .eq("owner_user_id", identity.user.id)

      .limit(1000);

    if (error) {
      throw new Error(
        `Unable to load employee pipeline counts: ${error.message}`,
      );
    }

    for (const row of data ?? []) {
      const stage = row.current_stage as LeadStage;

      if (stage in empty) {
        empty[stage] += 1;
      }
    }

    return empty;
  }

  const { data, error } = await supabase

    .from("v_pipeline_counts")

    .select("current_stage,lead_count")
    .eq("organization_id", organizationId);

  if (error) {
    throw new Error(`Unable to load pipeline counts: ${error.message}`);
  }

  for (const row of data ?? []) {
    empty[row.current_stage as LeadStage] = Number(row.lead_count);
  }

  return empty;
}

/* =========================================================



   DASHBOARD SOURCE BREAKDOWN



========================================================= */

export async function getDashboardSourceBreakdown(): Promise<
  Array<{
    source: string;

    leads: number;

    share: number;

    qualified: number;
  }>
> {
  if (useMockData) {
    const { sourceBreakdown } = await import("./mock-data");

    return sourceBreakdown;
  }

  const leads = await getLeads();

  const grouped = new Map<
    string,
    {
      source: string;

      leads: number;

      qualified: number;
    }
  >();

  const qualifiedStages: LeadStage[] = [
    "qualified",

    "high_intent",

    "payment_pending",

    "enrolled",
  ];

  for (const lead of leads) {
    const key = lead.firstTouchSource || "Unknown";

    const item = grouped.get(key) ?? {
      source: key,

      leads: 0,

      qualified: 0,
    };

    item.leads += 1;

    if (qualifiedStages.includes(lead.stage)) {
      item.qualified += 1;
    }

    grouped.set(key, item);
  }

  const total = Math.max(1, leads.length);

  return [...grouped.values()]

    .sort((a, b) => b.leads - a.leads)

    .slice(0, 5)

    .map((item) => ({
      ...item,

      share: Math.round((item.leads / total) * 100),
    }));
}

/* =========================================================



   TRACKING HEALTH



========================================================= */

export type TrackingHealth = {
  events24h: number;

  visitors24h: number;

  identifiedEvents24h: number;

  gclidEvents7d: number;

  fbclidEvents7d: number;

  lastEventAt?: string;
};

export async function getTrackingHealth(): Promise<TrackingHealth> {
  if (useMockData) {
    return {
      events24h: 1842,

      visitors24h: 391,

      identifiedEvents24h: 286,

      gclidEvents7d: 742,

      fbclidEvents7d: 519,

      lastEventAt: new Date().toISOString(),
    };
  }

  const supabase = await createClient();

  const { data, error } = await supabase

    .from("v_tracking_health")

    .select("*")

    .maybeSingle();

  if (error) {
    throw new Error(`Unable to load tracking health: ${error.message}`);
  }

  const row: any = data ?? {};

  return {
    events24h: Number(row.events_24h || 0),

    visitors24h: Number(row.visitors_24h || 0),

    identifiedEvents24h: Number(row.identified_events_24h || 0),

    gclidEvents7d: Number(row.gclid_events_7d || 0),

    fbclidEvents7d: Number(row.fbclid_events_7d || 0),

    lastEventAt: row.last_event_at || undefined,
  };
}

/* =========================================================



   WEBSITE CAPTURE HEALTH



========================================================= */

export type WebsiteCaptureHealth = {
  submissions24h: number;

  newLeads24h: number;

  matchedExisting24h: number;

  submissions7d: number;

  lastSubmissionAt?: string;
};

/* =========================================================



   WEB FUNNEL



========================================================= */

export type WebFunnel7d = {
  pageViews: number;

  visitors: number;

  formStarts: number;

  browserFormSubmits: number;

  contactCtaClicks: number;

  identifiedTouchpoints: number;
};

/* =========================================================



   WEBSITE CAPTURE HEALTH



========================================================= */

export async function getWebsiteCaptureHealth(): Promise<WebsiteCaptureHealth> {
  if (useMockData) {
    return {
      submissions24h: 17,

      newLeads24h: 14,

      matchedExisting24h: 3,

      submissions7d: 91,

      lastSubmissionAt: new Date().toISOString(),
    };
  }

  const supabase = await createClient();

  const { data, error } = await supabase

    .from("v_website_capture_health")

    .select("*")

    .maybeSingle();

  if (error) {
    throw new Error(`Unable to load website capture health: ${error.message}`);
  }

  const row: any = data ?? {};

  return {
    submissions24h: Number(row.submissions_24h || 0),

    newLeads24h: Number(row.new_leads_24h || 0),

    matchedExisting24h: Number(row.matched_existing_24h || 0),

    submissions7d: Number(row.submissions_7d || 0),

    lastSubmissionAt: row.last_submission_at || undefined,
  };
}

/* =========================================================



   WEB FUNNEL 7 DAYS



========================================================= */

export async function getWebFunnel7d(): Promise<WebFunnel7d> {
  if (useMockData) {
    return {
      pageViews: 4318,

      visitors: 1290,

      formStarts: 301,

      browserFormSubmits: 106,

      contactCtaClicks: 412,

      identifiedTouchpoints: 682,
    };
  }

  const supabase = await createClient();

  const { data, error } = await supabase

    .from("v_web_funnel_7d")

    .select("*")

    .maybeSingle();

  if (error) {
    throw new Error(`Unable to load website funnel: ${error.message}`);
  }

  const row: any = data ?? {};

  return {
    pageViews: Number(row.page_views || 0),

    visitors: Number(row.visitors || 0),

    formStarts: Number(row.form_starts || 0),

    browserFormSubmits: Number(row.browser_form_submits || 0),

    contactCtaClicks: Number(row.contact_cta_clicks || 0),

    identifiedTouchpoints: Number(row.identified_touchpoints || 0),
  };
}
