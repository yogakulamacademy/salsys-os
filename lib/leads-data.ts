import type { LeadOverview } from "@/types/crm";
import { createClient } from "@/lib/supabase/server";
import { useMockData } from "@/lib/config";
import { mockLeads } from "@/lib/mock-data";
import { getLeads } from "@/lib/data";
import { requireCurrentOrganizationId } from "@/lib/workspace";

export const LEADS_PAGE_SIZE = 50;

export type LeadListIntelligence = {
  lead_id: string;
  owner_user_id: string | null;
  owner_name: string | null;
  aging_status: "healthy" | "warning" | "stuck" | "untracked" | null;
  stage_entered_at: string | null;
  stage_age_hours: number | string | null;
  stage_age_days: number | string | null;
  warning_after_days: number | string | null;
  stuck_after_days: number | string | null;
  days_over_stuck_threshold: number | string | null;
  days_since_last_contact: number | string | null;
  preferred_batch_id: string | null;
  batch_code: string | null;
  batch_location: string | null;
  batch_start_date: string | null;
  batch_end_date: string | null;
};

export type LeadsQuickView =
  | "all"
  | "unassigned"
  | "stuck"
  | "followup_overdue"
  | "payment_pending";

export type LeadsSortMode =
  | "name"
  | "stage_age_desc"
  | "followup_asc";

export type LeadsWorkspaceFilters = {
  query: string;
  stage: string;
  source: string;
  channel: string;
  owner: string;
  course: string;
  aging: string;
  quickView: LeadsQuickView;
  sort: LeadsSortMode;
  page: number;
};

export type LeadsWorkspaceSummary = {
  all: number;
  unassigned: number;
  stuck: number;
  followupOverdue: number;
  paymentPending: number;
};

export type LeadsWorkspaceOptions = {
  stages: string[];
  sources: string[];
  channels: string[];
  owners: string[];
  courses: string[];
};

export type LeadsWorkspacePagination = {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  from: number;
  to: number;
};

export type LeadsWorkspacePageData = {
  leads: LeadOverview[];
  intelligence: LeadListIntelligence[];
  summary: LeadsWorkspaceSummary;
  options: LeadsWorkspaceOptions;
  pagination: LeadsWorkspacePagination;
  warning: string | null;
};

type SearchParamValue =
  | string
  | string[]
  | undefined;

type SearchParamsLike =
  Record<string, SearchParamValue>;

type UnknownRecord =
  Record<string, unknown>;

const QUICK_VIEWS =
  new Set<LeadsQuickView>([
    "all",
    "unassigned",
    "stuck",
    "followup_overdue",
    "payment_pending",
  ]);

const SORT_MODES =
  new Set<LeadsSortMode>([
    "name",
    "stage_age_desc",
    "followup_asc",
  ]);

export function parseLeadsWorkspaceParams(
  params: SearchParamsLike,
): LeadsWorkspaceFilters {
  const quickViewRaw =
    one(params.view) || "all";

  const sortRaw =
    one(params.sort) || "stage_age_desc";

  const pageRaw =
    Number(one(params.page) || 1);

  return {
    query: one(params.q),
    stage: normalizeFilter(one(params.stage)),
    source: normalizeFilter(one(params.source)),
    channel: normalizeFilter(one(params.channel)),
    owner: normalizeFilter(one(params.owner)),
    course: normalizeFilter(one(params.course)),
    aging: normalizeFilter(one(params.aging)),
    quickView:
      QUICK_VIEWS.has(
        quickViewRaw as LeadsQuickView,
      )
        ? (quickViewRaw as LeadsQuickView)
        : "all",
    sort:
      SORT_MODES.has(
        sortRaw as LeadsSortMode,
      )
        ? (sortRaw as LeadsSortMode)
        : "stage_age_desc",
    page:
      Number.isFinite(pageRaw) &&
      pageRaw > 0
        ? Math.floor(pageRaw)
        : 1,
  };
}

