import Link from 'next/link';



import {

  ArrowRight,

  CalendarDays,

  CheckCircle2,

  ClipboardCheck,

  ContactRound,

  CreditCard,

  CircleDollarSign,

  Flame,

  ListTodo,

  MapPin,

  MessageSquareMore,

  MessagesSquare,

  Sparkles,

  TrendingUp,

  UserCheck,

  UserRoundPlus,

  UsersRound,

} from 'lucide-react';



import {

  DashboardInsights,

} from '@/components/dashboard-insights';



import {

  LeadsTable,

} from '@/components/leads-table';



import {

  PageHeader,

  StatCard,

} from '@/components/ui';



import {

  getDashboardSourceBreakdown,

  getFollowUps,

  getLeads,

  getPipelineCounts,

  isMockMode,

} from '@/lib/data';



import {

  createClient,

} from '@/lib/supabase/server';





/* =========================================================

   TYPES

========================================================= */



type DashboardInboxState = {

  latestMessageAt:

    | string

    | null;



  latestDirection:

    | string

    | null;



  latestChannel:

    | string

    | null;



  lastInboundAt:

    | string

    | null;



  lastOutboundAt:

    | string

    | null;



  needsReply:

    boolean;



  lastReadAt:

    | string

    | null;

};



type LeadAttention = {

  unread:

    boolean;



  needsReply:

    boolean;



  needsFirstContact:

    boolean;



  waitingSince:

    | string

    | null;



  waitingMinutes:

    number;

};



type DashboardRevenueSummary = {

  currency: string;

  pipeline: number;

  weighted: number;

  collected: number;

  outstanding: number;

  opportunities: number;

};



type DashboardBatchDemand = {

  id: string;

  batchCode: string;

  courseName: string;

  location: string;

  mode: string;

  startDate: string | null;

  endDate: string | null;

  activeDemand: number;

  hotDemand: number;

  paymentPending: number;

  enrolled: number;

  capacity: number | null;

  seatsRemaining: number | null;

};



type DashboardCommercialPulse = {

  revenueSummary: DashboardRevenueSummary[];

  upcomingBatches: DashboardBatchDemand[];

  unvaluedOpenLeads: number;

};



type DashboardForecastRow = {

  current_stage: string | null;

  potential_value: number | string | null;

  currency: string | null;

  weighted_value: number | string | null;

};



type DashboardActualRevenueRow = {

  currency: string | null;

  actual_revenue: number | string | null;

};



type DashboardOutstandingRevenueRow = {

  currency: string | null;

  outstanding_revenue: number | string | null;

};



type DashboardBatchRow = {

  id: string;

  course_id: string | null;

  batch_code: string | null;

  location: string | null;

  mode: string | null;

  start_date: string | null;

  end_date: string | null;

  capacity: number | string | null;

  seats_remaining: number | string | null;

};



type DashboardCourseRow = {

  id: string;

  name: string | null;

};



type DashboardLeadBatchRow = {

  preferred_batch_id: string | null;

  current_stage: string | null;

};





/* =========================================================

   DASHBOARD

========================================================= */



