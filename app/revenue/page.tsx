import Link from 'next/link';



import type { ReactNode } from 'react';



import {

  ArrowRight,

  Banknote,

  CircleDollarSign,

  MapPin,

  Target,

  TrendingUp,

  Users,

} from 'lucide-react';



import { createClient } from '@/lib/supabase/server';

import { PageHeader } from '@/components/ui';

import { RevenueInsights } from '@/components/revenue-insights';





type ForecastRow = {

  id: string;

  lead_code: string;

  lead_name: string | null;

  current_stage: string;

  preferred_location: string | null;

  preferred_month: string | null;

  preferred_mode: string | null;

  first_touch_source: string | null;

  first_touch_medium: string | null;

  first_touch_campaign: string | null;

  lead_creation_channel: string | null;

  expected_close_date: string | null;

  created_at: string;



  potential_value: number | string | null;

  currency: string | null;

  probability: number | string | null;

  weighted_value: number | string | null;

  actual_revenue: number | string | null;

  forecast_month: string | null;

};





type StageRow = {

  currency: string;

  current_stage: string;

  lead_count: number | string;

  pipeline_value: number | string | null;

  weighted_forecast: number | string | null;

  actual_revenue: number | string | null;

};





type MonthlyRow = {

  forecast_month: string;

  currency: string;

  lead_count: number | string;

  pipeline_value: number | string | null;

  weighted_forecast: number | string | null;

  actual_revenue: number | string | null;

};





type SourceRow = {

  source: string;

  currency: string;

  lead_count: number | string;

  pipeline_value: number | string | null;

  weighted_forecast: number | string | null;

  actual_revenue: number | string | null;

};





type LocationRow = {

  location: string;

  currency: string;

  lead_count: number | string;

  pipeline_value: number | string | null;

  weighted_forecast: number | string | null;

  actual_revenue: number | string | null;

};





type ActualRevenueRow = {

  currency: string;

  gross_received: number | string | null;

  refunds: number | string | null;

  actual_revenue: number | string | null;

  successful_payments: number | string | null;

  refund_transactions: number | string | null;

};





type ActualRevenueMonthlyRow = {

  revenue_month: string;

  currency: string;

  gross_received: number | string | null;

  refunds: number | string | null;

  actual_revenue: number | string | null;

  successful_payments: number | string | null;

};





type LeadRevenueStatusRow = {

  lead_id: string;

  lead_code: string;

  lead_name: string | null;

  current_stage: string;

  potential_value: number | string | null;

  currency: string | null;

  gross_paid: number | string | null;

  refunds: number | string | null;

  net_paid: number | string | null;

  outstanding_balance: number | string | null;

  payment_status: string;

};





type OutstandingRevenueRow = {

  currency: string;

  leads_with_balance: number | string | null;

  outstanding_revenue: number | string | null;

};





