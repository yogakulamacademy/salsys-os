import { createHash } from "crypto";

import { createAdminClient } from "@/lib/supabase/admin";

const SOURCE_SYSTEM = "yogakulam_website";

const BATCH_SYNC_CONCURRENCY = 8;
const STALE_RUN_AFTER_MS = 2 * 60 * 1000;
const WEBSITE_FEED_TIMEOUT_MS = 20_000;

type WebsiteCourse = {
  external_course_id?: string;

  course_key?: string;

  course_name?: string;

  location_key?: string;

  location?: string;

  mode?: string;

  batches?: WebsiteBatch[];
};

type WebsiteBatch = {
  external_batch_id?: string;

  external_course_id?: string;

  course_key?: string;

  course_name?: string;

  location_key?: string;

  location?: string;

  mode?: string;

  start_date?: string | null;

  end_date?: string | null;

  schedule_time?: string | null;

  timezone?: string | null;
};

type WebsiteFeed = {
  success?: boolean;

  read_only?: boolean;

  source?: string;

  generated_at?: string;

  summary?: {
    locations?: number;

    courses?: number;

    batches?: number;
  };

  courses?: WebsiteCourse[];

  batches?: WebsiteBatch[];
};

type SyncTrigger = "manual" | "cron" | "webhook";

type CourseRow = {
  id: string;

  code: string;

  name: string;
};

type ExistingBatchRow = {
  id: string;

  batch_code: string | null;

  location: string | null;

  mode: string | null;

  metadata: Record<string, unknown> | null;

  source_system: string | null;

  external_batch_id: string | null;
};

export type CourseCatalogSyncResult = {
  ok: true;

  sourceSystem: string;

  runId: string;

  trigger: SyncTrigger;

  feedGeneratedAt: string | null;

  coursesReceived: number;

  batchesReceived: number;

  batchesEligible: number;

  batchesSkippedPast: number;

  coursesCreated: number;

  batchesInserted: number;

  batchesUpdated: number;

  batchesAdopted: number;

  batchesDeactivated: number;

  parseWarnings: string[];
};

const COURSE_CODE_MAP: Record<string, string> = {
  "100hr-yttc": "100H-YTT",

  "200hr-yttc": "200H-YTT",

  "200hr-weekdays-yttc": "200H-YTT",

  "200hr-weekend-yttc": "200H-YTT",

  "300hr-yttc": "300H-YTT",

  "500hr-yttc": "500H-YTT",

  "prenatal-yttc": "85H-PRENATAL",

  "kundalini-yttc": "100H-KUNDALINI",

  "sound-healing-yttc-level1": "SOUND-L1",

  "sound-healing-level1-yttc": "SOUND-L1",

  "sound-healing-yttc-level2": "SOUND-L2",

  "sound-healing-level2-yttc": "SOUND-L2",

  "sound-healing-meditation-master-course": "SOUND-MASTER",

  "kids-yttc": "KIDS-YOGA",

  "face-yttc": "FACE-YOGA",

  "nutrition-yttc": "NUTRITION",

  "yoga-retreat": "YOGA-RETREAT",

  "ayurveda-retreat": "AYURVEDA-RETREAT",
};

const ONLINE_COURSE_CODE_MAP: Record<string, string> = {
  "200hr-yttc": "ONLINE-200H",

  "prenatal-yttc": "ONLINE-PRENATAL",

  "kids-yttc": "KIDS-YOGA",

  "face-yttc": "FACE-YOGA",

  "nutrition-yttc": "NUTRITION",
};

const COURSE_NAME_BY_CODE: Record<string, string> = {
  "100H-YTT": "100-Hour Yoga Teacher Training",

  "200H-YTT": "200-Hour Yoga Teacher Training",

  "300H-YTT": "300-Hour Yoga Teacher Training",

  "500H-YTT": "500-Hour Yoga Teacher Training",

  "85H-PRENATAL": "85-Hour Prenatal & Postnatal Yoga TTC",

  "100H-KUNDALINI": "100-Hour Tantra & Kundalini YTT",

  "SOUND-L1": "Sound Healing Level 1",

  "SOUND-L2": "Sound Healing Level 2",

  "SOUND-MASTER": "Sound Healing Meditation Master Course",

  "ONLINE-200H": "Online 200-Hour Yoga Teacher Training",

  "ONLINE-PRENATAL": "Online Prenatal & Postnatal TTC",

  "KIDS-YOGA": "Online Kids Yoga TTC",

  "FACE-YOGA": "Online Face Yoga TTC",

  NUTRITION: "Nutrition Course",

  "YOGA-RETREAT": "Yoga Retreat",

  "AYURVEDA-RETREAT": "Ayurveda Retreat",
};

