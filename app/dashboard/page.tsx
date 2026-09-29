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

  isMockMode,

} from '@/lib/data';



import {

  getDashboardSnapshot,

} from '@/lib/dashboard-data';



import type {

  DashboardBatchDemand,

  DashboardRevenueSummary,

} from '@/lib/dashboard-data';





/* =========================================================

   DASHBOARD

========================================================= */



export default async function DashboardPage() {



  const snapshot =
    await getDashboardSnapshot();



  const {
    metrics,
    counts,
    sources,
    priorityLeads,
    revenueSummary,
    upcomingBatches,
    unvaluedOpenLeads,
  } = snapshot;



  /* =======================================================

     CORE METRICS

  ======================================================= */



  const total =
    metrics.total;



  const activePipeline =
    metrics.activePipeline;



  const qualified =
    metrics.qualifiedPlus;



  const needsReplyCount =
    metrics.needsReply;



  const unreadCount =
    metrics.unread;



  const needsFirstTouchCount =
    metrics.needsFirstTouch;



  const waitingOverHourCount =
    metrics.waitingOverHour;



  const priorityCount =
    metrics.priority;



  const newLast24Hours =
    metrics.newLast24h;



  const followupsDue =
    metrics.followupsDue;



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

              followupsDue

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

                followupsDue

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

   COMMERCIAL FORMAT HELPERS

========================================================= */



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
