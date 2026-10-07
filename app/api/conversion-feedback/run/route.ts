import "server-only";

import {
  timingSafeEqual,
} from "node:crypto";

import {
  NextRequest,
  NextResponse,
} from "next/server";

import {
  runConfiguredConversionFeedbackWorker,
} from "@/lib/conversion-feedback/configured-worker";


export const dynamic =
  "force-dynamic";

export const runtime =
  "nodejs";


const DEFAULT_LIMIT =
  25;

const DEFAULT_LEASE_SECONDS =
  300;

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;


type RequestBody = {
  organizationId?: unknown;
  limit?: unknown;
  leaseSeconds?: unknown;
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
) {
  const expectedSecret =
    process.env
      .CONVERSION_FEEDBACK_RUN_SECRET
      ?.trim() ??
    "";

  if (!expectedSecret) {
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
      constantTimeEqual(
        suppliedSecret,
        expectedSecret,
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


export async function POST(
  request: NextRequest,
) {
  const auth =
    authorizationState(
      request,
    );

  if (!auth.configured) {
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

  if (!auth.authorized) {
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


  try {
    const report =
      await runConfiguredConversionFeedbackWorker({
        organizationId,
        limit,
        leaseSeconds,
      });

    /*
     * Worker reports contain only operational counts.
     * Provider payloads, match identifiers and credentials
     * are intentionally never returned by this route.
     */
    return NextResponse.json({
      ok: true,
      report: {
        organizationId:
          report.organizationId,

        claimed:
          report.claimed,

        delivered:
          report.delivered,

        skipped:
          report.skipped,

        retryableFailed:
          report.retryableFailed,

        permanentFailed:
          report.permanentFailed,

        leaseLost:
          report.leaseLost,

        finalizationErrors:
          report.finalizationErrors,
      },
    });
  } catch {
    /*
     * Do not expose queue, database, provider or credential
     * internals through this service-level endpoint.
     */
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