function websiteCourseFeedUrl() {
  return (
    process.env.YOGAKULAM_COURSE_FEED_URL?.trim() ||
    "https\://www.yogakulam.com/api/crm/course-batches.php"
  );
}

async function resolveCourseSyncOrganizationId({
  supabase,

  feedUrl,
}: {
  supabase: ReturnType<typeof createAdminClient>;

  feedUrl: string;
}) {
  let hostname: string;

  try {
    hostname = new URL(feedUrl).hostname.toLowerCase();
  } catch {
    throw new Error(`Invalid course feed URL: ${feedUrl}`);
  }

  const { data: site, error } = await supabase

    .from("organization_sites")

    .select("organization_id")

    .eq("hostname", hostname)

    .maybeSingle();

  if (error) {
    throw new Error(
      `Unable to resolve organization for ${hostname}: ${error.message}`,
    );
  }

  if (!site?.organization_id) {
    throw new Error(`No organization site mapping exists for ${hostname}`);
  }

  return String(site.organization_id);
}

async function prepareCourseCatalogSyncRun({
  supabase,
  organizationId,
}: {
  supabase: ReturnType<typeof createAdminClient>;
  organizationId: string;
}) {
  const now = new Date();
  const staleBefore = new Date(
    now.getTime() - STALE_RUN_AFTER_MS,
  ).toISOString();

  const { error: staleError } = await supabase
    .from("course_catalog_sync_runs")
    .update({
      status: "failed",
      error_message: "Marked stale before a new course catalog sync started.",
      completed_at: now.toISOString(),
    })
    .eq("organization_id", organizationId)
    .eq("source_system", SOURCE_SYSTEM)
    .eq("status", "running")
    .lt("started_at", staleBefore);

  if (staleError) {
    throw new Error(
      `Unable to close stale course sync runs: ${staleError.message}`,
    );
  }

  const { data: activeRuns, error: activeError } = await supabase
    .from("course_catalog_sync_runs")
    .select("id,started_at")
    .eq("organization_id", organizationId)
    .eq("source_system", SOURCE_SYSTEM)
    .eq("status", "running")
    .gte("started_at", staleBefore)
    .order("started_at", { ascending: false })
    .limit(1);

  if (activeError) {
    throw new Error(
      `Unable to check active course sync runs: ${activeError.message}`,
    );
  }

  if (activeRuns && activeRuns.length > 0) {
    throw new Error(
      `A course catalog sync is already running (${activeRuns[0].id}).`,
    );
  }
}

async function updateCourseCatalogSyncProgress({
  supabase,
  organizationId,
  runId,
  coursesReceived,
  batchesReceived,
  coursesCreated,
  batchesInserted,
  batchesUpdated,
  batchesAdopted,
  eligibleBatches,
  skippedPastBatches,
  processedBatches,
}: {
  supabase: ReturnType<typeof createAdminClient>;
  organizationId: string;
  runId: string;
  coursesReceived: number;
  batchesReceived: number;
  coursesCreated: number;
  batchesInserted: number;
  batchesUpdated: number;
  batchesAdopted: number;
  eligibleBatches: number;
  skippedPastBatches: number;
  processedBatches: number;
}) {
  const { error } = await supabase
    .from("course_catalog_sync_runs")
    .update({
      courses_received: coursesReceived,
      batches_received: batchesReceived,
      courses_upserted: coursesCreated,
      batches_upserted: batchesInserted + batchesUpdated + batchesAdopted,
      request_metadata: {
        phase: "processing_batches",
        eligible_batches: eligibleBatches,
        skipped_past_batches: skippedPastBatches,
        processed_batches: processedBatches,
        inserted: batchesInserted,
        updated: batchesUpdated,
        adopted_existing: batchesAdopted,
      },
    })
    .eq("organization_id", organizationId)
    .eq("id", runId);

  if (error) {
    throw new Error(`Unable to update course sync progress: ${error.message}`);
  }
}

