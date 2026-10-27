import { NextRequest, NextResponse } from "next/server";

import { syncYogakulamCourseCatalog } from "@/lib/integrations/yogakulam-courses";
import {
  bearerMatchesAnySecret,
  secretMatches,
} from "@/lib/security/machine-bearer-auth";

export const runtime = "nodejs";

export const dynamic = "force-dynamic";

/*
 * The catalog sync now processes batches with bounded concurrency, so it
 * should normally finish well below 60 seconds. A longer duration is still
 * requested for deployments/plans that allow it.
 */
export const maxDuration = 300;

function manualAuthorized(request: NextRequest) {
  const expected = process.env.COURSE_CATALOG_SYNC_SECRET?.trim();

  if (!expected) {
    return false;
  }

  const custom = request.headers.get("x-course-catalog-sync-secret");

  return (
    secretMatches(custom, expected) ||
    bearerMatchesAnySecret(request.headers.get("authorization"), [expected])
  );
}

function cronAuthorized(request: NextRequest) {
  const secrets = [
    process.env.CRON_SECRET?.trim(),
    process.env.COURSE_CATALOG_SYNC_SECRET?.trim(),
  ].filter((secret): secret is string => Boolean(secret));

  return bearerMatchesAnySecret(request.headers.get("authorization"), secrets);
}

export async function POST(request: NextRequest) {
  if (!manualAuthorized(request)) {
    return NextResponse.json(
      {
        ok: false,
        error: "Unauthorized.",
      },
      {
        status: 401,
      },
    );
  }

  try {
    const result = await syncYogakulamCourseCatalog({
      trigger: "manual",
    });

    return NextResponse.json(result);
  } catch (error) {
    console.error("Course catalog manual sync failed:", error);

    return NextResponse.json(
      {
        ok: false,
        error: "Course catalog sync failed.",
      },
      {
        status: 500,
      },
    );
  }
}

export async function GET(request: NextRequest) {
  if (!cronAuthorized(request)) {
    return NextResponse.json(
      {
        ok: false,
        error: "Unauthorized.",
      },
      {
        status: 401,
      },
    );
  }

  try {
    const result = await syncYogakulamCourseCatalog({
      trigger: "cron",
    });

    return NextResponse.json(result);
  } catch (error) {
    console.error("Course catalog cron sync failed:", error);

    return NextResponse.json(
      {
        ok: false,
        error: "Course catalog sync failed.",
      },
      {
        status: 500,
      },
    );
  }
}