export default async function RevenuePage() {

  const supabase = await createClient();

  const fxRatePromise = getUsdInrRate();



  const [

    forecastResult,

    stageResult,

    monthlyResult,

    sourceResult,

    locationResult,

    actualRevenueResult,

    actualMonthlyResult,

    leadRevenueStatusResult,

    outstandingResult,

  ] = await Promise.all([

    supabase

      .from('v_revenue_forecast')

      .select('*')

      .order('created_at', {

        ascending: false,

      }),



    supabase

      .from('v_revenue_forecast_by_stage')

      .select('*'),



    supabase

      .from('v_revenue_forecast_monthly')

      .select('*')

      .order('forecast_month', {

        ascending: true,

      }),



    supabase

      .from('v_revenue_forecast_by_source')

      .select('*'),



    supabase

      .from('v_revenue_forecast_by_location')

      .select('*'),



    supabase

      .from('v_actual_revenue_by_currency')

      .select('*'),



    supabase

      .from('v_actual_revenue_monthly')

      .select('*')

      .order('revenue_month', {

        ascending: true,

      }),



    supabase

      .from('v_lead_revenue_status')

      .select('*'),



    supabase

      .from('v_outstanding_revenue_by_currency')

      .select('*'),

  ]);





  

  const fxRate = await fxRatePromise;
if (forecastResult.error) {

    throw new Error(

      `Unable to load revenue forecast: ${forecastResult.error.message}`

    );

  }



  if (stageResult.error) {

    throw new Error(

      `Unable to load stage forecast: ${stageResult.error.message}`

    );

  }



  if (monthlyResult.error) {

    throw new Error(

      `Unable to load monthly forecast: ${monthlyResult.error.message}`

    );

  }



  if (sourceResult.error) {

    throw new Error(

      `Unable to load source forecast: ${sourceResult.error.message}`

    );

  }



  if (locationResult.error) {

    throw new Error(

      `Unable to load location forecast: ${locationResult.error.message}`

    );

  }



  if (actualRevenueResult.error) {

    throw new Error(

      `Unable to load actual revenue: ${actualRevenueResult.error.message}`

    );

  }



  if (actualMonthlyResult.error) {

    throw new Error(

      `Unable to load monthly actual revenue: ${actualMonthlyResult.error.message}`

    );

  }



  if (leadRevenueStatusResult.error) {

    throw new Error(

      `Unable to load lead payment status: ${leadRevenueStatusResult.error.message}`

    );

  }



  if (outstandingResult.error) {

    throw new Error(

      `Unable to load outstanding revenue: ${outstandingResult.error.message}`

    );

  }





  const forecasts =

    (forecastResult.data ?? []) as ForecastRow[];



  const stages =

    (stageResult.data ?? []) as StageRow[];



  const monthly =

    (monthlyResult.data ?? []) as MonthlyRow[];



  const sources =

    (sourceResult.data ?? []) as SourceRow[];



  const locations =

    (locationResult.data ?? []) as LocationRow[];



  const actualRevenue =

    (actualRevenueResult.data ?? []) as ActualRevenueRow[];



  const actualMonthly =

    (actualMonthlyResult.data ?? []) as ActualRevenueMonthlyRow[];



  const leadRevenueStatus =

    (leadRevenueStatusResult.data ?? []) as LeadRevenueStatusRow[];



  const outstanding =

    (outstandingResult.data ?? []) as OutstandingRevenueRow[];





  /*

   * Payment data is kept separate from forecast values.

   * A lead's actual revenue comes from paid payments minus refunds.

   */

  const paymentByLead =

    new Map<string, LeadRevenueStatusRow>();



  for (const row of leadRevenueStatus) {

    paymentByLead.set(

      row.lead_id,

      row

    );

  }





  const actualByCurrency =

    new Map<string, ActualRevenueRow>();



  for (const row of actualRevenue) {

    actualByCurrency.set(

      normalizeCurrency(row.currency),

      row

    );

  }





  const outstandingByCurrency =

    new Map<string, OutstandingRevenueRow>();



  for (const row of outstanding) {

    outstandingByCurrency.set(

      normalizeCurrency(row.currency),

      row

    );

  }





  /*

   * Keep INR and USD independent.

   * Never add ₹ and $ together until an FX layer exists.

   */

  const currencies = Array.from(

    new Set(

      [

        ...forecasts.map(

          (row) =>

            normalizeCurrency(row.currency)

        ),



        ...actualRevenue.map(

          (row) =>

            normalizeCurrency(row.currency)

        ),



        ...outstanding.map(

          (row) =>

            normalizeCurrency(row.currency)

        ),



        ...actualMonthly.map(

          (row) =>

            normalizeCurrency(row.currency)

        ),

      ].filter(Boolean)

    )

  );





  if (!currencies.includes('INR')) {

    currencies.unshift('INR');

  }



  if (!currencies.includes('USD')) {

    currencies.push('USD');

  }





  /*

   * Stages that are no longer open opportunities.

   */

  const closedStages = new Set([

    'enrolled',

    'lost',

    'unqualified',

    'duplicate',

  ]);





  function netPaidForLead(

    leadId: string

  ) {

    return toNumber(

      paymentByLead.get(

        leadId

      )?.net_paid

    );

  }





  function netPaidForForecastRows(

    rows: ForecastRow[]

  ) {

    return sum(

      rows.map(

        (row) =>

          netPaidForLead(

            row.id

          )

      )

    );

  }





  function netCollectedByStage(

    stage: string,

    currency: string

  ) {

    return netPaidForForecastRows(

      forecasts.filter(

        (row) =>

          normalizeCurrency(

            row.currency

          ) === currency &&

          row.current_stage === stage

      )

    );

  }





  function netCollectedByForecastMonth(

    forecastMonth: string,

    currency: string

  ) {

    return netPaidForForecastRows(

      forecasts.filter(

        (row) =>

          normalizeCurrency(

            row.currency

          ) === currency &&

          row.forecast_month === forecastMonth

      )

    );

  }





  function netCollectedBySource(

    source: string,

    currency: string

  ) {

    return netPaidForForecastRows(

      forecasts.filter(

        (row) =>

          normalizeCurrency(

            row.currency

          ) === currency &&

          (

            row.first_touch_source ||

            'Unknown'

          ) === source

      )

    );

  }





  function netCollectedByLocation(

    location: string,

    currency: string

  ) {

    return netPaidForForecastRows(

      forecasts.filter(

        (row) =>

          normalizeCurrency(

            row.currency

          ) === currency &&

          (

            row.preferred_location ||

            'Unknown'

          ) === location

      )

    );

  }





  const totalsByCurrency =

    currencies.map(

      (currency) => {



        const rows =

          forecasts.filter(

            (row) =>

              normalizeCurrency(

                row.currency

              ) === currency

          );





        const valuedRows =

          rows.filter(

            (row) =>

              toNumber(

                row.potential_value

              ) > 0

          );





        const openRows =

          valuedRows.filter(

            (row) =>

              !closedStages.has(

                String(

                  row.current_stage

                )

              )

          );





        const actual =

          actualByCurrency.get(

            currency

          );





        const balance =

          outstandingByCurrency.get(

            currency

          );





        return {

          currency,



          pipeline:

            sum(

              openRows.map(

                (row) =>

                  row.potential_value

              )

            ),



          weighted:

            sum(

              openRows.map(

                (row) =>

                  row.weighted_value

              )

            ),



          actual:

            toNumber(

              actual?.actual_revenue

            ),



          gross:

            toNumber(

              actual?.gross_received

            ),



          refunds:

            toNumber(

              actual?.refunds

            ),



          outstanding:

            toNumber(

              balance

                ?.outstanding_revenue

            ),



          balanceLeads:

            toNumber(

              balance

                ?.leads_with_balance

            ),



          successfulPayments:

            toNumber(

              actual

                ?.successful_payments

            ),



          opportunities:

            openRows.length,

        };

      }

    );





  const unvaluedLeads =

    forecasts.filter(

      (row) =>

        !closedStages.has(

          String(

            row.current_stage

          )

        ) &&

        toNumber(

          row.potential_value

        ) <= 0

    ).length;





  const topOpportunities =

    [...forecasts]

      .filter(

        (row) =>

          !closedStages.has(

            String(

              row.current_stage

            )

          ) &&

          toNumber(

            row.potential_value

          ) > 0

      )

      .sort(

        (a, b) =>

          toNumber(

            b.weighted_value

          ) -

          toNumber(

            a.weighted_value

          )

      )

      .slice(

        0,

        10

      );





  const currentMonth =

    new Date()

      .toISOString()

      .slice(

        0,

        7

      );





  const closingThisMonth =

    forecasts

      .filter(

        (row) => {



          if (

            !row

              .expected_close_date

          ) {

            return false;

          }



          if (

            closedStages.has(

              String(

                row.current_stage

              )

            )

          ) {

            return false;

          }



          return (

            row

              .expected_close_date

              .slice(

                0,

                7

              ) === currentMonth

          );

        }

      )

      .sort(

        (a, b) =>

          toNumber(

            b.weighted_value

          ) -

          toNumber(

            a.weighted_value

          )

      );





  const cashMonths =

    actualMonthly.filter(

      (row) =>

        toNumber(

          row.gross_received

        ) > 0 ||

        toNumber(

          row.refunds

        ) > 0 ||

        toNumber(

          row.actual_revenue

        ) !== 0

    );




  /*
   * Interactive chart datasets.
   * These reuse the same forecast/payment calculations already used by the
   * detailed tables below, so charts and tables stay financially consistent.
   */
  const stageChartData =

    stages

      .map(

        (row) => {

          const currency =

            normalizeCurrency(

              row.currency

            );



          return {

            currency,

            stage:

              pretty(

                row.current_stage

              ),

            leads:

              toNumber(

                row.lead_count

              ),

            pipeline:

              toNumber(

                row.pipeline_value

              ),

            weighted:

              toNumber(

                row.weighted_forecast

              ),

            collected:

              netCollectedByStage(

                row.current_stage,

                currency

              ),

          };

        }

      )

      .filter(

        (row) =>

          row.pipeline !== 0 ||

          row.weighted !== 0 ||

          row.collected !== 0

      );



  const monthlyChartData =

    monthly

      .map(

        (row) => {

          const currency =

            normalizeCurrency(

              row.currency

            );



          return {

            currency,

            month:

              row.forecast_month,

            monthLabel:

              formatMonthShort(

                row.forecast_month

              ),

            leads:

              toNumber(

                row.lead_count

              ),

            pipeline:

              toNumber(

                row.pipeline_value

              ),

            weighted:

              toNumber(

                row.weighted_forecast

              ),

            collected:

              netCollectedByForecastMonth(

                row.forecast_month,

                currency

              ),

          };

        }

      )

      .filter(

        (row) =>

          row.pipeline !== 0 ||

          row.weighted !== 0 ||

          row.collected !== 0

      );



  const sourceChartData =

    sources

      .map(

        (row) => {

          const currency =

            normalizeCurrency(

              row.currency

            );



          return {

            currency,

            name:

              pretty(

                row.source ||

                'Unknown'

              ),

            leads:

              toNumber(

                row.lead_count

              ),

            pipeline:

              toNumber(

                row.pipeline_value

              ),

            weighted:

              toNumber(

                row.weighted_forecast

              ),

            collected:

              netCollectedBySource(

                row.source ||

                'Unknown',

                currency

              ),

          };

        }

      )

      .filter(

        (row) =>

          row.pipeline !== 0 ||

          row.weighted !== 0 ||

          row.collected !== 0

      );



  const locationChartData =

    locations

      .map(

        (row) => {

          const currency =

            normalizeCurrency(

              row.currency

            );



          return {

            currency,

            name:

              row.location ||

              'Unknown',

            leads:

              toNumber(

                row.lead_count

              ),

            pipeline:

              toNumber(

                row.pipeline_value

              ),

            weighted:

              toNumber(

                row.weighted_forecast

              ),

            collected:

              netCollectedByLocation(

                row.location ||

                'Unknown',

                currency

              ),

          };

        }

      )

      .filter(

        (row) =>

          row.pipeline !== 0 ||

          row.weighted !== 0 ||

          row.collected !== 0

      );



  const cashChartData =

    actualMonthly

      .map(

        (row) => ({

          currency:

            normalizeCurrency(

              row.currency

            ),

          month:

            row.revenue_month,

          monthLabel:

            formatMonthShort(

              row.revenue_month

            ),

          gross:

            toNumber(

              row.gross_received

            ),

          refunds:

            toNumber(

              row.refunds

            ),

          net:

            toNumber(

              row.actual_revenue

            ),

          payments:

            toNumber(

              row.successful_payments

            ),

        })

      )

      .filter(

        (row) =>

          row.gross !== 0 ||

          row.refunds !== 0 ||

          row.net !== 0

      );





  return (

    <>

      <PageHeader

        title="Revenue Forecast"

        description="Pipeline, weighted forecast, real payment revenue, refunds and outstanding balances from Yogakulam CRM."

      />





      {unvaluedLeads > 0 && (

        <div

          className="

            mt-6

            rounded-xl

            border

            border-amber-100

            bg-amber-50

            px-4

            py-3

          "

        >

          <div className="text-sm font-bold text-amber-800">

            {unvaluedLeads} unvalued lead

            {unvaluedLeads === 1

              ? ''

              : 's'}

          </div>



          <div className="mt-1 text-xs text-amber-700">

            These open leads do not yet have a batch or potential value assigned,

            so they are excluded from revenue forecasting.

          </div>

        </div>

      )}





      {/* ===================================================

          INTERACTIVE REVENUE INTELLIGENCE

      =================================================== */}



      <RevenueInsights

        summaries={totalsByCurrency}

        stages={stageChartData}

        monthly={monthlyChartData}

        sources={sourceChartData}

        locations={locationChartData}

        cash={cashChartData}

      
        usdInrRate={fxRate.rate}

        fxRateDate={fxRate.date}

        fxRateSource={fxRate.source}

      />





      {/* ===================================================

          PIPELINE BY STAGE

      =================================================== */}



      <section className="card-pad mt-4">

        <div>

          <div className="eyebrow">

            Pipeline

          </div>



          <div className="section-title mt-1">

            Forecast by stage

          </div>

        </div>





        <div className="mt-5 overflow-x-auto">

          <table className="min-w-full text-left text-sm">

            <thead>

              <tr className="border-b border-slate-100 text-xs uppercase tracking-wide text-slate-400">

                <th className="px-3 py-3">

                  Stage

                </th>



                <th className="px-3 py-3">

                  Currency

                </th>



                <th className="px-3 py-3 text-right">

                  Leads

                </th>



                <th className="px-3 py-3 text-right">

                  Pipeline

                </th>



                <th className="px-3 py-3 text-right">

                  Weighted

                </th>



                <th className="px-3 py-3 text-right">

                  Net collected

                </th>

              </tr>

            </thead>





            <tbody>

              {stages

                .filter(

                  (row) => {



                    const currency =

                      normalizeCurrency(

                        row.currency

                      );



                    const collected =

                      netCollectedByStage(

                        row.current_stage,

                        currency

                      );



                    return (

                      toNumber(

                        row.pipeline_value

                      ) > 0 ||

                      toNumber(

                        row.weighted_forecast

                      ) > 0 ||

                      collected !== 0

                    );

                  }

                )

                .sort(

                  (a, b) =>

                    toNumber(

                      b.weighted_forecast

                    ) -

                    toNumber(

                      a.weighted_forecast

                    )

                )

                .map(

                  (row) => {



                    const currency =

                      normalizeCurrency(

                        row.currency

                      );



                    const collected =

                      netCollectedByStage(

                        row.current_stage,

                        currency

                      );



                    return (

                      <tr

                        key={

                          `${currency}-${row.current_stage}`

                        }

                        className="border-b border-slate-50 last:border-0"

                      >

                        <td className="px-3 py-3 font-semibold capitalize text-slate-700">

                          {pretty(

                            row.current_stage

                          )}

                        </td>



                        <td className="px-3 py-3 text-slate-500">

                          {currency}

                        </td>



                        <td className="px-3 py-3 text-right text-slate-600">

                          {Number(

                            row.lead_count

                          )}

                        </td>



                        <td className="px-3 py-3 text-right font-semibold text-slate-700">

                          {formatMoney(

                            row.pipeline_value,

                            currency

                          )}

                        </td>



                        <td className="px-3 py-3 text-right font-bold text-slate-800">

                          {formatMoney(

                            row.weighted_forecast,

                            currency

                          )}

                        </td>



                        <td className="px-3 py-3 text-right font-semibold text-slate-700">

                          {formatMoney(

                            collected,

                            currency

                          )}

                        </td>

                      </tr>

                    );

                  }

                )}

            </tbody>

          </table>

        </div>

      </section>





      {/* ===================================================

          MONTHLY FORECAST

      =================================================== */}



      <section className="card-pad mt-4">

        <div>

          <div className="eyebrow">

            Forecast

          </div>



          <div className="section-title mt-1">

            Monthly revenue forecast

          </div>

        </div>





        <div

          className="

            mt-5

            grid

            gap-3

            md:grid-cols-2

            xl:grid-cols-3

          "

        >

          {monthly

            .filter(

              (row) => {



                const currency =

                  normalizeCurrency(

                    row.currency

                  );



                const collected =

                  netCollectedByForecastMonth(

                    row.forecast_month,

                    currency

                  );



                return (

                  toNumber(

                    row.pipeline_value

                  ) > 0 ||

                  toNumber(

                    row.weighted_forecast

                  ) > 0 ||

                  collected !== 0

                );

              }

            )

            .map(

              (row) => {



                const currency =

                  normalizeCurrency(

                    row.currency

                  );



                const collected =

                  netCollectedByForecastMonth(

                    row.forecast_month,

                    currency

                  );



                return (

                  <div

                    key={

                      `${currency}-${row.forecast_month}`

                    }

                    className="

                      rounded-xl

                      border

                      border-slate-100

                      bg-slate-50

                      p-4

                    "

                  >

                    <div className="flex items-start justify-between gap-4">

                      <div>

                        <div className="text-sm font-bold text-slate-800">

                          {formatMonth(

                            row.forecast_month

                          )}

                        </div>



                        <div className="mt-1 text-xs text-slate-400">

                          {Number(

                            row.lead_count

                          )}{' '}

                          opportunities

                        </div>

                      </div>



                      <span

                        className="

                          rounded-lg

                          bg-white

                          px-2

                          py-1

                          text-xs

                          font-bold

                          text-slate-500

                        "

                      >

                        {currency}

                      </span>

                    </div>





                    <div className="mt-4 space-y-2">

                      <MiniValue

                        label="Pipeline"

                        value={

                          formatMoney(

                            row.pipeline_value,

                            currency

                          )

                        }

                      />



                      <MiniValue

                        label="Weighted"

                        value={

                          formatMoney(

                            row.weighted_forecast,

                            currency

                          )

                        }

                      />



                      <MiniValue

                        label="Net collected"

                        value={

                          formatMoney(

                            collected,

                            currency

                          )

                        }

                      />

                    </div>

                  </div>

                );

              }

            )}

        </div>

      </section>





      {/* ===================================================

          ACTUAL CASH REVENUE BY PAYMENT MONTH

      =================================================== */}



      <section className="card-pad mt-4">

        <div>

          <div className="eyebrow">

            Payments

          </div>



          <div className="section-title mt-1">

            Actual cash revenue by month

          </div>



          <p className="mt-2 text-xs leading-5 text-slate-400">

            Revenue is recognized here from payment records using the payment date.

            Refunds reduce net revenue.

          </p>

        </div>





        <div

          className="

            mt-5

            grid

            gap-3

            md:grid-cols-2

            xl:grid-cols-3

          "

        >

          {cashMonths.length === 0 && (

            <div className="text-sm text-slate-400">

              No paid transactions have been recorded yet.

            </div>

          )}





          {cashMonths.map(

            (row) => {



              const currency =

                normalizeCurrency(

                  row.currency

                );



              return (

                <div

                  key={

                    `${currency}-${row.revenue_month}`

                  }

                  className="

                    rounded-xl

                    border

                    border-slate-100

                    bg-slate-50

                    p-4

                  "

                >

                  <div className="flex items-start justify-between gap-4">

                    <div>

                      <div className="text-sm font-bold text-slate-800">

                        {formatMonth(

                          row.revenue_month

                        )}

                      </div>



                      <div className="mt-1 text-xs text-slate-400">

                        {Number(

                          row.successful_payments ??

                          0

                        )}{' '}

                        successful payments

                      </div>

                    </div>



                    <span

                      className="

                        rounded-lg

                        bg-white

                        px-2

                        py-1

                        text-xs

                        font-bold

                        text-slate-500

                      "

                    >

                      {currency}

                    </span>

                  </div>





                  <div className="mt-4 space-y-2">

                    <MiniValue

                      label="Gross received"

                      value={

                        formatMoney(

                          row.gross_received,

                          currency

                        )

                      }

                    />



                    <MiniValue

                      label="Refunds"

                      value={

                        formatMoney(

                          row.refunds,

                          currency

                        )

                      }

                    />



                    <MiniValue

                      label="Net revenue"

                      value={

                        formatMoney(

                          row.actual_revenue,

                          currency

                        )

                      }

                    />

                  </div>

                </div>

              );

            }

          )}

        </div>

      </section>





      {/* ===================================================

          SOURCE + LOCATION

      =================================================== */}



      <div

        className="

          mt-4

          grid

          gap-4

          xl:grid-cols-2

        "

      >

        <BreakdownCard

          title="Revenue by source"

          eyebrow="Attribution"

          icon={

            <TrendingUp

              size={16}

            />

          }

          rows={

            sources.map(

              (row) => {



                const currency =

                  normalizeCurrency(

                    row.currency

                  );



                return {

                  name:

                    pretty(

                      row.source

                    ),



                  currency,



                  count:

                    Number(

                      row.lead_count

                    ),



                  pipeline:

                    toNumber(

                      row.pipeline_value

                    ),



                  weighted:

                    toNumber(

                      row.weighted_forecast

                    ),



                  actual:

                    netCollectedBySource(

                      row.source ||

                      'Unknown',

                      currency

                    ),

                };

              }

            )

          }

        />





        <BreakdownCard

          title="Revenue by location"

          eyebrow="Markets"

          icon={

            <MapPin

              size={16}

            />

          }

          rows={

            locations.map(

              (row) => {



                const currency =

                  normalizeCurrency(

                    row.currency

                  );



                return {

                  name:

                    row.location ||

                    'Unknown',



                  currency,



                  count:

                    Number(

                      row.lead_count

                    ),



                  pipeline:

                    toNumber(

                      row.pipeline_value

                    ),



                  weighted:

                    toNumber(

                      row.weighted_forecast

                    ),



                  actual:

                    netCollectedByLocation(

                      row.location ||

                      'Unknown',

                      currency

                    ),

                };

              }

            )

          }

        />

      </div>





      {/* ===================================================

          TOP OPPORTUNITIES

      =================================================== */}



      <section className="card-pad mt-4">

        <div className="flex items-center justify-between gap-4">

          <div>

            <div className="eyebrow">

              Opportunities

            </div>



            <div className="section-title mt-1">

              Highest-value open leads

            </div>

          </div>



          <Users

            size={20}

            className="text-slate-400"

          />

        </div>





        <div className="mt-5 overflow-x-auto">

          <table className="min-w-full text-left text-sm">

            <thead>

              <tr className="border-b border-slate-100 text-xs uppercase tracking-wide text-slate-400">

                <th className="px-3 py-3">

                  Lead

                </th>



                <th className="px-3 py-3">

                  Stage

                </th>



                <th className="px-3 py-3">

                  Location

                </th>



                <th className="px-3 py-3">

                  Source

                </th>



                <th className="px-3 py-3 text-right">

                  Potential

                </th>



                <th className="px-3 py-3 text-right">

                  Weighted

                </th>



                <th className="px-3 py-3 text-right">

                  Paid

                </th>



                <th className="px-3 py-3">

                </th>

              </tr>

            </thead>





            <tbody>

              {topOpportunities.length === 0 && (

                <tr>

                  <td

                    colSpan={8}

                    className="px-3 py-8 text-center text-sm text-slate-400"

                  >

                    No valued opportunities yet.

                  </td>

                </tr>

              )}





              {topOpportunities.map(

                (row) => (



                  <tr

                    key={

                      row.id

                    }

                    className="border-b border-slate-50 last:border-0"

                  >

                    <td className="px-3 py-3">

                      <div className="font-semibold text-slate-800">

                        {row.lead_name ||

                          row.lead_code}

                      </div>



                      <div className="mt-0.5 text-xs text-slate-400">

                        {row.lead_code}

                      </div>

                    </td>





                    <td className="px-3 py-3 capitalize text-slate-600">

                      {pretty(

                        row.current_stage

                      )}

                    </td>





                    <td className="px-3 py-3 text-slate-600">

                      {row.preferred_location ||

                        '—'}

                    </td>





                    <td className="px-3 py-3 text-slate-600">

                      {pretty(

                        row.first_touch_source ||

                        'Unknown'

                      )}

                    </td>





                    <td className="px-3 py-3 text-right font-semibold text-slate-700">

                      {formatMoney(

                        row.potential_value,

                        row.currency

                      )}

                    </td>





                    <td className="px-3 py-3 text-right font-bold text-slate-800">

                      {formatMoney(

                        row.weighted_value,

                        row.currency

                      )}

                    </td>





                    <td className="px-3 py-3 text-right font-semibold text-slate-700">

                      {formatMoney(

                        netPaidForLead(

                          row.id

                        ),

                        row.currency

                      )}

                    </td>





                    <td className="px-3 py-3 text-right">

                      <Link

                        href={

                          `/leads/${row.id}`

                        }

                        className="inline-flex items-center gap-1 text-xs font-bold text-brand"

                      >

                        View



                        <ArrowRight

                          size={13}

                        />

                      </Link>

                    </td>

                  </tr>

                )

              )}

            </tbody>

          </table>

        </div>

      </section>





      {/* ===================================================

          CLOSING THIS MONTH

      =================================================== */}



      <section className="card-pad mt-4">

        <div>

          <div className="eyebrow">

            Closing

          </div>



          <div className="section-title mt-1">

            Expected to close this month

          </div>

        </div>





        <div className="mt-5 space-y-3">

          {closingThisMonth.length === 0 && (

            <div className="rounded-xl bg-slate-50 px-4 py-6 text-center text-sm text-slate-400">

              No open opportunities currently have an expected close date this month.

            </div>

          )}





          {closingThisMonth.map(

            (row) => (



              <Link

                key={

                  row.id

                }

                href={

                  `/leads/${row.id}`

                }

                className="

                  flex

                  items-center

                  justify-between

                  gap-4

                  rounded-xl

                  border

                  border-slate-100

                  px-4

                  py-3

                  transition

                  hover:bg-slate-50

                "

              >

                <div>

                  <div className="font-semibold text-slate-800">

                    {row.lead_name ||

                      row.lead_code}

                  </div>



                  <div className="mt-1 text-xs text-slate-400">

                    {pretty(

                      row.current_stage

                    )}



                    {' · '}



                    {row.preferred_location ||

                      'Unknown location'}



                    {' · '}



                    {formatDate(

                      row.expected_close_date

                    )}

                  </div>

                </div>





                <div className="text-right">

                  <div className="font-bold text-slate-800">

                    {formatMoney(

                      row.weighted_value,

                      row.currency

                    )}

                  </div>



                  <div className="mt-1 text-xs text-slate-400">

                    weighted

                  </div>

                </div>

              </Link>

            )

          )}

        </div>

      </section>

    </>

  );

}





