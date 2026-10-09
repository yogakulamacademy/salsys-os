import {
  NextResponse,
} from 'next/server';

import {
  createClient,
} from '@/lib/supabase/server';

import {
  requireCurrentOrganizationId,
} from '@/lib/workspace';


export const dynamic =
  'force-dynamic';


export async function GET() {
  try {
    const supabase =
      await createClient();

    const {
      data: {
        user,
      },
      error:
        authError,
    } =
      await supabase.auth.getUser();

    if (
      authError ||
      !user
    ) {
      throw new Error(
        'Unable to resolve current organization: user is not authenticated.',
      );
    }

    const organizationId =
      await requireCurrentOrganizationId(
        supabase,
        user.id,
      );


    const [
      healthResult,
      overviewResult,
      campaignsResult,
      keywordsResult,
      searchTermsResult,
      countriesResult,
      devicesResult,
      runsResult,
    ] =
      await Promise.all([
        supabase
          .from(
            'v_google_ads_sync_health'
          )
          .select(
            '*'
          )
          .eq(
            'organization_id',
            organizationId
          )
          .maybeSingle(),

        supabase
          .from(
            'v_google_ads_30d_overview'
          )
          .select(
            '*'
          )
          .eq(
            'organization_id',
            organizationId
          ),

        supabase
          .from(
            'v_google_ads_campaign_30d'
          )
          .select(
            '*',
            {
              count:
                'exact',
              head:
                true,
            }
          )
          .eq(
            'organization_id',
            organizationId
          ),

        supabase
          .from(
            'v_google_ads_keyword_30d'
          )
          .select(
            '*',
            {
              count:
                'exact',
              head:
                true,
            }
          )
          .eq(
            'organization_id',
            organizationId
          ),

        supabase
          .from(
            'v_google_ads_search_term_30d'
          )
          .select(
            '*',
            {
              count:
                'exact',
              head:
                true,
            }
          )
          .eq(
            'organization_id',
            organizationId
          ),

        supabase
          .from(
            'v_google_ads_country_30d'
          )
          .select(
            '*',
            {
              count:
                'exact',
              head:
                true,
            }
          )
          .eq(
            'organization_id',
            organizationId
          ),

        supabase
          .from(
            'v_google_ads_device_30d'
          )
          .select(
            '*',
            {
              count:
                'exact',
              head:
                true,
            }
          )
          .eq(
            'organization_id',
            organizationId
          ),

        supabase
          .from(
            'google_ads_sync_runs'
          )
          .select(`
            id,
            customer_id,
            start_date,
            end_date,
            status,
            triggered_by,
            campaign_rows,
            ad_group_rows,
            keyword_rows,
            search_term_rows,
            geo_rows,
            device_rows,
            total_rows,
            error_message,
            started_at,
            completed_at
          `)
          .eq(
            'organization_id',
            organizationId
          )
          .order(
            'started_at',
            {
              ascending:
                false,
            }
          )
          .limit(
            10
          ),
      ]);


    const errors =
      [
        healthResult.error,
        overviewResult.error,
        campaignsResult.error,
        keywordsResult.error,
        searchTermsResult.error,
        countriesResult.error,
        devicesResult.error,
        runsResult.error,
      ]
        .filter(
          Boolean
        );


    if (
      errors.length >
      0
    ) {
      throw new Error(
        errors
          .map(
            (
              error
            ) =>
              error
                ?.message
          )
          .join(
            ' | '
          )
      );
    }


    return NextResponse.json({
      ok:
        true,

      health:
        healthResult
          .data ??
        null,

      overview:
        overviewResult
          .data ??
        [],

      counts: {
        campaigns:
          campaignsResult
            .count ??
          0,

        keywords:
          keywordsResult
            .count ??
          0,

        searchTerms:
          searchTermsResult
            .count ??
          0,

        countries:
          countriesResult
            .count ??
          0,

        devices:
          devicesResult
            .count ??
          0,
      },

      recentRuns:
        runsResult
          .data ??
        [],
    });

  } catch (
    error
  ) {
    const message =
      error instanceof Error
        ? error.message
        : 'Unknown Google Ads health error';


    console.error(
      'Google Ads health check failed:',
      error
    );


    return NextResponse.json(
      {
        ok:
          false,

        error:
          message,
      },
      {
        status:
          500,
      }
    );
  }
}
