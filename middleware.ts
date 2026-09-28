import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';


// These routes must be reachable without a Supabase user session.
// Each public integration endpoint protects itself at route level.
const PUBLIC_EXACT_PATHS =
  new Set([
    '/login',
    '/yogakulam-tracker.js',
    '/api/leads/capture',
    '/api/analytics/ga4/sync',
    '/api/analytics/gsc/sync',
    '/api/analytics/google-ads/sync',
    '/api/analytics/meta-ads/sync',
    '/api/admissions/auto-tasks',
  ]);


function isPublicPath(
  pathname: string
) {
  const normalizedPath =
    pathname.length > 1 &&
    pathname.endsWith('/')
      ? pathname.slice(
          0,
          -1
        )
      : pathname;


  if (
    PUBLIC_EXACT_PATHS.has(
      normalizedPath
    )
  ) {
    return true;
  }


  if (
    normalizedPath.startsWith(
      '/api/tracking/'
    )
  ) {
    return true;
  }


  return false;
}


export async function middleware(
  request: NextRequest
) {
  if (
    process.env
      .NEXT_PUBLIC_USE_MOCK_DATA !==
    'false'
  ) {
    return NextResponse.next();
  }


  if (
    isPublicPath(
      request.nextUrl.pathname
    )
  ) {
    return NextResponse.next();
  }


  const url =
    process.env
      .NEXT_PUBLIC_SUPABASE_URL;


  const key =
    process.env
      .NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
    process.env
      .NEXT_PUBLIC_SUPABASE_ANON_KEY;


  if (
    !url ||
    !key
  ) {
    return NextResponse.next();
  }


  let response =
    NextResponse.next({
      request,
    });


  const supabase =
    createServerClient(
      url,
      key,
      {
        cookies: {
          getAll() {
            return request
              .cookies
              .getAll();
          },

          setAll(
            cookiesToSet
          ) {
            cookiesToSet
              .forEach(
                ({
                  name,
                  value,
                }) =>
                  request
                    .cookies
                    .set(
                      name,
                      value
                    )
              );


            response =
              NextResponse.next({
                request,
              });


            cookiesToSet
              .forEach(
                ({
                  name,
                  value,
                  options,
                }) =>
                  response
                    .cookies
                    .set(
                      name,
                      value,
                      options
                    )
              );
          },
        },
      }
    );


  const {
    data,
  } =
    await supabase
      .auth
      .getClaims();


  const isAuthenticated =
    Boolean(
      data
        ?.claims
        ?.sub
    );


  if (
    !isAuthenticated
  ) {
    const redirectUrl =
      request.nextUrl
        .clone();


    redirectUrl.pathname =
      '/login';


    redirectUrl
      .searchParams
      .set(
        'next',
        request.nextUrl.pathname
      );


    return NextResponse.redirect(
      redirectUrl
    );
  }


  if (
    request.nextUrl.pathname ===
    '/login'
  ) {
    const redirectUrl =
      request.nextUrl
        .clone();


    redirectUrl.pathname =
      '/dashboard';


    redirectUrl.search =
      '';


    return NextResponse.redirect(
      redirectUrl
    );
  }


  return response;
}


export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