export default async function DashboardPage() {



  const [

    leads,

    counts,

    sources,

    followups,

    inboxStateMap,

    commercialPulse,

  ] = await Promise.all([

    getLeads(),

    getPipelineCounts(),

    getDashboardSourceBreakdown(),

    getFollowUps(),

    getDashboardInboxStateMap(),

    getDashboardCommercialPulse(),

  ]);





  /* =======================================================

     CORE METRICS

  ======================================================= */



  const total =

    Object.values(

      counts

    ).reduce(

      (

        sum,

        value

      ) =>

        sum + value,

      0

    );





  const activePipeline =

    counts.new +

    counts.contacted +

    counts.engaged +

    counts.qualified +

    counts.high_intent +

    counts.payment_pending;





  const qualified =

    counts.qualified +

    counts.high_intent +

    counts.payment_pending +

    counts.enrolled;





  /* =======================================================

     REAL INBOX ATTENTION

  ======================================================= */



  const attentionByLead =

    new Map<

      string,

      LeadAttention

    >();



  for (

    const lead of leads

  ) {

    attentionByLead.set(

      lead.id,

      getLeadAttention(

        lead,

        inboxStateMap.get(

          lead.id

        )

      )

    );

  }





  const needsReplyCount =

    leads.filter(

      (lead) =>

        attentionByLead.get(

          lead.id

        )?.needsReply

    ).length;





  const unreadCount =

    leads.filter(

      (lead) =>

        attentionByLead.get(

          lead.id

        )?.unread

    ).length;





  const needsFirstTouchCount =

    leads.filter(

      (lead) =>

        attentionByLead.get(

          lead.id

        )?.needsFirstContact

    ).length;





  const waitingOverHourCount =

    leads.filter(

      (lead) => {

        const attention =

          attentionByLead.get(

            lead.id

          );



        return Boolean(

          attention

            ?.needsReply &&

          attention

            .waitingMinutes >=

            60

        );

      }

    ).length;





  const priorityCount =

    counts.high_intent +

    counts.payment_pending;





  const qualificationRate =

    total

      ? Math.round(

          (

            qualified /

            total

          ) *

            100

        )

      : 0;





  const enrollmentRate =

    total

      ? Math.round(

          (

            counts.enrolled /

            total

          ) *

            100

        )

      : 0;





  /* =======================================================

     LAST 24 HOURS

  ======================================================= */



  const twentyFourHoursAgo =

    Date.now() -

    24 *

      60 *

      60 *

      1000;





  const newLast24Hours =

    leads.filter(

      (lead) => {



        if (

          !lead.createdAt

        ) {

          return false;

        }





        const createdAt =

          new Date(

            lead.createdAt

          ).getTime();





        return (

          Number.isFinite(

            createdAt

          ) &&

          createdAt >=

            twentyFourHoursAgo

        );



      }

    ).length;





  /* =======================================================

     PRIORITY LEADS

  ======================================================= */



  const priorityLeads =

    [...leads]

      .filter(

        (lead) => {

          const attention =

            attentionByLead.get(

              lead.id

            );



          return Boolean(

            attention

              ?.unread ||

            attention

              ?.needsReply ||

            attention

              ?.needsFirstContact ||

            [

              'qualified',

              'high_intent',

              'payment_pending',

            ].includes(

              lead.stage

            )

          );

        }

      )

      .sort(

        (

          a,

          b

        ) => {

          const aAttention =

            attentionByLead.get(

              a.id

            );



          const bAttention =

            attentionByLead.get(

              b.id

            );



          const aScore =

            priorityScore(

              a.stage,

              aAttention

            );



          const bScore =

            priorityScore(

              b.stage,

              bAttention

            );



          if (

            aScore !==

            bScore

          ) {

            return (

              bScore -

              aScore

            );

          }



          const waitingDifference =

            (

              bAttention

                ?.waitingMinutes ??

              0

            ) -

            (

              aAttention

                ?.waitingMinutes ??

              0

            );



          if (

            waitingDifference !==

            0

          ) {

            return waitingDifference;

          }



          const aDate =

            a.createdAt

              ? new Date(

                  a.createdAt

                ).getTime()

              : 0;



          const bDate =

            b.createdAt

              ? new Date(

                  b.createdAt

                ).getTime()

              : 0;



          return (

            bDate -

            aDate

          );

        }

      )

      .slice(

        0,

        8

      );





  const {

    revenueSummary,

    upcomingBatches,

    unvaluedOpenLeads,

  } = commercialPulse;



  const mock =

    isMockMode();





  /* =======================================================

     PIPELINE CHART DATA

  ======================================================= */



  const pipeline = [

    {

      stage:

        'New',

      leads:

        counts.new,

    },

    {

      stage:

        'Contacted',

      leads:

        counts.contacted,

    },

    {

      stage:

        'Engaged',

      leads:

        counts.engaged,

    },

    {

      stage:

        'Qualified',

      leads:

        counts.qualified,

    },

    {

      stage:

        'High intent',

      leads:

        counts.high_intent,

    },

    {

      stage:

        'Payment',

      leads:

        counts.payment_pending,

    },

    {

      stage:

        'Enrolled',

      leads:

        counts.enrolled,

    },

  ];





  return (

    <>



      {/* ===================================================

          HEADER

      =================================================== */}



      <PageHeader



        eyebrow="Growth command center"



        title="Admissions command center"



        description="See what needs attention, where leads are moving, and which opportunities are closest to enrollment."



        actions={

          <>



            <span

              className={`

                rounded-xl

                px-3

                py-2

                text-xs

                font-bold



                ${

                  mock

                    ? 'bg-orange-50 text-orange-700'

                    : 'bg-emerald-50 text-emerald-700'

                }

              `}

            >

              {mock

                ? 'Mock data'

                : 'Supabase live'}

            </span>





            <Link

              className="btn-primary"

              href="/leads"

            >

              View all leads



              <ArrowRight

                size={15}

              />

            </Link>



          </>

        }



      />





      {/* ===================================================

          ATTENTION STRIP

      =================================================== */}



      <section

        className="

          mb-4

          overflow-hidden

          rounded-2xl

          border

          border-slate-200

          bg-white

          shadow-sm

        "

      >



        <div

          className="

            flex

            flex-col

            gap-4

            border-b

            border-slate-100

            px-5

            py-4

            sm:flex-row

            sm:items-center

            sm:justify-between

          "

        >



          <div>



            <div

              className="

                flex

                items-center

                gap-2

                text-[10px]

                font-black

                uppercase

                tracking-[.14em]

                text-brand

              "

            >



              <Sparkles

                size={13}

              />



              Today's attention



            </div>





            <div

              className="

                mt-1

                text-lg

                font-black

                tracking-tight

                text-slate-900

              "

            >

              Start with the conversations and leads that need action

            </div>



          </div>





          <Link

            href="/admissions"

            className="

              inline-flex

              items-center

              gap-2

              text-xs

              font-bold

              text-brand

              hover:underline

            "

          >

            Open Admissions Desk



            <ArrowRight

              size={14}

            />

          </Link>



        </div>





        <div

          className="

            grid

            divide-y

            divide-slate-100

            sm:grid-cols-2

            sm:divide-x

            sm:divide-y-0

            xl:grid-cols-6

          "

        >



          <AttentionMetric

            icon={

              <MessagesSquare

                size={17}

              />

            }

            label="Needs reply"

            value={

              needsReplyCount

            }

            note={

              waitingOverHourCount

                ? `${waitingOverHourCount} waiting over 1 hour`

                : 'latest message is from the lead'

            }

            tone="rose"

            href="/conversations"

          />





          <AttentionMetric

            icon={

              <MessageSquareMore

                size={17}

              />

            }

            label="Unread"

            value={

              unreadCount

            }

            note="customer messages not opened yet"

            tone="sky"

            href="/conversations"

          />





          <AttentionMetric

            icon={

              <UserRoundPlus

                size={17}

              />

            }

            label="Needs first touch"

            value={

              needsFirstTouchCount

            }

            note="new leads not contacted"

            tone="amber"

            href="/conversations"

          />





          <AttentionMetric

            icon={

              <Flame

                size={17}

              />

            }

            label="High intent"

            value={

              counts.high_intent

            }

            note="strong enrollment intent"

            tone="orange"

            href="/admissions"

          />





          <AttentionMetric

            icon={

              <CreditCard

                size={17}

              />

            }

            label="Payment pending"

            value={

              counts.payment_pending

            }

            note="closest to enrollment"

            tone="violet"

            href="/admissions"

          />





          <AttentionMetric

            icon={

              <ListTodo

                size={17}

              />

            }

            label="Follow-ups due"

            value={

              followups.length

            }

            note="open tasks requiring action"

            tone="slate"

            href="/follow-ups"

          />



        </div>



      </section>





      {/* ===================================================

          KPI ROW

      =================================================== */}



      <div

        className="

          grid

          gap-4

          sm:grid-cols-2

          xl:grid-cols-5

        "

      >



        <div

          className="

            animate-rise

            stagger-1

          "

        >

          <StatCard

            label="Last 24 hours"

            value={

              newLast24Hours

                .toLocaleString()

            }

            note="new leads created"

            icon={

              <UserRoundPlus

                size={19}

              />

            }

          />

        </div>





        <div

          className="

            animate-rise

            stagger-2

          "

        >

          <StatCard

            label="Active pipeline"

            value={

              activePipeline

                .toLocaleString()

            }

            note="open admissions opportunities"

            icon={

              <ContactRound

                size={19}

              />

            }

          />

        </div>





        <div

          className="

            animate-rise

            stagger-3

          "

        >

          <StatCard

            label="Qualified+"

            value={

              qualified

                .toLocaleString()

            }

            note={

              total

                ? `${qualificationRate}% of all leads`

                : 'No leads yet'

            }

            icon={

              <UserCheck

                size={19}

              />

            }

          />

        </div>





        <div

          className="

            animate-rise

            stagger-4

          "

        >

          <StatCard

            label="Enrolled"

            value={

              counts.enrolled

                .toLocaleString()

            }

            note={

              total

                ? `${enrollmentRate}% overall conversion`

                : 'No enrollments yet'

            }

            icon={

              <CheckCircle2

                size={19}

              />

            }

          />

        </div>





        <div

          className="

            animate-rise

            stagger-5

          "

        >

          <StatCard

            label="Priority"

            value={

              priorityCount

                .toLocaleString()

            }

            note="high intent + payment"

            icon={

              <Flame

                size={19}

              />

            }

          />

        </div>



      </div>





      {/* ===================================================

          INSIGHTS + ACTION CENTER

      =================================================== */}



      <div

        className="

          mt-4

          grid

          gap-4

          xl:grid-cols-[1.4fr_.6fr]

        "

      >



        <div

          className="

            animate-rise

            stagger-2

          "

        >



          <DashboardInsights

            pipeline={

              pipeline

            }

            sources={

              sources

            }

          />



        </div>





        <section

          className="

            card-pad

            animate-rise

            stagger-3

          "

        >



          <div>



            <div

              className="eyebrow"

            >

              Action center

            </div>





            <div

              className="

                section-title

                mt-1

              "

            >

              Work that matters now

            </div>





            <p

              className="

                mt-1

                text-xs

                leading-5

                text-slate-400

              "

            >

              Real inbox state and admissions queues, not estimated activity.

            </p>



          </div>





          <div

            className="

              mt-5

              space-y-3

            "

          >



            <ActionLink

              href="/conversations"

              icon={

                <MessagesSquare

                  size={17}

                />

              }

              label="Needs reply"

              value={

                needsReplyCount

              }

              note={

                unreadCount

                  ? `${unreadCount} unread conversations`

                  : 'no unread conversations'

              }

            />





            <ActionLink

              href="/admissions"

              icon={

                <ClipboardCheck

                  size={17}

                />

              }

              label="Priority admissions"

              value={

                priorityCount

              }

              note="high intent + payment pending"

            />





            <ActionLink

              href="/follow-ups"

              icon={

                <ListTodo

                  size={17}

                />

              }

              label="Follow-ups due"

              value={

                followups.length

              }

              note="open admissions tasks"

            />



          </div>





          {/* -----------------------------------------------

              QUALIFICATION

          ----------------------------------------------- */}



          <div

            className="

              mt-5

              rounded-2xl

              border

              border-slate-100

              bg-slate-50

              p-4

            "

          >



            <div

              className="

                flex

                items-start

                justify-between

                gap-4

              "

            >



              <div>



                <div

                  className="

                    text-[10px]

                    font-black

                    uppercase

                    tracking-[.14em]

                    text-slate-400

                  "

                >

                  Qualification rate

                </div>





                <div

                  className="

                    mt-2

                    text-3xl

                    font-black

                    tracking-tight

                    text-slate-900

                  "

                >

                  {total

                    ? `${qualificationRate}%`

                    : '—'}

                </div>



              </div>





              <div

                className="

                  grid

                  h-10

                  w-10

                  place-items-center

                  rounded-xl

                  bg-white

                  text-brand

                  shadow-sm

                "

              >

                <TrendingUp

                  size={18}

                />

              </div>



            </div>





            <div

              className="

                mt-4

                h-2

                overflow-hidden

                rounded-full

                bg-slate-200

              "

            >



              <div

                className="

                  h-full

                  rounded-full

                  bg-brand

                  transition-all

                  duration-700

                "

                style={{

                  width:

                    `${Math.min(

                      100,

                      qualificationRate

                    )}%`,

                }}

              />



            </div>





            <div

              className="

                mt-3

                flex

                items-center

                justify-between

                gap-3

              "

            >



              <span

                className="

                  text-[10px]

                  font-semibold

                  text-slate-400

                "

              >

                Qualified → Enrolled pipeline

              </span>





              <Link

                href="/funnel"

                className="

                  text-xs

                  font-bold

                  text-brand

                  hover:underline

                "

              >

                Open funnel →

              </Link>



            </div>



          </div>





          {/* -----------------------------------------------

              ENROLLMENT CONVERSION

          ----------------------------------------------- */}



          <div

            className="

              mt-3

              rounded-2xl

              border

              border-emerald-100

              bg-emerald-50/60

              p-4

            "

          >



            <div

              className="

                text-[10px]

                font-black

                uppercase

                tracking-[.14em]

                text-emerald-600

              "

            >

              Enrollment conversion

            </div>





            <div

              className="

                mt-2

                flex

                items-end

                justify-between

                gap-4

              "

            >



              <div

                className="

                  text-2xl

                  font-black

                  tracking-tight

                  text-slate-900

                "

              >

                {total

                  ? `${enrollmentRate}%`

                  : '—'}

              </div>





              <div

                className="

                  text-right

                  text-[10px]

                  font-semibold

                  text-slate-500

                "

              >

                {counts.enrolled}

                {' '}

                enrolled

              </div>



            </div>



          </div>



        </section>



      </div>





      {/* ===================================================

          COMMERCIAL PULSE

      =================================================== */}



      <div

        className="

          mt-4

          grid

          gap-4

          xl:grid-cols-[.82fr_1.18fr]

        "

      >



        <section

          className="

            card-pad

            animate-rise

            stagger-3

          "

        >



          <div

            className="

              flex

              items-start

              justify-between

              gap-4

            "

          >



            <div>



              <div className="eyebrow">

                Commercial pulse

              </div>



              <div className="section-title mt-1">

                Revenue at a glance

              </div>



              <p className="mt-1 text-xs leading-5 text-slate-400">

                Live pipeline, weighted forecast, collected revenue and outstanding balances.

              </p>



            </div>



            <Link

              href="/revenue"

              className="inline-flex shrink-0 items-center gap-1 text-xs font-bold text-brand hover:underline"

            >

              Full revenue

              <ArrowRight size={13} />

            </Link>



          </div>



          <div className="mt-5 space-y-3">

            {revenueSummary.map(

              (group) => (

                <RevenuePulseRow

                  key={group.currency}

                  group={group}

                />

              )

            )}

          </div>



          {unvaluedOpenLeads > 0 && (

            <div className="mt-4 rounded-xl border border-amber-100 bg-amber-50/70 px-4 py-3">

              <div className="flex items-center justify-between gap-3">

                <div>

                  <div className="text-xs font-bold text-amber-800">

                    {unvaluedOpenLeads.toLocaleString()} open lead{unvaluedOpenLeads === 1 ? '' : 's'} without forecast value

                  </div>

                  <div className="mt-0.5 text-[10px] font-medium text-amber-600">

                    Assign a batch or manual potential value to include them in revenue forecasting.

                  </div>

                </div>



                <CircleDollarSign

                  size={18}

                  className="shrink-0 text-amber-600"

                />

              </div>

            </div>

          )}



        </section>



        <section

          className="

            card

            overflow-hidden

            animate-rise

            stagger-4

          "

        >



          <div className="flex items-start justify-between gap-4 border-b border-slate-100 px-5 py-4">

            <div>

              <div className="eyebrow">

                Upcoming batches

              </div>



              <div className="section-title mt-1">

                Demand by batch

              </div>



              <p className="mt-1 text-xs leading-5 text-slate-400">

                Active prospects, hot leads and enrollments linked to each upcoming course batch.

              </p>

            </div>



            <UsersRound

              size={19}

              className="mt-1 shrink-0 text-brand"

            />

          </div>



          <div className="divide-y divide-slate-100">

            {upcomingBatches.length ? (

              upcomingBatches.map(

                (batch) => (

                  <BatchDemandRow

                    key={batch.id}

                    batch={batch}

                  />

                )

              )

            ) : (

              <div className="px-5 py-10 text-center">

                <CalendarDays

                  size={22}

                  className="mx-auto text-slate-300"

                />



                <div className="mt-2 text-sm font-bold text-slate-700">

                  No upcoming batches found

                </div>



                <div className="mt-1 text-xs text-slate-400">

                  Upcoming active course batches will appear here automatically.

                </div>

              </div>

            )}

          </div>

        </section>

      </div>



      {/* ===================================================

          PRIORITY LEADS

      =================================================== */}



      <section

        className="

          card

          mt-4

          overflow-hidden

          animate-rise

          stagger-4

        "

      >



        <div

          className="

            flex

            flex-col

            gap-3

            border-b

            border-slate-100

            px-5

            py-4

            sm:flex-row

            sm:items-center

            sm:justify-between

          "

        >



          <div>



            <div

              className="eyebrow"

            >

              Admissions priority

            </div>





            <div

              className="

                section-title

                mt-1

              "

            >

              Leads needing attention

            </div>





            <p

              className="

                mt-1

                text-xs

                text-slate-400

              "

            >

              Reply state, unread messages, first-touch gaps and funnel stage are combined to surface the most actionable leads.

            </p>



          </div>





          <div

            className="

              flex

              items-center

              gap-3

            "

          >



            <Link

              href="/conversations"

              className="

                text-xs

                font-bold

                text-slate-500

                hover:text-brand

              "

            >

              Conversations

            </Link>





            <Link

              href="/leads"

              className="

                inline-flex

                items-center

                gap-1

                text-sm

                font-bold

                text-brand

                hover:underline

              "

            >

              All leads



              <ArrowRight

                size={14}

              />

            </Link>



          </div>



        </div>





        <LeadsTable

          leads={

            priorityLeads

          }

          compact

        />



      </section>



    </>

  );



}