export async function getLeadsWorkspacePage(
  filters: LeadsWorkspaceFilters,
): Promise<LeadsWorkspacePageData> {
  if (useMockData) {
    return getMockWorkspacePage(filters);
  }

  const supabase =
  await createClient();

const {
  data: { user },
  error: authError,
} = await supabase.auth.getUser();

if (authError || !user) {
  throw new Error(
    "Unable to load Leads workspace: user is not authenticated.",
  );
}

const organizationId =
  await requireCurrentOrganizationId(
    supabase,
    user.id,
  );

const {
  data,
  error,
} = await (supabase as any).rpc(
  "get_leads_workspace_page",
  {
    p_organization_id:
      organizationId,
      p_page:
        filters.page,
      p_page_size:
        LEADS_PAGE_SIZE,
      p_query:
        valueOrNull(
          filters.query,
        ),
      p_stage:
        valueOrNull(
          filters.stage,
        ),
      p_source:
        valueOrNull(
          filters.source,
        ),
      p_channel:
        valueOrNull(
          filters.channel,
        ),
      p_owner:
        valueOrNull(
          filters.owner,
        ),
      p_course:
        valueOrNull(
          filters.course,
        ),
      p_aging:
        valueOrNull(
          filters.aging,
        ),
      p_quick_view:
        filters.quickView,
      p_sort:
        filters.sort,
    },
  );

  if (error) {
    return getLegacyWorkspacePage(
      filters,
      `Optimized Leads read model failed, so the page is using the legacy fallback: ${error.message}`,
    );
  }

  const payload =
    asRecord(data);

  if (!payload) {
    throw new Error(
      "Unable to load Leads workspace: the read model returned an invalid payload.",
    );
  }

  const rows =
    arrayFrom(payload.rows);

  const summaryRow =
    asRecord(payload.summary) ?? {};

  const optionsRow =
    asRecord(payload.options) ?? {};

  const paginationRow =
    asRecord(payload.pagination) ?? {};

  return {
    leads:
      rows.map(
        mapLeadRow,
      ),
    intelligence:
      rows.map(
        mapIntelligenceRow,
      ),
    summary: {
      all:
        toNumber(
          summaryRow.all,
        ),
      unassigned:
        toNumber(
          summaryRow.unassigned,
        ),
      stuck:
        toNumber(
          summaryRow.stuck,
        ),
      followupOverdue:
        toNumber(
          summaryRow.followup_overdue,
        ),
      paymentPending:
        toNumber(
          summaryRow.payment_pending,
        ),
    },
    options: {
      stages:
        stringArray(
          optionsRow.stages,
        ),
      sources:
        stringArray(
          optionsRow.sources,
        ),
      channels:
        stringArray(
          optionsRow.channels,
        ),
      owners:
        stringArray(
          optionsRow.owners,
        ),
      courses:
        stringArray(
          optionsRow.courses,
        ),
    },
    pagination: {
      page:
        Math.max(
          1,
          toNumber(
            paginationRow.page,
            1,
          ),
        ),
      pageSize:
        Math.max(
          1,
          toNumber(
            paginationRow.page_size,
            LEADS_PAGE_SIZE,
          ),
        ),
      total:
        Math.max(
          0,
          toNumber(
            paginationRow.total,
          ),
        ),
      totalPages:
        Math.max(
          1,
          toNumber(
            paginationRow.total_pages,
            1,
          ),
        ),
      from:
        Math.max(
          0,
          toNumber(
            paginationRow.from,
          ),
        ),
      to:
        Math.max(
          0,
          toNumber(
            paginationRow.to,
          ),
        ),
    },
    warning: null,
  };
}

async function getLegacyWorkspacePage(
  filters: LeadsWorkspaceFilters,
  warning: string,
): Promise<LeadsWorkspacePageData> {
  const supabase =
    await createClient();

  const [
    leads,
    intelligenceResult,
  ] = await Promise.all([
    getLeads(),
    supabase
      .from(
        "v_pipeline_stage_aging",
      )
      .select(
        `
        lead_id,
        owner_user_id,
        owner_name,
        aging_status,
        stage_entered_at,
        stage_age_hours,
        stage_age_days,
        warning_after_days,
        stuck_after_days,
        days_over_stuck_threshold,
        days_since_last_contact,
        preferred_batch_id,
        batch_code,
        batch_location,
        batch_start_date,
        batch_end_date
      `,
      )
      .order(
        "stage_age_days",
        {
          ascending:
            false,
        },
      )
      .limit(5000),
  ]);

  const intelligence =
    intelligenceResult.error
      ? []
      : (
          intelligenceResult.data ??
          []
        ).map(
          (row) =>
            mapLegacyIntelligenceRow(
              row,
            ),
        );

  const combinedWarning =
    intelligenceResult.error
      ? `${warning} Aging intelligence fallback also failed: ${intelligenceResult.error.message}`
      : warning;

  return buildWorkspacePageFromRows(
    leads,
    intelligence,
    filters,
    combinedWarning,
  );
}

function getMockWorkspacePage(
  filters: LeadsWorkspaceFilters,
): LeadsWorkspacePageData {
  return buildWorkspacePageFromRows(
    mockLeads,
    [],
    filters,
    null,
  );
}