export async function syncYogakulamCourseCatalog({
  trigger,
}: {
  trigger: SyncTrigger;
}): Promise<CourseCatalogSyncResult> {
  const supabase = createAdminClient();

  const feedUrl = websiteCourseFeedUrl();

  const organizationId = await resolveCourseSyncOrganizationId({
    supabase,
    feedUrl,
  });

  await prepareCourseCatalogSyncRun({
    supabase,
    organizationId,
  });

  const { data: run, error: runError } = await supabase
    .from("course_catalog_sync_runs")
    .insert({
      organization_id: organizationId,
      source_system: SOURCE_SYSTEM,
      status: "running",
      trigger_type: trigger,
    })
    .select("id")
    .single();

  if (runError || !run) {
    throw new Error(
      `Unable to create course sync run: ${
        runError?.message ?? "Unknown error"
      }`,
    );
  }

  const runId = String(run.id);

  try {
    const feed = await fetchWebsiteCourseFeed(feedUrl);

    if (feed.success !== true || !Array.isArray(feed.batches)) {
      throw new Error("Website course feed returned an invalid response.");
    }

    const batchesReceived = feed.batches.length;

    const coursesReceived = Array.isArray(feed.courses)
      ? feed.courses.length
      : countUniqueCourses(feed.batches);

    const today = todayIsoUtc();

    const eligibleBatches = feed.batches.filter((batch) =>
      isCurrentOrFutureBatch(batch, today),
    );

    const batchesSkippedPast = batchesReceived - eligibleBatches.length;

    const courseCache = new Map<string, CourseRow>();

    let coursesCreated = 0;
    let batchesInserted = 0;
    let batchesUpdated = 0;
    let batchesAdopted = 0;

    const parseWarnings: string[] = [];

    const preparedBatches: Array<{
      batch: WebsiteBatch;
      course: CourseRow;
      parsedTime: ReturnType<typeof parseScheduleTime>;
    }> = [];

    /*
     * Resolve courses sequentially first.
     *
     * This keeps course creation/cache behavior deterministic and avoids
     * concurrent inserts for the same tenant-scoped course code.
     */
    for (const batch of eligibleBatches) {
      validateWebsiteBatch(batch);

      const resolved = await resolveCourse({
        supabase,
        organizationId,
        batch,
        cache: courseCache,
      });

      if (resolved.created) {
        coursesCreated += 1;
      }

      const parsedTime = parseScheduleTime(batch.schedule_time ?? null);

      if (batch.schedule_time && !parsedTime) {
        parseWarnings.push(
          `${batch.location ?? batch.location_key ?? "Unknown location"} / ${
            batch.course_key ?? "Unknown course"
          }: unable to parse time "${batch.schedule_time}"`,
        );
      }

      preparedBatches.push({
        batch,
        course: resolved.course,
        parsedTime,
      });
    }

    await updateCourseCatalogSyncProgress({
      supabase,
      organizationId,
      runId,
      coursesReceived,
      batchesReceived,
      coursesCreated,
      batchesInserted,
      batchesUpdated,
      batchesAdopted,
      eligibleBatches: eligibleBatches.length,
      skippedPastBatches: batchesSkippedPast,
      processedBatches: 0,
    });

    /*
     * Batch rows are independent once their course has been resolved.
     * Process a small number in parallel so the sync comfortably finishes
     * inside short serverless request limits without flooding Supabase.
     */
    for (
      let index = 0;
      index < preparedBatches.length;
      index += BATCH_SYNC_CONCURRENCY
    ) {
      const chunk = preparedBatches.slice(
        index,
        index + BATCH_SYNC_CONCURRENCY,
      );

      const results = await Promise.all(
        chunk.map(({ batch, course, parsedTime }) =>
          syncOneBatch({
            supabase,
            organizationId,
            runId,
            course,
            batch,
            parsedTime,
          }),
        ),
      );

      for (const result of results) {
        if (result === "inserted") {
          batchesInserted += 1;
        } else if (result === "adopted") {
          batchesAdopted += 1;
        } else {
          batchesUpdated += 1;
        }
      }

      const processedBatches = Math.min(
        index + chunk.length,
        preparedBatches.length,
      );

      await updateCourseCatalogSyncProgress({
        supabase,
        organizationId,
        runId,
        coursesReceived,
        batchesReceived,
        coursesCreated,
        batchesInserted,
        batchesUpdated,
        batchesAdopted,
        eligibleBatches: eligibleBatches.length,
        skippedPastBatches: batchesSkippedPast,
        processedBatches,
      });
    }

    const { data: deactivated, error: finalizeError } = await supabase.rpc(
      "finalize_course_catalog_sync",
      {
        p_run_id: runId,
        p_source_system: SOURCE_SYSTEM,
        p_organization_id: organizationId,
      },
    );

    if (finalizeError) {
      throw new Error(
        `Unable to finalize course sync: ${finalizeError.message}`,
      );
    }

    const batchesDeactivated = Number(deactivated ?? 0);

    const completedAt = new Date().toISOString();

    const { error: finishError } = await supabase
      .from("course_catalog_sync_runs")
      .update({
        status: "success",
        courses_received: coursesReceived,
        batches_received: batchesReceived,
        courses_upserted: coursesCreated,
        batches_upserted: batchesInserted + batchesUpdated + batchesAdopted,
        batches_deactivated: batchesDeactivated,
        request_metadata: {
          feed_generated_at: feed.generated_at ?? null,
          feed_source: feed.source ?? null,
          feed_read_only: feed.read_only ?? null,
          eligible_batches: eligibleBatches.length,
          skipped_past_batches: batchesSkippedPast,
          processed_batches: preparedBatches.length,
          inserted: batchesInserted,
          updated: batchesUpdated,
          adopted_existing: batchesAdopted,
          parse_warnings: parseWarnings.slice(0, 50),
        },
        completed_at: completedAt,
      })
      .eq("organization_id", organizationId)
      .eq("id", runId);

    if (finishError) {
      throw new Error(
        `Course data synced, but sync run could not be completed: ${finishError.message}`,
      );
    }

    return {
      ok: true,
      sourceSystem: SOURCE_SYSTEM,
      runId,
      trigger,
      feedGeneratedAt: feed.generated_at ?? null,
      coursesReceived,
      batchesReceived,
      batchesEligible: eligibleBatches.length,
      batchesSkippedPast,
      coursesCreated,
      batchesInserted,
      batchesUpdated,
      batchesAdopted,
      batchesDeactivated,
      parseWarnings,
    };
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Unknown course catalog sync error";

    const { error: markFailedError } = await supabase
      .from("course_catalog_sync_runs")
      .update({
        status: "failed",
        error_message: message,
        completed_at: new Date().toISOString(),
      })
      .eq("organization_id", organizationId)
      .eq("id", runId);

    if (markFailedError) {
      console.error(
        "Unable to mark course catalog sync as failed:",
        markFailedError,
      );
    }

    throw error;
  }
}