/* =========================================================

   COMMERCIAL PULSE DATA

========================================================= */



async function getDashboardCommercialPulse(): Promise<DashboardCommercialPulse> {

  if (

    isMockMode()

  ) {

    return {

      revenueSummary: [],

      upcomingBatches: [],

      unvaluedOpenLeads: 0,

    };

  }



  const supabase =

    await createClient();



  const today =

    new Date()

      .toISOString()

      .slice(0, 10);



  const [

    forecastResult,

    actualRevenueResult,

    outstandingResult,

    batchesResult,

    coursesResult,

    leadBatchResult,

  ] = await Promise.all([

    supabase

      .from('v_revenue_forecast')

      .select(`

        current_stage,

        potential_value,

        currency,

        weighted_value

      `)

      .limit(5000),



    supabase

      .from('v_actual_revenue_by_currency')

      .select(`

        currency,

        actual_revenue

      `),



    supabase

      .from('v_outstanding_revenue_by_currency')

      .select(`

        currency,

        outstanding_revenue

      `),



    supabase

      .from('course_batches')

      .select(`

        id,

        course_id,

        batch_code,

        location,

        mode,

        start_date,

        end_date,

        capacity,

        seats_remaining

      `)

      .eq('active', true)

      .gte('end_date', today)

      .order(

        'start_date',

        {

          ascending: true,

        }

      )

      .limit(50),



    supabase

      .from('courses')

      .select('id,name')

      .eq('active', true)

      .limit(200),



    supabase

      .from('leads')

      .select(`

        preferred_batch_id,

        current_stage

      `)

      .neq('status', 'archived')

      .not('preferred_batch_id', 'is', null)

      .limit(5000),

  ]);



  if (forecastResult.error) {

    console.error(

      'Unable to load dashboard revenue forecast:',

      forecastResult.error

    );

  }



  if (actualRevenueResult.error) {

    console.error(

      'Unable to load dashboard actual revenue:',

      actualRevenueResult.error

    );

  }



  if (outstandingResult.error) {

    console.error(

      'Unable to load dashboard outstanding revenue:',

      outstandingResult.error

    );

  }



  if (batchesResult.error) {

    console.error(

      'Unable to load dashboard course batches:',

      batchesResult.error

    );

  }



  if (coursesResult.error) {

    console.error(

      'Unable to load dashboard courses:',

      coursesResult.error

    );

  }



  if (leadBatchResult.error) {

    console.error(

      'Unable to load dashboard batch demand:',

      leadBatchResult.error

    );

  }



  const forecasts =

    (

      forecastResult.data ??

      []

    ) as DashboardForecastRow[];



  const actualRevenue =

    (

      actualRevenueResult.data ??

      []

    ) as DashboardActualRevenueRow[];



  const outstanding =

    (

      outstandingResult.data ??

      []

    ) as DashboardOutstandingRevenueRow[];



  const closedStages =

    new Set([

      'enrolled',

      'lost',

      'unqualified',

      'duplicate',

    ]);



  const currencies =

    Array.from(

      new Set([

        'USD',

        'INR',

        ...forecasts

          .map(

            (row) =>

              String(

                row.currency ??

                ''

              ).toUpperCase()

          )

          .filter(Boolean),

        ...actualRevenue

          .map(

            (row) =>

              String(

                row.currency ??

                ''

              ).toUpperCase()

          )

          .filter(Boolean),

      ])

    );



  const revenueSummary: DashboardRevenueSummary[] =

    currencies.map(

      (currency) => {

        const valuedRows =

          forecasts.filter(

            (row) =>

              String(

                row.currency ??

                ''

              ).toUpperCase() ===

                currency &&

              toDashboardNumber(

                row.potential_value

              ) > 0

          );



        const openRows =

          valuedRows.filter(

            (row) =>

              !closedStages.has(

                String(

                  row.current_stage ??

                  ''

                )

              )

          );



        const actualRow =

          actualRevenue.find(

            (row) =>

              String(

                row.currency ??

                ''

              ).toUpperCase() ===

              currency

          );



        const outstandingRow =

          outstanding.find(

            (row) =>

              String(

                row.currency ??

                ''

              ).toUpperCase() ===

              currency

          );



        return {

          currency,

          pipeline:

            dashboardSum(

              openRows.map(

                (row) =>

                  row.potential_value

              )

            ),

          weighted:

            dashboardSum(

              openRows.map(

                (row) =>

                  row.weighted_value

              )

            ),

          collected:

            toDashboardNumber(

              actualRow

                ?.actual_revenue

            ),

          outstanding:

            toDashboardNumber(

              outstandingRow

                ?.outstanding_revenue

            ),

          opportunities:

            openRows.length,

        };

      }

    );



  const unvaluedOpenLeads =

    forecasts.filter(

      (row) =>

        !closedStages.has(

          String(

            row.current_stage ??

            ''

          )

        ) &&

        toDashboardNumber(

          row.potential_value

        ) <= 0

    ).length;



  const batches =

    (

      batchesResult.data ??

      []

    ) as DashboardBatchRow[];



  const courses =

    (

      coursesResult.data ??

      []

    ) as DashboardCourseRow[];



  const leadBatchRows =

    (

      leadBatchResult.data ??

      []

    ) as DashboardLeadBatchRow[];



  const courseNames =

    new Map(

      courses.map(

        (course) => [

          course.id,

          course.name ??

            'Course',

        ]

      )

    );



  const leadsByBatch =

    new Map<

      string,

      DashboardLeadBatchRow[]

    >();



  for (

    const lead of leadBatchRows

  ) {

    if (

      !lead.preferred_batch_id

    ) {

      continue;

    }



    const existing =

      leadsByBatch.get(

        lead.preferred_batch_id

      ) ??

      [];



    existing.push(lead);



    leadsByBatch.set(

      lead.preferred_batch_id,

      existing

    );

  }



  const activeDemandStages =

    new Set([

      'new',

      'contacted',

      'engaged',

      'qualified',

      'high_intent',

      'payment_pending',

    ]);



  const hotDemandStages =

    new Set([

      'qualified',

      'high_intent',

      'payment_pending',

    ]);



  const upcomingBatches =

    batches.map(

      (batch) => {

        const assignedLeads =

          leadsByBatch.get(

            batch.id

          ) ??

          [];



        const activeDemand =

          assignedLeads.filter(

            (lead) =>

              activeDemandStages.has(

                String(

                  lead.current_stage ??

                  ''

                )

              )

          ).length;



        const hotDemand =

          assignedLeads.filter(

            (lead) =>

              hotDemandStages.has(

                String(

                  lead.current_stage ??

                  ''

                )

              )

          ).length;



        const paymentPending =

          assignedLeads.filter(

            (lead) =>

              lead.current_stage ===

              'payment_pending'

          ).length;



        const enrolled =

          assignedLeads.filter(

            (lead) =>

              lead.current_stage ===

              'enrolled'

          ).length;



        return {

          id:

            batch.id,

          batchCode:

            batch.batch_code ??

            'Batch',

          courseName:

            batch.course_id

              ? courseNames.get(

                  batch.course_id

                ) ??

                'Course'

              : 'Course',

          location:

            batch.location ??

            '—',

          mode:

            batch.mode ??

            '—',

          startDate:

            batch.start_date ??

            null,

          endDate:

            batch.end_date ??

            null,

          activeDemand,

          hotDemand,

          paymentPending,

          enrolled,

          capacity:

            batch.capacity == null

              ? null

              : toDashboardNumber(

                  batch.capacity

                ),

          seatsRemaining:

            batch.seats_remaining == null

              ? null

              : toDashboardNumber(

                  batch.seats_remaining

                ),

        } satisfies DashboardBatchDemand;

      }

    )

    .sort(

      (

        a,

        b

      ) => {

        const aDate =

          a.startDate

            ? new Date(

                `${a.startDate}T00:00:00Z`

              ).getTime()

            : Number.MAX_SAFE_INTEGER;



        const bDate =

          b.startDate

            ? new Date(

                `${b.startDate}T00:00:00Z`

              ).getTime()

            : Number.MAX_SAFE_INTEGER;



        if (

          aDate !==

          bDate

        ) {

          return aDate - bDate;

        }



        return (

          b.activeDemand -

          a.activeDemand

        );

      }

    )

    .slice(0, 6);



  return {

    revenueSummary,

    upcomingBatches,

    unvaluedOpenLeads,

  };

}



