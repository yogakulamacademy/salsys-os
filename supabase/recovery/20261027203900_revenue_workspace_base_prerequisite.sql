CREATE OR REPLACE FUNCTION public.get_revenue_workspace(p_current_month text, p_organization_id uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$

with

params as (
    select coalesce(
        nullif(p_current_month, ''),
        to_char(
            now() at time zone 'UTC',
            'YYYY-MM'
        )
    ) as current_month
),

/* ============================================================
   ORGANIZATION-SCOPED FORECAST
============================================================ */

forecast as (
    select
        id,
        lead_code,
        lead_name,
        current_stage,
        preferred_location,
        preferred_month,
        preferred_mode,
        first_touch_source,
        first_touch_medium,
        first_touch_campaign,
        lead_creation_channel,
        expected_close_date,
        created_at,
        potential_value,
        currency,
        probability,
        weighted_value,
        actual_revenue,
        forecast_month

    from public.v_revenue_forecast

    where organization_id = p_organization_id
),

/* ============================================================
   ORGANIZATION-SCOPED PAYMENT STATUS
============================================================ */

lead_payment as (
    select
        lead_id,
        net_paid

    from public.v_lead_revenue_status

    where organization_id = p_organization_id
),

forecast_paid as (
    select
        f.*,

        upper(
            coalesce(
                f.currency,
                ''
            )
        ) as currency_norm,

        coalesce(
            nullif(
                f.first_touch_source,
                ''
            ),
            'Unknown'
        ) as source_norm,

        coalesce(
            nullif(
                f.preferred_location,
                ''
            ),
            'Unknown'
        ) as location_norm,

        coalesce(
            p.net_paid,
            0
        ) as net_paid

    from forecast f

    left join lead_payment p
        on p.lead_id = f.id
),

open_valued as (
    select *

    from forecast_paid

    where current_stage not in (
        'enrolled',
        'lost',
        'unqualified',
        'duplicate'
    )

    and coalesce(
        potential_value,
        0
    ) > 0
),

/* ============================================================
   CURRENCIES PRESENT IN THIS ORGANIZATION
============================================================ */

currency_list as (

    select distinct
        currency_norm as currency

    from forecast_paid

    where currency_norm <> ''

    union

    select distinct
        upper(
            coalesce(
                currency,
                ''
            )
        )

    from public.v_actual_revenue_by_currency

    where organization_id = p_organization_id
      and upper(
          coalesce(
              currency,
              ''
          )
      ) <> ''

    union

    select distinct
        upper(
            coalesce(
                currency,
                ''
            )
        )

    from public.v_outstanding_revenue_by_currency

    where organization_id = p_organization_id
      and upper(
          coalesce(
              currency,
              ''
          )
      ) <> ''

    union

    select distinct
        upper(
            coalesce(
                currency,
                ''
            )
        )

    from public.v_actual_revenue_monthly

    where organization_id = p_organization_id
      and upper(
          coalesce(
              currency,
              ''
          )
      ) <> ''

    union

    select 'INR'

    union

    select 'USD'
),

stage_collected as (
    select
        currency_norm as currency,
        current_stage,
        sum(net_paid) as net_collected

    from forecast_paid

    group by
        currency_norm,
        current_stage
),

month_collected as (
    select
        currency_norm as currency,
        forecast_month::text as forecast_month,
        sum(net_paid) as net_collected

    from forecast_paid

    group by
        currency_norm,
        forecast_month::text
),

source_collected as (
    select
        currency_norm as currency,
        source_norm as source,
        sum(net_paid) as net_collected

    from forecast_paid

    group by
        currency_norm,
        source_norm
),

location_collected as (
    select
        currency_norm as currency,
        location_norm as location,
        sum(net_paid) as net_collected

    from forecast_paid

    group by
        currency_norm,
        location_norm
)

select jsonb_build_object(

    /* ========================================================
       TOTALS BY CURRENCY
    ======================================================== */

    'totals_by_currency',

    coalesce(
        (
            select jsonb_agg(
                to_jsonb(x)

                order by
                    case x.currency
                        when 'INR' then 0
                        when 'USD' then 1
                        else 2
                    end,
                    x.currency
            )

            from (
                select
                    c.currency,

                    coalesce(
                        (
                            select sum(
                                coalesce(
                                    o.potential_value,
                                    0
                                )
                            )

                            from open_valued o

                            where o.currency_norm =
                                  c.currency
                        ),
                        0
                    ) as pipeline,

                    coalesce(
                        (
                            select sum(
                                coalesce(
                                    o.weighted_value,
                                    0
                                )
                            )

                            from open_valued o

                            where o.currency_norm =
                                  c.currency
                        ),
                        0
                    ) as weighted,

                    coalesce(
                        (
                            select a.actual_revenue

                            from public.v_actual_revenue_by_currency a

                            where a.organization_id =
                                  p_organization_id

                              and upper(
                                  coalesce(
                                      a.currency,
                                      ''
                                  )
                              ) = c.currency

                            limit 1
                        ),
                        0
                    ) as actual,

                    coalesce(
                        (
                            select a.gross_received

                            from public.v_actual_revenue_by_currency a

                            where a.organization_id =
                                  p_organization_id

                              and upper(
                                  coalesce(
                                      a.currency,
                                      ''
                                  )
                              ) = c.currency

                            limit 1
                        ),
                        0
                    ) as gross,

                    coalesce(
                        (
                            select a.refunds

                            from public.v_actual_revenue_by_currency a

                            where a.organization_id =
                                  p_organization_id

                              and upper(
                                  coalesce(
                                      a.currency,
                                      ''
                                  )
                              ) = c.currency

                            limit 1
                        ),
                        0
                    ) as refunds,

                    coalesce(
                        (
                            select o.outstanding_revenue

                            from public.v_outstanding_revenue_by_currency o

                            where o.organization_id =
                                  p_organization_id

                              and upper(
                                  coalesce(
                                      o.currency,
                                      ''
                                  )
                              ) = c.currency

                            limit 1
                        ),
                        0
                    ) as outstanding,

                    coalesce(
                        (
                            select o.leads_with_balance

                            from public.v_outstanding_revenue_by_currency o

                            where o.organization_id =
                                  p_organization_id

                              and upper(
                                  coalesce(
                                      o.currency,
                                      ''
                                  )
                              ) = c.currency

                            limit 1
                        ),
                        0
                    ) as "balanceLeads",

                    coalesce(
                        (
                            select a.successful_payments

                            from public.v_actual_revenue_by_currency a

                            where a.organization_id =
                                  p_organization_id

                              and upper(
                                  coalesce(
                                      a.currency,
                                      ''
                                  )
                              ) = c.currency

                            limit 1
                        ),
                        0
                    ) as "successfulPayments",

                    (
                        select count(*)

                        from open_valued o

                        where o.currency_norm =
                              c.currency
                    ) as opportunities

                from currency_list c

            ) x
        ),

        '[]'::jsonb
    ),

    /* ========================================================
       UNVALUED LEADS
    ======================================================== */

    'unvalued_leads',

    (
        select count(*)

        from forecast_paid

        where current_stage not in (
            'enrolled',
            'lost',
            'unqualified',
            'duplicate'
        )

        and coalesce(
            potential_value,
            0
        ) <= 0
    ),

    /* ========================================================
       STAGES
    ======================================================== */

    'stages',

    coalesce(
        (
            select jsonb_agg(
                to_jsonb(x)
            )

            from (
                select
                    s.currency,
                    s.current_stage,
                    s.lead_count,
                    s.pipeline_value,
                    s.weighted_forecast,

                    coalesce(
                        c.net_collected,
                        0
                    ) as net_collected

                from public.v_revenue_forecast_by_stage s

                left join stage_collected c
                    on c.currency =
                       upper(
                           coalesce(
                               s.currency,
                               ''
                           )
                       )

                   and c.current_stage =
                       s.current_stage

                where s.organization_id =
                      p_organization_id

            ) x
        ),

        '[]'::jsonb
    ),

    /* ========================================================
       MONTHLY
    ======================================================== */

    'monthly',

    coalesce(
        (
            select jsonb_agg(
                to_jsonb(x)

                order by
                    x.forecast_month asc
            )

            from (
                select
                    m.forecast_month,
                    m.currency,
                    m.lead_count,
                    m.pipeline_value,
                    m.weighted_forecast,

                    coalesce(
                        c.net_collected,
                        0
                    ) as net_collected

                from public.v_revenue_forecast_monthly m

                left join month_collected c
                    on c.currency =
                       upper(
                           coalesce(
                               m.currency,
                               ''
                           )
                       )

                   and c.forecast_month =
                       m.forecast_month::text

                where m.organization_id =
                      p_organization_id

            ) x
        ),

        '[]'::jsonb
    ),

    /* ========================================================
       SOURCES
    ======================================================== */

    'sources',

    coalesce(
        (
            select jsonb_agg(
                to_jsonb(x)
            )

            from (
                select
                    s.source,
                    s.currency,
                    s.lead_count,
                    s.pipeline_value,
                    s.weighted_forecast,

                    coalesce(
                        c.net_collected,
                        0
                    ) as net_collected

                from public.v_revenue_forecast_by_source s

                left join source_collected c
                    on c.currency =
                       upper(
                           coalesce(
                               s.currency,
                               ''
                           )
                       )

                   and c.source =
                       coalesce(
                           nullif(
                               s.source,
                               ''
                           ),
                           'Unknown'
                       )

                where s.organization_id =
                      p_organization_id

            ) x
        ),

        '[]'::jsonb
    ),

    /* ========================================================
       LOCATIONS
    ======================================================== */

    'locations',

    coalesce(
        (
            select jsonb_agg(
                to_jsonb(x)
            )

            from (
                select
                    l.location,
                    l.currency,
                    l.lead_count,
                    l.pipeline_value,
                    l.weighted_forecast,

                    coalesce(
                        c.net_collected,
                        0
                    ) as net_collected

                from public.v_revenue_forecast_by_location l

                left join location_collected c
                    on c.currency =
                       upper(
                           coalesce(
                               l.currency,
                               ''
                           )
                       )

                   and c.location =
                       coalesce(
                           nullif(
                               l.location,
                               ''
                           ),
                           'Unknown'
                       )

                where l.organization_id =
                      p_organization_id

            ) x
        ),

        '[]'::jsonb
    ),

    /* ========================================================
       ACTUAL REVENUE MONTHLY
    ======================================================== */

    'actual_monthly',

    coalesce(
        (
            select jsonb_agg(
                to_jsonb(x)

                order by
                    x.revenue_month asc
            )

            from (
                select
                    revenue_month,
                    currency,
                    gross_received,
                    refunds,
                    actual_revenue,
                    successful_payments

                from public.v_actual_revenue_monthly

                where organization_id =
                      p_organization_id

            ) x
        ),

        '[]'::jsonb
    ),

    /* ========================================================
       TOP OPPORTUNITIES
    ======================================================== */

    'top_opportunities',

    coalesce(
        (
            select jsonb_agg(
                to_jsonb(x)
            )

            from (
                select
                    id,
                    lead_code,
                    lead_name,
                    current_stage,
                    preferred_location,
                    first_touch_source,
                    potential_value,
                    currency,
                    weighted_value,
                    net_paid

                from open_valued

                order by
                    coalesce(
                        weighted_value,
                        0
                    ) desc

                limit 10

            ) x
        ),

        '[]'::jsonb
    ),

    /* ========================================================
       CLOSING THIS MONTH
    ======================================================== */

    'closing_this_month',

    coalesce(
        (
            select jsonb_agg(
                to_jsonb(x)
            )

            from (
                select
                    f.id,
                    f.lead_code,
                    f.lead_name,
                    f.current_stage,
                    f.preferred_location,
                    f.first_touch_source,
                    f.expected_close_date,
                    f.potential_value,
                    f.currency,
                    f.weighted_value,
                    f.net_paid

                from forecast_paid f

                cross join params p

                where f.expected_close_date
                      is not null

                  and f.current_stage not in (
                      'enrolled',
                      'lost',
                      'unqualified',
                      'duplicate'
                  )

                  and left(
                      f.expected_close_date::text,
                      7
                  ) = p.current_month

                order by
                    coalesce(
                        f.weighted_value,
                        0
                    ) desc

            ) x
        ),

        '[]'::jsonb
    )

);

$function$