async function fetchWebsiteCourseFeed(feedUrl: string): Promise<WebsiteFeed> {
  const websiteSecret =
    process.env.YOGAKULAM_CRM_WEBSITE_SECRET?.trim() ||
    process.env.WEBSITE_LEAD_CAPTURE_SECRET?.trim();

  if (!websiteSecret) {
    throw new Error(
      "YOGAKULAM_CRM_WEBSITE_SECRET or WEBSITE_LEAD_CAPTURE_SECRET is not configured.",
    );
  }

  const controller = new AbortController();

  const timeout = setTimeout(() => controller.abort(), WEBSITE_FEED_TIMEOUT_MS);

  let response: Response;

  try {
    response = await fetch(feedUrl, {
      method: "GET",
      headers: {
        Accept: "application/json",
        "X-Yogakulam-CRM-Secret": websiteSecret,
      },
      cache: "no-store",
      signal: controller.signal,
    });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error(
        `Website course feed timed out after ${WEBSITE_FEED_TIMEOUT_MS / 1000} seconds.`,
      );
    }

    throw error;
  } finally {
    clearTimeout(timeout);
  }

  const raw = await response.text();

  if (!response.ok) {
    throw new Error(
      `Website course feed returned HTTP ${response.status}: ${raw.slice(
        0,
        300,
      )}`,
    );
  }

  let parsed: WebsiteFeed;

  try {
    parsed = JSON.parse(raw) as WebsiteFeed;
  } catch {
    throw new Error(
      `Website course feed did not return valid JSON: ${raw.slice(0, 300)}`,
    );
  }

  return parsed;
}