/* =========================================================

   COMPONENTS

========================================================= */



function MetricCard({

  icon,

  label,

  value,

  sub,

}: {

  icon: ReactNode;

  label: string;

  value: string;

  sub?: string;

}) {

  return (

    <div className="rounded-xl bg-slate-50 p-4">

      <div className="flex items-center gap-2 text-xs font-semibold text-slate-400">

        {icon}

        {label}

      </div>



      <div className="mt-2 text-xl font-bold text-slate-800">

        {value}

      </div>



      {sub && (

        <div className="mt-1 text-[11px] text-slate-400">

          {sub}

        </div>

      )}

    </div>

  );

}





function MiniValue({

  label,

  value,

}: {

  label: string;

  value: string;

}) {

  return (

    <div className="flex items-center justify-between gap-4">

      <span className="text-xs text-slate-400">

        {label}

      </span>



      <span className="text-sm font-bold text-slate-700">

        {value}

      </span>

    </div>

  );

}





function BreakdownCard({

  title,

  eyebrow,

  icon,

  rows,

}: {

  title: string;

  eyebrow: string;

  icon: ReactNode;



  rows: Array<{

    name: string;

    currency: string;

    count: number;

    pipeline: number;

    weighted: number;

    actual: number;

  }>;

}) {

  const sorted =

    [...rows]

      .filter(

        (row) =>

          row.pipeline !== 0 ||

          row.weighted !== 0 ||

          row.actual !== 0

      )

      .sort(

        (a, b) =>

          b.weighted -

          a.weighted

      )

      .slice(

        0,

        10

      );





  return (

    <section className="card-pad">

      <div className="flex items-center justify-between">

        <div>

          <div className="eyebrow">

            {eyebrow}

          </div>



          <div className="section-title mt-1">

            {title}

          </div>

        </div>



        <div className="text-slate-400">

          {icon}

        </div>

      </div>





      <div className="mt-5 space-y-3">

        {sorted.length === 0 && (

          <div className="text-sm text-slate-400">

            No forecast data yet.

          </div>

        )}





        {sorted.map(

          (

            row,

            index

          ) => (



            <div

              key={

                `${row.name}-${row.currency}-${index}`

              }

              className="

                rounded-xl

                border

                border-slate-100

                p-3

              "

            >

              <div className="flex items-start justify-between gap-4">

                <div>

                  <div className="text-sm font-semibold text-slate-800">

                    {row.name}

                  </div>



                  <div className="mt-1 text-xs text-slate-400">

                    {row.count}{' '}

                    leads

                    {' · '}

                    {row.currency}

                  </div>

                </div>



                <div className="text-right">

                  <div className="text-sm font-bold text-slate-800">

                    {formatMoney(

                      row.weighted,

                      row.currency

                    )}

                  </div>



                  <div className="mt-1 text-[11px] text-slate-400">

                    weighted

                  </div>

                </div>

              </div>





              <div className="mt-3 space-y-1.5">

                <MiniValue

                  label="Pipeline"

                  value={

                    formatMoney(

                      row.pipeline,

                      row.currency

                    )

                  }

                />



                <MiniValue

                  label="Net collected"

                  value={

                    formatMoney(

                      row.actual,

                      row.currency

                    )

                  }

                />

              </div>

            </div>

          )

        )}

      </div>

    </section>

  );

}





