import "server-only";

import {
  timingSafeEqual,
} from "node:crypto";

import {
  NextRequest,
  NextResponse,
} from "next/server";

import {
  runConfiguredConversionFeedbackCycle,
  runScheduledConversionFeedback,
} from "@/lib/conversion-feedback/orchestrator";


export const dynamic =
  "force-dynamic";

export const runtime =
  "nodejs";

export const maxDuration =
  300;


const DEFAULT_LIMIT =
  25;

const DEFAULT_LEASE_SECONDS =
  300;

const DEFAULT_ENQUEUE_LIMIT =
  500;

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;


type RequestBody = {
  organizationId?: unknown;
  limit?: unknown;
  leaseSeconds?: unknown;
  enqueueLimit?: unknown;
};


function constantTimeEqual(
  left: string,
  right: string,
) {
  const leftBuffer =
    Buffer.from(
      left,
      "utf8",
    );

  const rightBuffer =
    Buffer.from(
      right,
      "utf8",
    );

  if (
    leftBuffer.length !==
    rightBuffer.length
  ) {
    return false;
  }

  return timingSafeEqual(
    leftBuffer,
    rightBuffer,
  );
}


function authorizationState(
  request: NextRequest,
  configuredSecrets:
    Array<
      string | undefined
    >,
) {
  const secrets =
    configuredSecrets
      .map(
        (value) =>
          value?.trim() ??
          "",
      )
      .filter(Boolean);

  if (secrets.length === 0) {
    return {
      configured: false,
      authorized: false,
    };
  }

  const authorization =
    request.headers
      .get(
        "authorization",
      )
      ?.trim() ??
    "";

  const match =
    authorization.match(
      /^Bearer\s+(.+)$/i,
    );

  const suppliedSecret =
    match?.[1]?.trim() ??
    "";

  return {
    configured: true,

    authorized:
      Boolean(
        suppliedSecret,
      ) &&
      secrets.some(
        (expectedSecret) =>
          constantTimeEqual(
            suppliedSecret,
            expectedSecret,
          ),
      ),
  };
}


function optionalInteger(
  value: unknown,
  fallback: number,
) {
  if (
    value === undefined ||
    value === null
  ) {
    return fallback;
  }

  if (
    typeof value !== "number" ||
    !Number.isInteger(value)
  ) {
    return null;
  }

  return value;
}


function unauthorizedResponse(
  configured: boolean,
) {
  if (!configured) {
    return NextResponse.json(
      {
        ok: false,
        error:
          "Conversion feedback runner is not configured.",
      },
      {
        status: 503,
      },
    );
  }

  return NextResponse.json(
    {
      ok: false,
      error:
        "Unauthorized",
    },
    {
      status: 401,
    },
  );
}


/*
 * Vercel Cron invokes this route with GET and sends CRON_SECRET
 * as a Bearer token when that project environment variable exists.
 *
 * The scheduled path discovers only organizations that have active
 * conversion-feedback routes. Queue materialization remains tenant-scoped,
 * and provider payloads / match identifiers are never returned here.
 */
export async function GET(
  request: NextRequest,
) {
  const auth =
    authorizationState(
      request,
      [
        process.env
          .CRON_SECRET,
      ],
    );

  if (!auth.authorized) {
    return unauthorizedResponse(
      auth.configured,
    );
  }

  try {
    const report =
      await runScheduledConversionFeedback({
        limit:
          DEFAULT_LIMIT,
        leaseSeconds:
          DEFAULT_LEASE_SECONDS,
        enqueueLimit:
          DEFAULT_ENQUEUE_LIMIT,
      });

    return NextResponse.json(
      {
        ok:
          report.failed === 0,
        trigger:
          "cron",
        report,
      },
      {
        status:
          report.failed === 0
            ? 200
            : 500,
      },
    );
  } catch (error) {
    console.error(
      "Conversion feedback scheduled run failed.",
      error,
    );

    return NextResponse.json(
      {
        ok: false,
        error:
          "Conversion feedback scheduled run failed.",
      },
      {
        status: 500,
      },
    );
  }
}