/* =========================================================

   REAL INBOX STATE

========================================================= */



async function getDashboardInboxStateMap() {

  if (

    isMockMode()

  ) {

    return new Map<

      string,

      DashboardInboxState

    >();

  }



  const supabase =

    await createClient();



  const {

    data: {

      user,

    },

  } =

    await supabase

      .auth

      .getUser();



  if (!user) {

    return new Map<

      string,

      DashboardInboxState

    >();

  }



  const [

    attentionResult,

    readResult,

  ] =

    await Promise.all([

      supabase

        .from(

          'v_lead_inbox_attention'

        )

        .select(`

          lead_id,

          latest_direction,

          latest_message_at,

          latest_channel,

          last_inbound_at,

          last_outbound_at,

          needs_reply

        `)

        .limit(1000),



      supabase

        .from(

          'lead_inbox_reads'

        )

        .select(`

          lead_id,

          last_read_at

        `)

        .eq(

          'user_id',

          user.id

        )

        .limit(1000),

    ]);



  if (

    attentionResult.error

  ) {

    console.error(

      'Unable to load dashboard inbox attention:',

      attentionResult.error

    );

  }



  if (

    readResult.error

  ) {

    console.error(

      'Unable to load dashboard inbox read state:',

      readResult.error

    );

  }



  const readMap =

    new Map<

      string,

      string | null

    >(

      (

        readResult.data ??

        []

      ).map(

        (

          row: {

            lead_id:

              string;

            last_read_at:

              string | null;

          }

        ) => [

          row.lead_id,

          row.last_read_at,

        ]

      )

    );



  const stateMap =

    new Map<

      string,

      DashboardInboxState

    >();



  for (

    const row of

    attentionResult.data ??

    []

  ) {

    const leadId =

      String(

        row.lead_id

      );



    stateMap.set(

      leadId,

      {

        latestMessageAt:

          row.latest_message_at ??

          null,



        latestDirection:

          row.latest_direction ??

          null,



        latestChannel:

          row.latest_channel ??

          null,



        lastInboundAt:

          row.last_inbound_at ??

          null,



        lastOutboundAt:

          row.last_outbound_at ??

          null,



        needsReply:

          Boolean(

            row.needs_reply

          ),



        lastReadAt:

          readMap.get(

            leadId

          ) ??

          null,

      }

    );

  }



  return stateMap;

}