/* =========================================================

   HELPERS

========================================================= */



type FxRateResult = {
  rate: number | null;
  date: string | null;
  source: string | null;
};

async function getUsdInrRate(): Promise<FxRateResult> {
  try {
    const response = await fetch(
      'https://api.frankfurter.dev/v2/rate/usd/inr',
      {
        next: {
          revalidate: 3600,
        },
      }
    );

    if (!response.ok) {
      throw new Error(
        `FX request failed with ${response.status}`
      );
    }

    const data = (await response.json()) as {
      date?: string;
      base?: string;
      quote?: string;
      rate?: number;
    };

    const rate = Number(data.rate);

    if (!Number.isFinite(rate) || rate <= 0) {
      throw new Error('Invalid USD/INR FX rate.');
    }

    return {
      rate,
      date: data.date ?? null,
      source: 'Frankfurter',
    };
  } catch {
    /*
     * Optional fallback for production/local development.
     * Set USD_INR_FALLBACK_RATE in .env.local and Vercel if desired.
     */
    const fallback = Number(
      process.env.USD_INR_FALLBACK_RATE ?? 0
    );

    if (
      Number.isFinite(fallback) &&
      fallback > 0
    ) {
      return {
        rate: fallback,
        date: null,
        source: 'Fallback rate',
      };
    }

    return {
      rate: null,
      date: null,
      source: null,
    };
  }
}


