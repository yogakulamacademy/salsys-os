import {
  NextRequest,
  NextResponse,
} from 'next/server';

import {
  syncYogakulamCourseCatalog,
} from '@/lib/integrations/yogakulam-courses';

export const runtime =
  'nodejs';

export const dynamic =
  'force-dynamic';

export const maxDuration =
  60;


function bearerToken(
  request:
    NextRequest
) {
  const authorization =
    request.headers.get(
      'authorization'
    );

  if (
    !authorization
  ) {
    return null;
  }

  const match =
    authorization.match(
      /^Bearer\s+(.+)$/i
    );

  return match?.[1]
    ?.trim()
    || null;
}


function manualAuthorized(
  request:
    NextRequest
) {
  const expected =
    process.env
      .COURSE_CATALOG_SYNC_SECRET
      ?.trim();

  if (!expected) {
    return false;
  }

  const custom =
    request.headers
      .get(
        'x-course-catalog-sync-secret'
      )
      ?.trim();

  const bearer =
    bearerToken(
      request
    );

  return (
    custom === expected
    ||
    bearer === expected
  );
}


function cronAuthorized(
  request:
    NextRequest
) {
  const bearer =
    bearerToken(
      request
    );

  const cronSecret =
    process.env
      .CRON_SECRET
      ?.trim();

  const syncSecret =
    process.env
      .COURSE_CATALOG_SYNC_SECRET
      ?.trim();

  return Boolean(
    bearer
    &&
    (
      bearer ===
        cronSecret
      ||
      bearer ===
        syncSecret
    )
  );
}


export async function POST(
  request:
    NextRequest
) {
  if (
    !manualAuthorized(
      request
    )
  ) {
    return NextResponse.json(
      {
        ok: false,
        error:
          'Unauthorized.',
      },
      {
        status: 401,
      }
    );
  }

  try {
    const result =
      await syncYogakulamCourseCatalog({
        trigger:
          'manual',
      });

    return NextResponse.json(
      result
    );
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : 'Unknown course catalog sync error';

    console.error(
      'Course catalog manual sync failed:',
      error
    );

    return NextResponse.json(
      {
        ok: false,
        error:
          message,
      },
      {
        status: 500,
      }
    );
  }
}


export async function GET(
  request:
    NextRequest
) {
  if (
    !cronAuthorized(
      request
    )
  ) {
    return NextResponse.json(
      {
        ok: false,
        error:
          'Unauthorized.',
      },
      {
        status: 401,
      }
    );
  }

  try {
    const result =
      await syncYogakulamCourseCatalog({
        trigger:
          'cron',
      });

    return NextResponse.json(
      result
    );
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : 'Unknown course catalog sync error';

    console.error(
      'Course catalog cron sync failed:',
      error
    );

    return NextResponse.json(
      {
        ok: false,
        error:
          message,
      },
      {
        status: 500,
      }
    );
  }
}