/* =========================================================

   ATTENTION CALCULATION

========================================================= */



function getLeadAttention(

  lead: {

    stage:

      string;

    createdAt?:

      string;

    lastContactedAt?:

      string;

  },

  state:

    | DashboardInboxState

    | undefined

): LeadAttention {

  const needsReply =

    Boolean(

      state

        ?.needsReply

    );



  const needsFirstContact =

    lead.stage ===

      'new' &&

    !state

      ?.latestMessageAt &&

    !lead

      .lastContactedAt;



  const lastInboundTime =

    state

      ?.lastInboundAt

      ? new Date(

          state.lastInboundAt

        ).getTime()

      : 0;



  const lastReadTime =

    state

      ?.lastReadAt

      ? new Date(

          state.lastReadAt

        ).getTime()

      : 0;



  const unread =

    lastInboundTime >

    0 &&

    (

      !lastReadTime ||

      lastInboundTime >

        lastReadTime

    );



  const waitingSince =

    needsReply

      ? (

          state

            ?.lastInboundAt ||

          state

            ?.latestMessageAt ||

          null

        )

      : needsFirstContact

        ? (

            lead

              .createdAt ??

            null

          )

        : null;



  let waitingMinutes =

    0;



  if (

    waitingSince

  ) {

    const waitingTime =

      new Date(

        waitingSince

      ).getTime();



    if (

      Number.isFinite(

        waitingTime

      )

    ) {

      waitingMinutes =

        Math.max(

          0,

          Math.floor(

            (

              Date.now() -

              waitingTime

            ) /

              60000

          )

        );

    }

  }



  return {

    unread,

    needsReply,

    needsFirstContact,

    waitingSince,

    waitingMinutes,

  };

}