function normalizeCurrency(

  value:

    | string

    | null

    | undefined

) {

  return String(

    value ||

    ''

  ).toUpperCase();

}





function toNumber(

  value:

    | number

    | string

    | null

    | undefined

) {

  const number =

    Number(

      value ??

      0

    );



  return Number.isFinite(

    number

  )

    ? number

    : 0;

}





function sum(

  values: Array<

    number |

    string |

    null |

    undefined

  >

) {

  return values.reduce<number>(

    (

      total,

      value

    ) =>

      total +

      toNumber(

        value

      ),

    0

  );

}





function formatMoney(

  value:

    | number

    | string

    | null

    | undefined,



  currency:

    | string

    | null

    | undefined

) {

  const amount =

    toNumber(

      value

    );



  const code =

    normalizeCurrency(

      currency

    ) ||

    'INR';





  try {

    return new Intl.NumberFormat(

      code === 'INR'

        ? 'en-IN'

        : 'en-US',

      {

        style:

          'currency',



        currency:

          code,



        maximumFractionDigits:

          0,

      }

    ).format(

      amount

    );



  } catch {

    return `${code} ${amount.toLocaleString()}`;

  }

}





function pretty(

  value:

    | string

    | null

    | undefined

) {

  if (!value) {

    return '—';

  }



  return String(

    value

  )

    .replaceAll(

      '_',

      ' '

    )

    .replace(

      /\b\w/g,

      (

        letter

      ) =>

        letter.toUpperCase()

    );

}