async function resolveCourse({
  supabase,

  organizationId,

  batch,

  cache,
}: {
  supabase: ReturnType<typeof createAdminClient>;

  organizationId: string;

  batch: WebsiteBatch;

  cache: Map<string, CourseRow>;
}) {
  const courseKey = normalizeKey(batch.course_key ?? "");

  const locationKey = normalizeKey(batch.location_key ?? "");

  const code = resolveCourseCode(courseKey, locationKey);

  const cached = cache.get(code);

  if (cached) {
    return {
      course: cached,

      created: false,
    };
  }

  const { data: existing, error: existingError } = await supabase

    .from("courses")

    .select("id,code,name")

    .eq("organization_id", organizationId)

    .eq("code", code)

    .maybeSingle();

  if (existingError) {
    throw new Error(`Unable to find course ${code}: ${existingError.message}`);
  }

  if (existing) {
    const course = existing as CourseRow;

    cache.set(code, course);

    return {
      course,

      created: false,
    };
  }

  const fallbackName =
    COURSE_NAME_BY_CODE[code] || batch.course_name || humanize(courseKey);

  const { data: created, error: createError } = await supabase

    .from("courses")

    .insert({
      organization_id: organizationId,

      code,

      name: fallbackName,

      active: true,

      source_system: SOURCE_SYSTEM,

      external_course_id: courseKey || code.toLowerCase(),

      last_synced_at: new Date().toISOString(),

      metadata: {
        created_from: "website_course_schedule",

        website_course_key: courseKey || null,
      },
    })

    .select("id,code,name")

    .single();

  if (createError || !created) {
    throw new Error(
      `Unable to create course ${code}: ${
        createError?.message ?? "Unknown error"
      }`,
    );
  }

  const course = created as CourseRow;

  cache.set(code, course);

  return {
    course,

    created: true,
  };
}

async function syncOneBatch({
  supabase,

  organizationId,

  runId,

  course,

  batch,

  parsedTime,
}: {
  supabase: ReturnType<typeof createAdminClient>;

  organizationId: string;

  runId: string;

  course: CourseRow;

  batch: WebsiteBatch;

  parsedTime: {
    startTime: string;

    endTime: string;
  } | null;
}) {
  const externalBatchId = String(batch.external_batch_id ?? "").trim();

  if (!externalBatchId) {
    throw new Error("Website batch is missing external_batch_id.");
  }

  const now = new Date().toISOString();

  const { data: synced, error: syncedError } = await supabase

    .from("course_batches")

    .select(
      "id,batch_code,location,mode,metadata,source_system,external_batch_id",
    )

    .eq("organization_id", organizationId)

    .eq("source_system", SOURCE_SYSTEM)

    .eq("external_batch_id", externalBatchId)

    .maybeSingle();

  if (syncedError) {
    throw new Error(
      `Unable to find synced batch ${externalBatchId}: ${syncedError.message}`,
    );
  }

  if (synced) {
    await updateExistingBatch({
      supabase,

      organizationId,

      row: synced as ExistingBatchRow,

      runId,

      batch,

      parsedTime,

      now,

      adopt: false,
    });

    return "updated" as const;
  }

  const adoptable = await findAdoptableExistingBatch({
    supabase,

    organizationId,

    courseId: course.id,

    batch,
  });

  if (adoptable) {
    await updateExistingBatch({
      supabase,

      organizationId,

      row: adoptable,

      runId,

      batch,

      parsedTime,

      now,

      adopt: true,
    });

    return "adopted" as const;
  }

  const batchCode = websiteBatchCode(batch, externalBatchId);

  const { error: insertError } = await supabase.from("course_batches").insert({
    organization_id: organizationId,

    course_id: course.id,

    batch_code: batchCode,

    location: batch.location ?? humanize(batch.location_key ?? ""),

    mode: normalizeMode(batch.mode),

    start_date: batch.start_date ?? null,

    end_date: batch.end_date ?? null,

    start_time: parsedTime?.startTime ?? null,

    end_time: parsedTime?.endTime ?? null,

    timezone: batch.timezone ?? "Asia/Kolkata",

    source_system: SOURCE_SYSTEM,

    external_batch_id: externalBatchId,

    source_active: true,

    local_enabled: true,

    source_updated_at: null,

    last_synced_at: now,

    last_sync_run_id: runId,

    metadata: websiteBatchMetadata({}, batch),
  });

  if (insertError) {
    throw new Error(
      `Unable to insert website batch ${batchCode}: ${insertError.message}`,
    );
  }

  return "inserted" as const;
}