/* =========================================================

   REVENUE PULSE ROW

========================================================= */



function RevenuePulseRow({

  group,

}: {

  group: DashboardRevenueSummary;

}) {

  return (

    <div className="rounded-2xl border border-slate-100 bg-slate-50/70 p-4">

      <div className="flex items-center justify-between gap-4">

        <div className="flex items-center gap-2">

          <div className="grid h-9 w-9 place-items-center rounded-xl bg-white text-brand shadow-sm">

            <CircleDollarSign size={17} />

          </div>



          <div>

            <div className="text-sm font-black text-slate-900">

              {group.currency}

            </div>



            <div className="text-[10px] font-semibold text-slate-400">

              {group.opportunities.toLocaleString()} valued open opportunit{group.opportunities === 1 ? 'y' : 'ies'}

            </div>

          </div>

        </div>



        <div className="text-right">

          <div className="text-[10px] font-black uppercase tracking-[.12em] text-slate-400">

            Collected

          </div>



          <div className="mt-0.5 text-lg font-black tracking-tight text-emerald-700">

            {formatDashboardMoney(

              group.collected,

              group.currency

            )}

          </div>

        </div>

      </div>



      <div className="mt-4 grid grid-cols-3 gap-2">

        <RevenueMiniMetric

          label="Pipeline"

          value={formatDashboardMoney(

            group.pipeline,

            group.currency

          )}

        />



        <RevenueMiniMetric

          label="Weighted"

          value={formatDashboardMoney(

            group.weighted,

            group.currency

          )}

        />



        <RevenueMiniMetric

          label="Outstanding"

          value={formatDashboardMoney(

            group.outstanding,

            group.currency

          )}

        />

      </div>

    </div>

  );

}