function buildWorkspacePageFromRows(
  leads: LeadOverview[],
  intelligence: LeadListIntelligence[],
  filters: LeadsWorkspaceFilters,
  warning: string | null,
): LeadsWorkspacePageData {
  const now =
    Date.now();

  const intelligenceByLead =
    new Map(
      intelligence.map(
        (row) => [
          row.lead_id,
          row,
        ],
      ),
    );

  const allRows =
    leads.map(
      (lead) => ({
        lead,
        intel:
          intelligenceByLead.get(
            lead.id,
          ) ??
          null,
      }),
    );

  const summary:
    LeadsWorkspaceSummary = {
      all:
        allRows.length,
      unassigned:
        allRows.filter(
          ({ intel }) =>
            !intel?.owner_user_id,
        ).length,
      stuck:
        allRows.filter(
          ({ intel }) =>
            intel?.aging_status ===
            "stuck",
        ).length,
      followupOverdue:
        allRows.filter(
          ({ lead }) =>
            isOverdue(
              lead.nextFollowupAt,
              now,
            ),
        ).length,
      paymentPending:
        allRows.filter(
          ({ lead }) =>
            lead.stage ===
            "payment_pending",
        ).length,
    };

  const filtered =
    allRows.filter(
      ({ lead, intel }) => {
        if (
          filters.stage &&
          lead.stage !==
            filters.stage
        ) {
          return false;
        }

        if (
          filters.source &&
          lead.firstTouchSource !==
            filters.source
        ) {
          return false;
        }

        if (
          filters.channel &&
          lead.currentContactChannel !==
            filters.channel
        ) {
          return false;
        }

        if (
          filters.owner &&
          (
            filters.owner ===
              "__unassigned__"
              ? Boolean(
                  intel?.owner_user_id,
                )
              : intel?.owner_name !==
                filters.owner
          )
        ) {
          return false;
        }

        if (
          filters.course &&
          lead.course !==
            filters.course
        ) {
          return false;
        }

        if (
          filters.aging &&
          (
            intel?.aging_status ??
            "untracked"
          ) !==
            filters.aging
        ) {
          return false;
        }

        if (
          filters.quickView ===
            "unassigned" &&
          intel?.owner_user_id
        ) {
          return false;
        }

        if (
          filters.quickView ===
            "stuck" &&
          intel?.aging_status !==
            "stuck"
        ) {
          return false;
        }

        if (
          filters.quickView ===
            "followup_overdue" &&
          !isOverdue(
            lead.nextFollowupAt,
            now,
          )
        ) {
          return false;
        }

        if (
          filters.quickView ===
            "payment_pending" &&
          lead.stage !==
            "payment_pending"
        ) {
          return false;
        }

        const needle =
          filters.query
            .trim()
            .toLowerCase();

        if (!needle) {
          return true;
        }

        return [
          lead.name,
          lead.leadCode,
          lead.country,
          lead.location,
          lead.course,
          lead.firstTouchSource,
          lead.firstTouchCampaign,
          lead.currentContactChannel,
          intel?.owner_name,
          intel?.batch_code,
          intel?.batch_location,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase()
          .includes(needle);
      },
    );

  filtered.sort(
    (a, b) => {
      if (
        filters.sort ===
        "name"
      ) {
        return (
          a.lead.name || ""
        ).localeCompare(
          b.lead.name || "",
        );
      }

      if (
        filters.sort ===
        "followup_asc"
      ) {
        return (
          sortableDate(
            a.lead.nextFollowupAt,
          ) -
          sortableDate(
            b.lead.nextFollowupAt,
          )
        );
      }

      return (
        toNumber(
          b.intel?.stage_age_days,
        ) -
        toNumber(
          a.intel?.stage_age_days,
        )
      );
    },
  );

  const total =
    filtered.length;

  const totalPages =
    Math.max(
      1,
      Math.ceil(
        total /
          LEADS_PAGE_SIZE,
      ),
    );

  const page =
    Math.min(
      filters.page,
      totalPages,
    );

  const start =
    (page - 1) *
    LEADS_PAGE_SIZE;

  const pageRows =
    filtered.slice(
      start,
      start +
        LEADS_PAGE_SIZE,
    );

  return {
    leads:
      pageRows.map(
        ({ lead }) =>
          lead,
      ),
    intelligence:
      pageRows
        .map(
          ({ intel }) =>
            intel,
        )
        .filter(
          (
            row,
          ): row is
            LeadListIntelligence =>
            Boolean(row),
        ),
    summary,
    options: {
      stages:
        uniqueSorted(
          leads.map(
            (lead) =>
              String(
                lead.stage ||
                  "",
              ),
          ),
        ),
      sources:
        uniqueSorted(
          leads.map(
            (lead) =>
              lead.firstTouchSource ||
              "",
          ),
        ),
      channels:
        uniqueSorted(
          leads.map(
            (lead) =>
              lead.currentContactChannel ||
              "",
          ),
        ),
      owners:
        uniqueSorted(
          intelligence.map(
            (row) =>
              row.owner_name ||
              "",
          ),
        ),
      courses:
        uniqueSorted(
          leads.map(
            (lead) =>
              lead.course || "",
          ),
        ),
    },
    pagination: {
      page,
      pageSize:
        LEADS_PAGE_SIZE,
      total,
      totalPages,
      from:
        total === 0
          ? 0
          : start + 1,
      to:
        Math.min(
          total,
          start +
            LEADS_PAGE_SIZE,
        ),
    },
    warning,
  };
}

function mapLegacyIntelligenceRow(
  input: unknown,
): LeadListIntelligence {
  const row =
    asRecord(input) ?? {};

  const agingStatus =
    stringValue(
      row.aging_status,
    );

  return {
    lead_id:
      stringValue(
        row.lead_id,
      ),
    owner_user_id:
      nullableString(
        row.owner_user_id,
      ),
    owner_name:
      nullableString(
        row.owner_name,
      ),
    aging_status:
      isAgingStatus(
        agingStatus,
      )
        ? agingStatus
        : null,
    stage_entered_at:
      nullableString(
        row.stage_entered_at,
      ),
    stage_age_hours:
      numberish(
        row.stage_age_hours,
      ),
    stage_age_days:
      numberish(
        row.stage_age_days,
      ),
    warning_after_days:
      numberish(
        row.warning_after_days,
      ),
    stuck_after_days:
      numberish(
        row.stuck_after_days,
      ),
    days_over_stuck_threshold:
      numberish(
        row.days_over_stuck_threshold,
      ),
    days_since_last_contact:
      numberish(
        row.days_since_last_contact,
      ),
    preferred_batch_id:
      nullableString(
        row.preferred_batch_id,
      ),
    batch_code:
      nullableString(
        row.batch_code,
      ),
    batch_location:
      nullableString(
        row.batch_location,
      ),
    batch_start_date:
      nullableString(
        row.batch_start_date,
      ),
    batch_end_date:
      nullableString(
        row.batch_end_date,
      ),
  };
}

function mapLeadRow(
  input: unknown,
): LeadOverview {
  const row =
    asRecord(input) ?? {};

  return {
    id:
      String(
        row.id ?? "",
      ),
    leadCode:
      stringValue(
        row.lead_code,
      ),
    name:
      stringValue(
        row.lead_name,
      ) ||
      stringValue(
        row.display_name,
      ) ||
      stringValue(
        row.lead_code,
      ),
    email:
      optionalString(
        row.email,
      ),
    phone:
      optionalString(
        row.phone,
      ),
    course:
      stringValue(
        row.course_name,
      ) ||
      "Not selected",
    location:
      stringValue(
        row.preferred_location,
      ) ||
      "—",
    country:
      stringValue(
        row.country,
      ) ||
      "—",
    stage:
      row.current_stage as LeadOverview["stage"],
    intent:
      row.intent as LeadOverview["intent"],
    firstTouchSource:
      stringValue(
        row.first_touch_source,
      ) ||
      "Unknown",
    firstTouchMedium:
      stringValue(
        row.first_touch_medium,
      ) ||
      "Unknown",
    firstTouchCampaign:
      stringValue(
        row.first_touch_campaign,
      ) ||
      "Unattributed",
    leadCreationChannel:
      (
        row.lead_creation_channel ??
        "other"
      ) as LeadOverview["leadCreationChannel"],
    currentContactChannel:
      (
        row.current_contact_channel ??
        "other"
      ) as LeadOverview["currentContactChannel"],
    owner:
      stringValue(
        row.owner_name,
      ) ||
      (
        row.owner_user_id
          ? "Assigned"
          : "Unassigned"
      ),
    lastContactedAt:
      optionalString(
        row.last_contacted_at,
      ),
    nextFollowupAt:
      optionalString(
        row.next_followup_at,
      ),
    createdAt:
      stringValue(
        row.created_at,
      ),
    value:
      row.enrollment_value ==
      null
        ? undefined
        : toNumber(
            row.enrollment_value,
          ),
    currency:
      optionalString(
        row.enrollment_currency,
      ),
  };
}

function mapIntelligenceRow(
  input: unknown,
): LeadListIntelligence {
  const row =
    asRecord(input) ?? {};

  const agingStatus =
    stringValue(
      row.aging_status,
    );

  return {
    lead_id:
      stringValue(
        row.id,
      ),
    owner_user_id:
      nullableString(
        row.owner_user_id,
      ),
    owner_name:
      nullableString(
        row.owner_name,
      ),
    aging_status:
      isAgingStatus(
        agingStatus,
      )
        ? agingStatus
        : null,
    stage_entered_at:
      nullableString(
        row.stage_entered_at,
      ),
    stage_age_hours:
      numberish(
        row.stage_age_hours,
      ),
    stage_age_days:
      numberish(
        row.stage_age_days,
      ),
    warning_after_days:
      numberish(
        row.warning_after_days,
      ),
    stuck_after_days:
      numberish(
        row.stuck_after_days,
      ),
    days_over_stuck_threshold:
      numberish(
        row.days_over_stuck_threshold,
      ),
    days_since_last_contact:
      numberish(
        row.days_since_last_contact,
      ),
    preferred_batch_id:
      nullableString(
        row.preferred_batch_id,
      ),
    batch_code:
      nullableString(
        row.batch_code,
      ),
    batch_location:
      nullableString(
        row.batch_location,
      ),
    batch_start_date:
      nullableString(
        row.batch_start_date,
      ),
    batch_end_date:
      nullableString(
        row.batch_end_date,
      ),
  };
}

function asRecord(
  value: unknown,
): UnknownRecord | null {
  return (
    value &&
    typeof value ===
      "object" &&
    !Array.isArray(value)
  )
    ? (
        value as
          UnknownRecord
      )
    : null;
}

function arrayFrom(
  value: unknown,
) {
  return Array.isArray(
    value,
  )
    ? value
    : [];
}

function stringArray(
  value: unknown,
) {
  if (
    !Array.isArray(
      value,
    )
  ) {
    return [];
  }

  return value
    .map(
      (item) =>
        stringValue(
          item,
        ).trim(),
    )
    .filter(Boolean);
}

function stringValue(
  value: unknown,
) {
  return value == null
    ? ""
    : String(value);
}

function optionalString(
  value: unknown,
) {
  const result =
    stringValue(
      value,
    ).trim();

  return result ||
    undefined;
}

function nullableString(
  value: unknown,
) {
  const result =
    stringValue(
      value,
    ).trim();

  return result ||
    null;
}

function numberish(
  value: unknown,
):
  | number
  | string
  | null {
  if (
    value === null ||
    value === undefined ||
    value === ""
  ) {
    return null;
  }

  if (
    typeof value ===
    "number"
  ) {
    return value;
  }

  return String(value);
}

function toNumber(
  value: unknown,
  fallback = 0,
) {
  const parsed =
    Number(value);

  return Number.isFinite(
    parsed,
  )
    ? parsed
    : fallback;
}

function isAgingStatus(
  value: string,
): value is
  LeadListIntelligence["aging_status"] & string {
  return (
    value ===
      "healthy" ||
    value ===
      "warning" ||
    value ===
      "stuck" ||
    value ===
      "untracked"
  );
}

function one(
  value: SearchParamValue,
) {
  if (
    Array.isArray(
      value,
    )
  ) {
    return (
      value[0] ??
      ""
    ).trim();
  }

  return (
    value ??
    ""
  ).trim();
}

function normalizeFilter(
  value: string,
) {
  return value ===
    "all"
    ? ""
    : value;
}

function valueOrNull(
  value: string,
) {
  const trimmed =
    value.trim();

  return trimmed ||
    null;
}

function uniqueSorted(
  values: string[],
) {
  return Array.from(
    new Set(
      values
        .map(
          (value) =>
            value.trim(),
        )
        .filter(Boolean),
    ),
  ).sort(
    (a, b) =>
      a.localeCompare(
        b,
      ),
  );
}

function isOverdue(
  value:
    | string
    | null
    | undefined,
  now: number,
) {
  if (!value) {
    return false;
  }

  const time =
    new Date(
      value,
    ).getTime();

  return (
    Number.isFinite(
      time,
    ) &&
    time < now
  );
}

function sortableDate(
  value:
    | string
    | null
    | undefined,
) {
  if (!value) {
    return Number.MAX_SAFE_INTEGER;
  }

  const time =
    new Date(
      value,
    ).getTime();

  return Number.isFinite(
    time,
  )
    ? time
    : Number.MAX_SAFE_INTEGER;
}