function formatMonthShort(

  value:

    | string

    | null

    | undefined

) {

  if (!value) {

    return 'Unknown';

  }



  const date =

    new Date(

      `${value.slice(0, 10)}T00:00:00Z`

    );



  if (

    Number.isNaN(

      date.getTime()

    )

  ) {

    return value;

  }



  return new Intl.DateTimeFormat(

    'en',

    {

      month:

        'short',

      year:

        '2-digit',

      timeZone:

        'UTC',

    }

  ).format(

    date

  );

}





function formatMonth(

  value:

    | string

    | null

    | undefined

) {

  if (!value) {

    return 'Unknown month';

  }



  const date =

    new Date(

      `${value.slice(0, 10)}T00:00:00Z`

    );



  if (

    Number.isNaN(

      date.getTime()

    )

  ) {

    return value;

  }



  return new Intl.DateTimeFormat(

    'en',

    {

      month:

        'long',



      year:

        'numeric',



      timeZone:

        'UTC',

    }

  ).format(

    date

  );

}





function formatDate(

  value:

    | string

    | null

    | undefined

) {

  if (!value) {

    return 'No date';

  }



  const date =

    new Date(

      `${value.slice(0, 10)}T00:00:00Z`

    );



  if (

    Number.isNaN(

      date.getTime()

    )

  ) {

    return value;

  }



  return new Intl.DateTimeFormat(

    'en',

    {

      day:

        'numeric',



      month:

        'short',



      year:

        'numeric',



      timeZone:

        'UTC',

    }

  ).format(

    date

  );

}