function RevenueMiniMetric({

  label,

  value,

}: {

  label: string;

  value: string;

}) {

  return (

    <div className="rounded-xl border border-slate-100 bg-white px-3 py-2.5">

      <div className="text-[9px] font-black uppercase tracking-[.1em] text-slate-400">

        {label}

      </div>



      <div className="mt-1 truncate text-sm font-black tracking-tight text-slate-800">

        {value}

      </div>

    </div>

  );

}



/* =========================================================

   BATCH DEMAND ROW

========================================================= */



function BatchDemandRow({

  batch,

}: {

  batch: DashboardBatchDemand;

}) {

  const hasCapacity =

    batch.capacity != null &&

    batch.capacity > 0 &&

    batch.seatsRemaining != null;



  const filledSeats =

    hasCapacity

      ? Math.max(

          0,

          batch.capacity! -

          batch.seatsRemaining!

        )

      : 0;



  const filledPercent =

    hasCapacity

      ? Math.min(

          100,

          Math.round(

            (

              filledSeats /

              batch.capacity!

            ) *

              100

          )

        )

      : 0;



  return (

    <div className="px-5 py-4 transition hover:bg-slate-50/70">

      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">

        <div className="min-w-0 flex-1">

          <div className="flex min-w-0 items-start gap-3">

            <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-brand/10 text-brand">

              <CalendarDays size={17} />

            </div>



            <div className="min-w-0">

              <div className="truncate text-sm font-black text-slate-900">

                {batch.courseName}

              </div>



              <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] font-semibold text-slate-400">

                <span>

                  {formatBatchDateRange(

                    batch.startDate,

                    batch.endDate

                  )}

                </span>



                <span className="inline-flex items-center gap-1">

                  <MapPin size={11} />

                  {batch.location}

                </span>



                <span className="uppercase tracking-[.08em]">

                  {formatModeLabel(

                    batch.mode

                  )}

                </span>

              </div>

            </div>

          </div>

        </div>



        <div className="grid grid-cols-4 gap-2 lg:w-[390px]">

          <DemandMetric

            label="Active"

            value={batch.activeDemand}

          />



          <DemandMetric

            label="Hot"

            value={batch.hotDemand}

            emphasis={batch.hotDemand > 0}

          />



          <DemandMetric

            label="Payment"

            value={batch.paymentPending}

            emphasis={batch.paymentPending > 0}

          />



          <DemandMetric

            label="Enrolled"

            value={batch.enrolled}

          />

        </div>

      </div>



      {hasCapacity && (

        <div className="mt-3 flex items-center gap-3 pl-[52px]">

          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-100">

            <div

              className="h-full rounded-full bg-brand transition-all duration-700"

              style={{

                width: `${filledPercent}%`,

              }}

            />

          </div>



          <div className="shrink-0 text-[10px] font-bold text-slate-400">

            {batch.seatsRemaining} seats remaining

          </div>

        </div>

      )}

    </div>

  );

}



function DemandMetric({

  label,

  value,

  emphasis = false,

}: {

  label: string;

  value: number;

  emphasis?: boolean;

}) {

  return (

    <div

      className={`rounded-xl border px-2.5 py-2 text-center ${

        emphasis

          ? 'border-orange-100 bg-orange-50'

          : 'border-slate-100 bg-slate-50'

      }`}

    >

      <div

        className={`text-base font-black ${

          emphasis

            ? 'text-orange-700'

            : 'text-slate-800'

        }`}

      >

        {value.toLocaleString()}

      </div>



      <div className="mt-0.5 text-[9px] font-black uppercase tracking-[.08em] text-slate-400">

        {label}

      </div>

    </div>

  );

}



/* =========================================================

   COMMERCIAL HELPERS

========================================================= */



function toDashboardNumber(

  value:

    | number

    | string

    | null

    | undefined

) {

  const parsed =

    Number(

      value ??

      0

    );



  return Number.isFinite(

    parsed

  )

    ? parsed

    : 0;

}



function dashboardSum(

  values: Array<

    number |

    string |

    null |

    undefined

  >

): number {

  return values.reduce<number>(

    (

      total,

      value

    ) =>

      total +

      toDashboardNumber(

        value

      ),

    0

  );

}