async function findAdoptableExistingBatch({
  supabase,

  organizationId,

  courseId,

  batch,
}: {
  supabase: ReturnType<typeof createAdminClient>;

  organizationId: string;

  courseId: string;

  batch: WebsiteBatch;
}): Promise<ExistingBatchRow | null> {
  if (!batch.start_date || !batch.end_date) {
    return null;
  }

  const { data, error } = await supabase

    .from("course_batches")

    .select(
      "id,batch_code,location,mode,metadata,source_system,external_batch_id",
    )

    .eq("organization_id", organizationId)

    .eq("course_id", courseId)

    .eq("start_date", batch.start_date)

    .eq("end_date", batch.end_date)

    .is("source_system", null)

    .limit(10);

  if (error) {
    throw new Error(
      `Unable to look for an existing matching batch: ${error.message}`,
    );
  }

  const candidates = (data ?? []) as ExistingBatchRow[];

  if (candidates.length === 0) {
    return null;
  }

  const locationKey = normalizeKey(batch.location_key ?? batch.location ?? "");

  const preferred = candidates.find((candidate) =>
    locationLooksCompatible(candidate.location, candidate.mode, locationKey),
  );

  if (preferred) {
    return preferred;
  }

  if (candidates.length === 1) {
    return candidates[0];
  }

  return null;
}

async function updateExistingBatch({
  supabase,

  organizationId,

  row,

  runId,

  batch,

  parsedTime,

  now,

  adopt,
}: {
  supabase: ReturnType<typeof createAdminClient>;

  organizationId: string;

  row: ExistingBatchRow;

  runId: string;

  batch: WebsiteBatch;

  parsedTime: {
    startTime: string;

    endTime: string;
  } | null;

  now: string;

  adopt: boolean;
}) {
  const existingMetadata =
    row.metadata && typeof row.metadata === "object" ? row.metadata : {};

  const { error } = await supabase

    .from("course_batches")

    .update({
      /*

      | Dates/time are owned by the website schedule.

      */

      start_date: batch.start_date ?? null,

      end_date: batch.end_date ?? null,

      start_time: parsedTime?.startTime ?? null,

      end_time: parsedTime?.endTime ?? null,

      timezone: batch.timezone ?? "Asia/Kolkata",

      /*

      | Preserve a more specific CRM location/mode if one already exists.

      | Example: "Varkala, Kerala" is more useful than the feed's "Kerala".

      */

      location:
        row.location || batch.location || humanize(batch.location_key ?? ""),

      mode: row.mode || normalizeMode(batch.mode),

      source_system: SOURCE_SYSTEM,

      external_batch_id: batch.external_batch_id,

      source_active: true,

      last_synced_at: now,

      last_sync_run_id: runId,

      metadata: websiteBatchMetadata(existingMetadata, batch),
    })

    .eq("organization_id", organizationId)

    .eq("id", row.id);

  if (error) {
    throw new Error(
      `${
        adopt
          ? "Unable to adopt existing CRM batch"
          : "Unable to update website batch"
      } ${row.batch_code ?? row.id}: ${error.message}`,
    );
  }
}

function websiteBatchMetadata(
  existing: Record<string, unknown>,

  batch: WebsiteBatch,
) {
  return {
    ...existing,

    website_schedule: {
      source: SOURCE_SYSTEM,

      external_course_id: batch.external_course_id ?? null,

      course_key: batch.course_key ?? null,

      location_key: batch.location_key ?? null,

      schedule_time: batch.schedule_time ?? null,
    },
  };
}

