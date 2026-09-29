import Link from 'next/link';



import {

  ArrowRight,

  CheckCircle2,

  ClipboardCheck,

  ContactRound,

  CreditCard,

  Flame,

  ListTodo,

  MessageSquareMore,

  MessagesSquare,

  Sparkles,

  TrendingUp,

  UserCheck,

  UserRoundPlus,

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

  ] = await Promise.all([

    getLeads(),

    getPipelineCounts(),

    getDashboardSourceBreakdown(),

    getFollowUps(),

    getDashboardInboxStateMap(),

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