/*
 * Manual / service-level execution is organization-scoped and intentionally
 * uses its own credential. CRON_SECRET is reserved for the scheduled GET path
 * and cannot be used to authorize arbitrary manual organization runs.
 */
export async function POST(
  request: NextRequest,
) {
  const auth =
    authorizationState(
      request,
      [
        process.env
          .CONVERSION_FEEDBACK_RUN_SECRET,
      ],
    );

  if (!auth.authorized) {
    return unauthorizedResponse(
      auth.configured,
    );
  }


  let body:
    RequestBody;

  try {
    body =
      await request.json() as
        RequestBody;
  } catch {
    return NextResponse.json(
      {
        ok: false,
        error:
          "Request body must be valid JSON.",
      },
      {
        status: 400,
      },
    );
  }


  const organizationId =
    typeof body.organizationId ===
      "string"
      ? body.organizationId.trim()
      : "";

  if (
    !UUID_PATTERN.test(
      organizationId,
    )
  ) {
    return NextResponse.json(
      {
        ok: false,
        error:
          "organizationId must be a valid UUID.",
      },
      {
        status: 400,
      },
    );
  }


  const limit =
    optionalInteger(
      body.limit,
      DEFAULT_LIMIT,
    );

  if (
    limit === null ||
    limit < 1 ||
    limit > 100
  ) {
    return NextResponse.json(
      {
        ok: false,
        error:
          "limit must be an integer between 1 and 100.",
      },
      {
        status: 400,
      },
    );
  }


  const leaseSeconds =
    optionalInteger(
      body.leaseSeconds,
      DEFAULT_LEASE_SECONDS,
    );

  if (
    leaseSeconds === null ||
    leaseSeconds < 30 ||
    leaseSeconds > 3600
  ) {
    return NextResponse.json(
      {
        ok: false,
        error:
          "leaseSeconds must be an integer between 30 and 3600.",
      },
      {
        status: 400,
      },
    );
  }


  const enqueueLimit =
    optionalInteger(
      body.enqueueLimit,
      DEFAULT_ENQUEUE_LIMIT,
    );

  if (
    enqueueLimit === null ||
    enqueueLimit < 1 ||
    enqueueLimit > 5000
  ) {
    return NextResponse.json(
      {
        ok: false,
        error:
          "enqueueLimit must be an integer between 1 and 5000.",
      },
      {
        status: 400,
      },
    );
  }


  try {
    const cycle =
      await runConfiguredConversionFeedbackCycle({
        organizationId,
        limit,
        leaseSeconds,
        enqueueLimit,
      });

    /*
     * Only operational counts are returned. Provider request bodies,
     * identifiers, consent evidence and credentials stay server-side.
     */
    return NextResponse.json({
      ok: true,
      trigger:
        "manual",
      report: {
        organizationId:
          cycle.organizationId,

        enqueue: {
          candidateCount:
            cycle.enqueue.candidateCount,

          insertedCount:
            cycle.enqueue.insertedCount,

          alreadyQueuedCount:
            cycle.enqueue.alreadyQueuedCount,
        },

        claimed:
          cycle.worker.claimed,

        delivered:
          cycle.worker.delivered,

        skipped:
          cycle.worker.skipped,

        retryableFailed:
          cycle.worker.retryableFailed,

        permanentFailed:
          cycle.worker.permanentFailed,

        leaseLost:
          cycle.worker.leaseLost,

        finalizationErrors:
          cycle.worker.finalizationErrors,
      },
    });
  } catch (error) {
    console.error(
      "Conversion feedback manual run failed.",
      error,
    );

    return NextResponse.json(
      {
        ok: false,
        error:
          "Conversion feedback run failed.",
      },
      {
        status: 500,
      },
    );
  }
}
