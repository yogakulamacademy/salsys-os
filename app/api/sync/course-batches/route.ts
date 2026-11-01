import { NextRequest, NextResponse } from "next/server";

import {
  EducationCatalogSyncConfigurationError,
  syncEducationCatalog,
} from "@/lib/integrations/education-catalog";
import {
  bearerMatchesAnySecret,
  secretMatches,
} from "@/lib/security/machine-bearer-auth";

export const runtime = "nodejs";

export const dynamic = "force-dynamic";

/*
 * Catalog adapters may process batches with bounded concurrency, so they
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

function requestedOrganizationId(request: NextRequest) {
  return request.nextUrl.searchParams.get("organization_id")?.trim() || undefined;
}

function configurationFailure(error: EducationCatalogSyncConfigurationError) {
  return NextResponse.json(
    {
      ok: false,
      code: error.code,
      error: error.message,
    },
    {
      status: error.status,
    },
  );
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
    const result = await syncEducationCatalog({
      trigger: "manual",
      organizationId: requestedOrganizationId(request),
    });

    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof EducationCatalogSyncConfigurationError) {
      return configurationFailure(error);
    }

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
    const result = await syncEducationCatalog({
      trigger: "cron",
      organizationId: requestedOrganizationId(request),
    });

    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof EducationCatalogSyncConfigurationError) {
      return configurationFailure(error);
    }

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