function formatDashboardMoney(

  value: number,

  currency: string

) {

  try {

    return new Intl.NumberFormat(

      currency === 'INR'

        ? 'en-IN'

        : 'en-US',

      {

        style: 'currency',

        currency,

        maximumFractionDigits: 0,

      }

    ).format(value);

  } catch {

    return `${currency} ${Math.round(

      value

    ).toLocaleString()}`;

  }

}



function formatBatchDateRange(

  startDate: string | null,

  endDate: string | null

) {

  if (!startDate) {

    return 'Date to be confirmed';

  }



  const start =

    new Date(

      `${startDate}T00:00:00Z`

    );



  const end =

    endDate

      ? new Date(

          `${endDate}T00:00:00Z`

        )

      : null;



  if (

    Number.isNaN(

      start.getTime()

    )

  ) {

    return startDate;

  }



  const startLabel =

    new Intl.DateTimeFormat(

      'en',

      {

        day: 'numeric',

        month: 'short',

        year: 'numeric',

        timeZone: 'UTC',

      }

    ).format(start);



  if (

    !end ||

    Number.isNaN(

      end.getTime()

    )

  ) {

    return startLabel;

  }



  const endLabel =

    new Intl.DateTimeFormat(

      'en',

      {

        day: 'numeric',

        month: 'short',

        year: 'numeric',

        timeZone: 'UTC',

      }

    ).format(end);



  return `${startLabel} – ${endLabel}`;

}



function formatModeLabel(

  mode: string

) {

  return mode

    .replaceAll('_', ' ')

    .replace(/\b\w/g, (character) =>

      character.toUpperCase()

    );

}



/* =========================================================

   ATTENTION METRIC

========================================================= */



function AttentionMetric({

  icon,

  label,

  value,

  note,

  href,

  tone,

}: {

  icon:

    React.ReactNode;



  label:

    string;



  value:

    number;



  note:

    string;



  href:

    string;



  tone:

    'rose' |

    'orange' |

    'violet' |

    'sky' |

    'amber' |

    'slate';

}) {



  const tones = {



    rose:

      'bg-rose-50 text-rose-600',



    orange:

      'bg-orange-50 text-orange-600',



    violet:

      'bg-violet-50 text-violet-600',



    sky:

      'bg-sky-50 text-sky-600',



    amber:

      'bg-amber-50 text-amber-600',



    slate:

      'bg-slate-100 text-slate-600',



  };





  return (



    <Link

      href={href}

      className="

        group

        flex

        items-center

        gap-3

        px-5

        py-4

        transition

        hover:bg-slate-50

      "

    >



      <div

        className={`

          grid

          h-10

          w-10

          shrink-0

          place-items-center

          rounded-xl



          ${tones[tone]}

        `}

      >

        {icon}

      </div>





      <div

        className="

          min-w-0

          flex-1

        "

      >



        <div

          className="

            text-xs

            font-bold

            text-slate-700

          "

        >

          {label}

        </div>





        <div

          className="

            mt-0.5

            truncate

            text-[10px]

            font-medium

            text-slate-400

          "

        >

          {note}

        </div>



      </div>





      <div

        className="

          text-2xl

          font-black

          tracking-tight

          text-slate-900

        "

      >

        {value

          .toLocaleString()}

      </div>





      <ArrowRight

        size={14}

        className="

          text-slate-300

          transition

          group-hover:translate-x-0.5

          group-hover:text-brand

        "

      />



    </Link>



  );



}





/* =========================================================

   ACTION LINK

========================================================= */



function ActionLink({

  href,

  icon,

  label,

  value,

  note,

}: {

  href:

    string;



  icon:

    React.ReactNode;



  label:

    string;



  value:

    number;



  note:

    string;

}) {



  return (



    <Link

      href={href}

      className="

        group

        flex

        items-center

        gap-3

        rounded-xl

        border

        border-slate-100

        bg-white

        p-3.5

        transition

        hover:-translate-y-0.5

        hover:border-slate-200

        hover:shadow-md

      "

    >



      <div

        className="

          grid

          h-9

          w-9

          shrink-0

          place-items-center

          rounded-xl

          bg-brand/10

          text-brand

          transition

          group-hover:bg-brand

          group-hover:text-white

        "

      >

        {icon}

      </div>





      <div

        className="

          min-w-0

          flex-1

        "

      >



        <div

          className="

            text-sm

            font-bold

            text-slate-800

          "

        >

          {label}

        </div>





        <div

          className="

            mt-0.5

            truncate

            text-[11px]

            text-slate-400

          "

        >

          {note}

        </div>



      </div>





      <div

        className="

          text-lg

          font-black

          tracking-tight

          text-slate-900

        "

      >

        {value

          .toLocaleString()}

      </div>





      <ArrowRight

        size={15}

        className="

          text-slate-300

          transition

          group-hover:translate-x-0.5

          group-hover:text-brand

        "

      />



    </Link>



  );



}





/* =========================================================

   PRIORITY SORT

========================================================= */



function priorityScore(

  stage: string,

  attention:

    | LeadAttention

    | undefined

) {

  let score =

    0;



  if (

    stage ===

    'payment_pending'

  ) {

    score +=

      100;

  }



  if (

    stage ===

    'high_intent'

  ) {

    score +=

      90;

  }



  if (

    stage ===

    'qualified'

  ) {

    score +=

      70;

  }



  if (

    attention

      ?.needsFirstContact

  ) {

    score +=

      80;

  }



  if (

    attention

      ?.needsReply

  ) {

    score +=

      60;

  }



  if (

    attention

      ?.unread

  ) {

    score +=

      30;

  }



  if (

    attention &&

    attention

      .waitingMinutes >=

      240

  ) {

    score +=

      30;

  } else if (

    attention &&

    attention

      .waitingMinutes >=

      60

  ) {

    score +=

      15;

  }



  return score;

}