function resolveCourseCode(courseKey: string, locationKey: string) {
  if (locationKey === "online-course") {
    const onlineCode = ONLINE_COURSE_CODE_MAP[courseKey];

    if (onlineCode) {
      return onlineCode;
    }
  }

  const mapped = COURSE_CODE_MAP[courseKey];

  if (mapped) {
    return mapped;
  }

  return `WEB-${slug(courseKey || "COURSE").toUpperCase()}`.slice(0, 80);
}

function normalizeMode(value: string | undefined) {
  const normalized = normalizeKey(value ?? "");

  if (normalized === "online") {
    return "online";
  }

  if (normalized === "non-residential" || normalized === "non_residential") {
    return "non_residential";
  }

  if (normalized === "hybrid") {
    return "hybrid";
  }

  return "residential";
}

function parseScheduleTime(value: string | null) {
  if (!value) {
    return null;
  }

  const normalized = value.replace(/\s+/g, " ").trim();

  const match = normalized.match(
    /^(\d{1,2})(?::(\d{2}))?\s*(AM|PM)\s+TO\s+(\d{1,2})(?::(\d{2}))?\s*(AM|PM)(?:\s+[A-Z/+_-]+)?$/i,
  );

  if (!match) {
    return null;
  }

  const startTime = to24HourTime(
    Number(match[1]),

    Number(match[2] ?? 0),

    match[3],
  );

  const endTime = to24HourTime(
    Number(match[4]),

    Number(match[5] ?? 0),

    match[6],
  );

  if (!startTime || !endTime) {
    return null;
  }

  return {
    startTime,

    endTime,
  };
}

function to24HourTime(hour: number, minute: number, meridiem: string) {
  if (hour < 1 || hour > 12 || minute < 0 || minute > 59) {
    return null;
  }

  let normalizedHour = hour % 12;

  if (meridiem.toUpperCase() === "PM") {
    normalizedHour += 12;
  }

  return `${String(normalizedHour).padStart(2, "0")}:${String(minute).padStart(
    2,

    "0",
  )}:00`;
}

function websiteBatchCode(batch: WebsiteBatch, externalBatchId: string) {
  const location = slug(batch.location_key ?? batch.location ?? "WEB")
    .toUpperCase()

    .slice(0, 18);

  const course = slug(batch.course_key ?? "COURSE")
    .toUpperCase()

    .slice(0, 28);

  const start = (batch.start_date ?? "NO-DATE").replaceAll("-", "");

  const suffix = createHash("sha1")
    .update(externalBatchId)

    .digest("hex")

    .slice(0, 6)

    .toUpperCase();

  return `WEB-${location}-${course}-${start}-${suffix}`;
}

function isCurrentOrFutureBatch(batch: WebsiteBatch, today: string) {
  const end = batch.end_date ?? batch.start_date;

  if (!end) {
    return true;
  }

  return end >= today;
}

function todayIsoUtc() {
  return new Date().toISOString().slice(0, 10);
}

function locationLooksCompatible(
  location: string | null,

  mode: string | null,

  locationKey: string,
) {
  const haystack = normalizeKey(`${location ?? ""} ${mode ?? ""}`);

  if (locationKey === "online-course") {
    return haystack.includes("online");
  }

  if (locationKey === "bengaluru") {
    return haystack.includes("bengaluru") || haystack.includes("bangalore");
  }

  return haystack.includes(locationKey);
}

function validateWebsiteBatch(batch: WebsiteBatch) {
  if (!batch.external_batch_id) {
    throw new Error("Website feed contains a batch without external_batch_id.");
  }

  if (!batch.course_key) {
    throw new Error(
      `Website batch ${batch.external_batch_id} is missing course_key.`,
    );
  }

  if (!batch.start_date) {
    throw new Error(
      `Website batch ${batch.external_batch_id} is missing start_date.`,
    );
  }
}

function countUniqueCourses(batches: WebsiteBatch[]) {
  return new Set(
    batches.map(
      (batch) => `${batch.location_key ?? ""}:${batch.course_key ?? ""}`,
    ),
  ).size;
}

function normalizeKey(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, "-");
}

function slug(value: string) {
  return value

    .trim()

    .replace(/[^a-zA-Z0-9]+/g, "-")

    .replace(/^-+|-+$/g, "");
}

function humanize(value: string) {
  return value

    .replace(/[-_]+/g, " ")

    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}
