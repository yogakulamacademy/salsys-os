import Link from 'next/link';







import {



  AlarmClock,



  ArrowRight,



  BadgeIndianRupee,



  Clock3,



  Inbox,



  Layers3,



  CalendarClock,



  Flame,



  Mail,



  Megaphone,



  MessageCircle,



  Phone,



  RefreshCw,



  Sparkles,



  Users,



} from 'lucide-react';







import { PageHeader } from '@/components/ui';



import { createClient } from '@/lib/supabase/server';



import {



  completeAdmissionFollowUpAction,



  logAdmissionContactAction,



  snoozeAdmissionFollowUpAction,



} from '@/app/admissions/actions';







type FollowUpRow = {



  task_id: string;



  lead_id: string;



  lead_code: string | null;



  lead_name: string | null;



  title: string | null;



  due_at: string | null;



  current_stage: string | null;



  intent: string | null;



  current_contact_channel: string | null;



};







type JourneyRow = {



  lead_id: string;



  lead_code: string | null;



  lead_name: string | null;



  current_stage: string | null;



  behaviour_temperature: string | null;



  engagement_score: number | string | null;



  total_sessions: number | string | null;



  sessions_after_lead: number | string | null;



  is_reengaged: boolean | null;



  last_visit_at: string | null;



  last_session_source: string | null;



  behaviour_reason: string | null;



};







type RevenueRow = {



  lead_id: string;



  lead_code: string | null;



  lead_name: string | null;



  current_stage: string | null;



  potential_value: number | string | null;



  currency: string | null;



  net_paid: number | string | null;



  outstanding_balance: number | string | null;



  payment_status: string | null;



};







type PaidMediaRow = {



  lead_id: string;



  lead_code: string | null;



  lead_name: string | null;



  platform_label: string | null;



  campaign_name: string | null;



  current_stage: string | null;



  behaviour_temperature: string | null;



  engagement_score: number | string | null;



  payment_status: string | null;



  revenue_inr: number | string | null;



  revenue_usd: number | string | null;



  allocated_acquisition_cost: number | string | null;



  acquisition_currency: string | null;



  country: string | null;



  first_paid_touch_at: string | null;



};







type NewLeadRow = {



  id: string;



  lead_code: string | null;



  display_name: string | null;



  first_name: string | null;



  last_name: string | null;



  current_stage: string | null;



  first_touch_source: string | null;



  preferred_location: string | null;



  created_at: string | null;



};







type PriorityRow = {



  lead_id: string;



  lead_code: string | null;



  lead_name: string | null;



  current_stage: string | null;



  intent: string | null;



  current_contact_channel: string | null;



  first_touch_source: string | null;



  preferred_location: string | null;



  course_name: string | null;



  created_at: string | null;



  behaviour_temperature: string | null;



  engagement_score: number | string | null;



  is_reengaged: boolean | null;



  last_visit_at: string | null;



  last_session_source: string | null;



  behaviour_reason: string | null;



  total_sessions: number | string | null;



  sessions_after_lead: number | string | null;



  payment_status: string | null;



  potential_value: number | string | null;



  currency: string | null;



  net_paid: number | string | null;



  outstanding_balance: number | string | null;



  next_followup_task_id: string | null;



  next_followup_title: string | null;



  next_followup_due_at: string | null;



  followup_overdue: boolean | null;



  followup_due_today: boolean | null;



  is_paid_media_lead: boolean | null;



  paid_media_platform: string | null;



  paid_media_campaign: string | null;



  paid_media_country: string | null;



  priority_score: number | string | null;



  priority_band: string | null;



  next_action_code: string | null;



  next_best_action: string | null;



  priority_reason: string | null;



};








type AutomationHealthRow = {
  last_run_id: string | null;
  last_run_status: string | null;
  last_trigger_source: string | null;
  last_processed_count: number | string | null;
  last_created_count: number | string | null;
  last_failed_count: number | string | null;
  last_started_at: string | null;
  last_completed_at: string | null;
  last_error_message: string | null;
  runs_24h: number | string | null;
  tasks_created_24h: number | string | null;
  failures_24h: number | string | null;
  last_success_at: string | null;
  last_failure_at: string | null;
  auto_tasks_logged_24h: number | string | null;
};

type RecentAutoTaskRow = {
  id: string;
  lead_id: string;
  lead_code: string | null;
  lead_name: string | null;
  rule_key: string | null;
  task_title: string | null;
  task_due_at: string | null;
  priority_score: number | string | null;
  next_best_action: string | null;
  priority_reason: string | null;
  created_at: string | null;
};


type LeadContactRow = {
  lead_id: string;
  lead_code: string | null;
  lead_name: string | null;
  email: string | null;
  whatsapp: string | null;
  phone: string | null;
};


type SlaOverviewRow = {
  leads_7d: number | string | null;
  responded_7d: number | string | null;
  responded_on_time_7d: number | string | null;
  responded_late_7d: number | string | null;
  breached_now: number | string | null;
  open_now: number | string | null;
  awaiting_human_response: number | string | null;
  avg_response_minutes: number | string | null;
  median_response_minutes: number | string | null;
  p90_response_minutes: number | string | null;
  on_time_response_rate_percent: number | string | null;
};

type SlaQueueRow = {
  lead_id: string;
  lead_code: string | null;
  lead_name: string | null;
  current_stage: string | null;
  current_contact_channel: string | null;
  first_touch_source: string | null;
  preferred_location: string | null;
  created_at: string | null;
  sla_due_at: string | null;
  first_outbound_at: string | null;
  first_outbound_sender_type: string | null;
  first_human_outbound_at: string | null;
  first_action_at: string | null;
  first_progress_stage: string | null;
  response_minutes: number | string | null;
  human_response_minutes: number | string | null;
  first_action_minutes: number | string | null;
  lead_age_minutes: number | string | null;
  sla_status: string | null;
  human_sla_status: string | null;
  awaiting_first_response: boolean | null;
  awaiting_human_response: boolean | null;
};


type InboxAttentionRow = {
  lead_id: string;
  latest_message_at: string | null;
  latest_direction: string | null;
  last_inbound_at: string | null;
  last_outbound_at: string | null;
  needs_reply: boolean | null;
};


type InboxReadRow = {
  lead_id: string;
  last_read_at: string | null;
};


type InboxLeadState = InboxAttentionRow & {
  unread: boolean;
};


type LeadOperationalRow = {
  id: string;
  preferred_batch_id: string | null;
  preferred_month: string | null;
  last_contacted_at: string | null;
  expected_close_date: string | null;
};


type CourseBatchRow = {
  id: string;
  batch_code: string | null;
  start_date: string | null;
  end_date: string | null;
  location: string | null;
  mode: string | null;
  capacity: number | string | null;
  seats_remaining: number | string | null;
  active: boolean | null;
};







type SearchParams = {



  notice?: string | string[];



  error?: string | string[];



  band?: string | string[];



};







export default async function AdmissionsDeskPage({



  searchParams,



}: {



  searchParams?: Promise<SearchParams>;



}) {



  const resolved =



    (await searchParams) ?? {};







  const notice = one(resolved.notice);



  const error = one(resolved.error);



  const band = one(resolved.band);



  const supabase = await createClient();



  const {
    data: {
      user,
    },
  } = await supabase.auth.getUser();







  const {



    startUtc,



    endUtc,



    todayLabel,



  } = indiaDayBoundsUtc();







  const [



    followupsResult,



    hotJourneyResult,



    reengagedResult,



    paymentPendingResult,



    hotPaidMediaResult,



    newLeadsResult,



    priorityResult,



    automationHealthResult,



    recentAutoTasksResult,



    slaOverviewResult,



    slaQueueResult,



    leadContactsResult,



    inboxAttentionResult,



    leadOperationalResult,



    courseBatchesResult,



  ] = await Promise.all([



    supabase



      .from('v_followups_due')



      .select('*')



      .lte('due_at', endUtc)



      .order('due_at', { ascending: true })



      .limit(100),







    supabase



      .from('v_lead_journey_intelligence')



      .select('*')



      .eq('behaviour_temperature', 'hot')



      .neq('current_stage', 'enrolled')



      .order('engagement_score', { ascending: false })



      .limit(12),







    supabase



      .from('v_lead_journey_intelligence')



      .select('*')



      .eq('is_reengaged', true)



      .neq('current_stage', 'enrolled')



      .order('last_visit_at', {



        ascending: false,



        nullsFirst: false,



      })



      .limit(12),







    supabase



      .from('v_lead_revenue_status')



      .select('*')



      .eq('current_stage', 'payment_pending')



      .order('outstanding_balance', {



        ascending: false,



        nullsFirst: false,



      })



      .limit(20),







    supabase



      .from('v_paid_media_leads_ui')



      .select('*')



      .eq('behaviour_temperature', 'hot')



      .neq('current_stage', 'enrolled')



      .order('engagement_score', {



        ascending: false,



        nullsFirst: false,



      })



      .limit(12),







    supabase



      .from('leads')



      .select(



        'id,lead_code,display_name,first_name,last_name,current_stage,first_touch_source,preferred_location,created_at'



      )



      .eq('current_stage', 'new')



      .order('created_at', { ascending: false })



      .limit(12),







    supabase



      .from('v_admissions_priority_queue')



      .select('*')



      .order('priority_score', { ascending: false })



      .order('next_followup_due_at', {



        ascending: true,



        nullsFirst: false,



      })



      .limit(250),







    supabase



      .from('v_admissions_automation_health')



      .select('*')



      .maybeSingle(),







    supabase



      .from('v_admissions_recent_auto_tasks')



      .select('*')



      .order('created_at', { ascending: false })



      .limit(6),







    supabase



      .from('v_admissions_sla_overview')



      .select('*')



      .maybeSingle(),







    supabase



      .from('v_admissions_sla_queue')



      .select('*')



      .order('sla_due_at', { ascending: true })



      .limit(12),







    supabase



      .from('v_admissions_lead_contacts')



      .select('*')



      .limit(1000),



    supabase
      .from('v_lead_inbox_attention')
      .select(`
        lead_id,
        latest_message_at,
        latest_direction,
        last_inbound_at,
        last_outbound_at,
        needs_reply
      `)
      .limit(1000),



    supabase
      .from('leads')
      .select(`
        id,
        preferred_batch_id,
        preferred_month,
        last_contacted_at,
        expected_close_date
      `)
      .limit(1000),



    supabase
      .from('course_batches')
      .select(`
        id,
        batch_code,
        start_date,
        end_date,
        location,
        mode,
        capacity,
        seats_remaining,
        active
      `)
      .eq('active', true)
      .order('start_date', { ascending: true }),



  ]);



  const inboxReadResult =
    user
      ? await supabase
          .from('lead_inbox_reads')
          .select('lead_id,last_read_at')
          .eq('user_id', user.id)
          .limit(1000)
      : {
          data: [] as InboxReadRow[],
          error: null,
        };







  const errors = [



    followupsResult.error,



    hotJourneyResult.error,



    reengagedResult.error,



    paymentPendingResult.error,



    hotPaidMediaResult.error,



    newLeadsResult.error,



    priorityResult.error,



    automationHealthResult.error,



    recentAutoTasksResult.error,



    slaOverviewResult.error,



    slaQueueResult.error,



    leadContactsResult.error,



    inboxAttentionResult.error,



    leadOperationalResult.error,



    courseBatchesResult.error,



    inboxReadResult.error,



  ].filter(Boolean);







  if (errors.length > 0) {



    throw new Error(



      `Unable to load Admissions Desk: ${errors



        .map((error) => error?.message)



        .join(' | ')}`



    );



  }







  const followups =



    (followupsResult.data ?? []) as FollowUpRow[];







  const hotJourney =



    (hotJourneyResult.data ?? []) as JourneyRow[];







  const reengaged =



    (reengagedResult.data ?? []) as JourneyRow[];







  const paymentPending =



    (paymentPendingResult.data ?? []) as RevenueRow[];







  const hotPaidMedia =



    (hotPaidMediaResult.data ?? []) as PaidMediaRow[];







  const newLeads =



    (newLeadsResult.data ?? []) as NewLeadRow[];







  const priorityQueue =



    (priorityResult.data ?? []) as PriorityRow[];







  const automationHealth =



    (automationHealthResult.data ?? null) as AutomationHealthRow | null;







  const recentAutoTasks =



    (recentAutoTasksResult.data ?? []) as RecentAutoTaskRow[];







  const slaOverview =



    (slaOverviewResult.data ?? null) as SlaOverviewRow | null;







  const slaQueue =



    (slaQueueResult.data ?? []) as SlaQueueRow[];







  const leadContacts =



    (leadContactsResult.data ?? []) as LeadContactRow[];



  const inboxAttention =
    (inboxAttentionResult.data ?? []) as InboxAttentionRow[];



  const inboxReads =
    (inboxReadResult.data ?? []) as InboxReadRow[];



  const leadOperational =
    (leadOperationalResult.data ?? []) as LeadOperationalRow[];



  const courseBatches =
    (courseBatchesResult.data ?? []) as CourseBatchRow[];







  const contactsByLeadId = new Map(



    leadContacts.map((row) => [row.lead_id, row] as const)



  );



  const inboxReadByLeadId =
    new Map(
      inboxReads.map(
        (row) => [
          row.lead_id,
          row.last_read_at,
        ] as const
      )
    );



  const inboxByLeadId =
    new Map<string, InboxLeadState>(
      inboxAttention.map((row) => {
        const inboundAt =
          row.last_inbound_at
            ? new Date(row.last_inbound_at).getTime()
            : 0;

        const readValue =
          inboxReadByLeadId.get(row.lead_id);

        const readAt =
          readValue
            ? new Date(readValue).getTime()
            : 0;

        return [
          row.lead_id,
          {
            ...row,
            unread:
              inboundAt > 0 &&
              (
                !readAt ||
                inboundAt > readAt
              ),
          },
        ] as const;
      })
    );



  const leadOperationalById =
    new Map(
      leadOperational.map(
        (row) => [
          row.id,
          row,
        ] as const
      )
    );



  const batchesById =
    new Map(
      courseBatches.map(
        (row) => [
          row.id,
          row,
        ] as const
      )
    );



  const slaByLeadId =
    new Map(
      slaQueue.map(
        (row) => [
          row.lead_id,
          row,
        ] as const
      )
    );







  const filteredPriorityQueue =



    band && band !== 'all'



      ? priorityQueue.filter(



          (row) => row.priority_band === band



        )



      : priorityQueue;







  const criticalPriorityCount =



    priorityQueue.filter(



      (row) => row.priority_band === 'critical'



    ).length;







  const highPriorityCount =



    priorityQueue.filter(



      (row) => row.priority_band === 'high'



    ).length;







  const mediumPriorityCount =



    priorityQueue.filter(



      (row) => row.priority_band === 'medium'



    ).length;







  const lowPriorityCount =



    priorityQueue.filter(



      (row) => row.priority_band === 'low'



    ).length;



  const needsReplyCount =
    inboxAttention.filter(
      (row) => Boolean(row.needs_reply)
    ).length;



  const unreadCount =
    [...inboxByLeadId.values()].filter(
      (row) => row.unread
    ).length;



  const breachedSlaCount =
    toNumber(
      slaOverview?.breached_now
    );



  const awaitingHumanCount =
    toNumber(
      slaOverview?.awaiting_human_response
    );







  const overdue = followups.filter((row) =>



    Boolean(



      row.due_at &&



      new Date(row.due_at).getTime() <



        new Date(startUtc).getTime()



    )



  );







  const dueToday = followups.filter((row) => {



    if (!row.due_at) return false;







    const time = new Date(row.due_at).getTime();







    return (



      time >= new Date(startUtc).getTime() &&



      time <= new Date(endUtc).getTime()



    );



  });







  const priorityLeadIds = new Set<string>();







  for (const row of overdue) {



    if (row.lead_id) priorityLeadIds.add(row.lead_id);



  }







  for (const row of hotJourney) {



    if (row.lead_id) priorityLeadIds.add(row.lead_id);



  }







  for (const row of paymentPending) {



    if (row.lead_id) priorityLeadIds.add(row.lead_id);



  }







  for (const row of reengaged) {



    if (row.lead_id) priorityLeadIds.add(row.lead_id);



  }







  const outstandingInr = paymentPending



    .filter(



      (row) =>



        row.currency?.toUpperCase() === 'INR'



    )



    .reduce(



      (total, row) =>



        total + toNumber(row.outstanding_balance),



      0



    );







  const outstandingUsd = paymentPending



    .filter(



      (row) =>



        row.currency?.toUpperCase() === 'USD'



    )



    .reduce(



      (total, row) =>



        total + toNumber(row.outstanding_balance),



      0



    );







  return (



    <>



      <PageHeader



        title="Admissions Desk"



        description={`Your daily admissions workspace for ${todayLabel}: follow-ups, hot leads, paid-media opportunities, payment-pending prospects and re-engaged visitors.`}



        actions={



          <div className="flex flex-wrap gap-2">



            <Link



              href="/follow-ups"



              className="btn-secondary"



            >



              <CalendarClock size={16} />



              All follow-ups



            </Link>







            <Link



              href="/paid-media-leads"



              className="btn-secondary"



            >



              <Megaphone size={16} />



              Paid media



            </Link>



          </div>



        }



      />







      {error && (



        <div className="mt-4 rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">



          {error}



        </div>



      )}







      {notice && (



        <div className="mt-4 rounded-xl border border-emerald-100 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-700">



          {notice === 'followup-completed'



            ? 'Follow-up completed.'



            : notice === 'followup-snoozed'



              ? 'Follow-up snoozed until tomorrow at 10:00 AM.'



              : notice === 'contact-logged'



                ? 'Outbound contact logged. Response SLA and lead history were updated.'



                : 'Admissions Desk updated.'}



        </div>



      )}







      <section className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-6">



        <MetricCard



          icon={<AlarmClock size={17} />}



          label="Overdue follow-ups"



          value={formatNumber(overdue.length)}



          sub="Needs action first"



          emphasis={overdue.length > 0}



        />







        <MetricCard



          icon={<CalendarClock size={17} />}



          label="Due today"



          value={formatNumber(dueToday.length)}



          sub="Scheduled follow-ups"



        />







        <MetricCard



          icon={<Flame size={17} />}



          label="Hot leads"



          value={formatNumber(hotJourney.length)}



          sub="Based on website behaviour"



        />







        <MetricCard



          icon={<RefreshCw size={17} />}



          label="Re-engaged"



          value={formatNumber(reengaged.length)}



          sub="Returned after becoming a lead"



        />







        <MetricCard



          icon={<BadgeIndianRupee size={17} />}



          label="Payment pending"



          value={formatNumber(paymentPending.length)}



          sub={`${formatMoney(



            outstandingInr,



            'INR'



          )} + ${formatMoney(



            outstandingUsd,



            'USD'



          )} outstanding`}



        />







        <MetricCard



          icon={<Sparkles size={17} />}



          label="Needs attention"



          value={formatNumber(priorityLeadIds.size)}



          sub="Unique priority leads"



        />



      </section>



      <AdmissionsOperationsPanel
        needsReply={needsReplyCount}
        unread={unreadCount}
        breached={breachedSlaCount}
        awaitingHuman={awaitingHumanCount}
        overdue={overdue.length}
        dueToday={dueToday.length}
        critical={criticalPriorityCount}
        high={highPriorityCount}
        medium={mediumPriorityCount}
        low={lowPriorityCount}
        paymentPending={paymentPending.length}
        hot={hotJourney.length}
      />







      <AutomationHealthPanel
        health={automationHealth}
        recentTasks={recentAutoTasks}
      />







      <ResponseSlaPanel
        overview={slaOverview}
        queue={slaQueue}
        contactsByLeadId={contactsByLeadId}
      />







      <section className="card-pad mt-4">



        <div className="flex flex-wrap items-start justify-between gap-4">



          <div>



            <div className="eyebrow">



              Priority intelligence



            </div>



            <div className="section-title mt-1">



              Ranked admissions action queue



            </div>



            <p className="mt-1 max-w-3xl text-xs leading-5 text-slate-400">



              Stage, website behaviour, follow-up urgency, payment status, re-engagement and paid-media context are combined into a deterministic 0–100 score. This does not change the CRM stage automatically.



            </p>



          </div>







          <div className="flex flex-wrap gap-2">



            <PriorityTab



              href="/admissions"



              active={!band || band === 'all'}



              label={`All ${priorityQueue.length}`}



            />



            <PriorityTab



              href="/admissions?band=critical"



              active={band === 'critical'}



              label={`Critical ${criticalPriorityCount}`}



            />



            <PriorityTab



              href="/admissions?band=high"



              active={band === 'high'}



              label={`High ${highPriorityCount}`}



            />



            <PriorityTab



              href="/admissions?band=medium"



              active={band === 'medium'}



              label={`Medium ${mediumPriorityCount}`}



            />



            <PriorityTab



              href="/admissions?band=low"



              active={band === 'low'}



              label={`Low ${lowPriorityCount}`}



            />



          </div>



        </div>







        <div className="mt-4 space-y-3">



          {filteredPriorityQueue.length === 0 ? (



            <div className="rounded-xl bg-slate-50 px-4 py-10 text-center text-sm text-slate-400">



              No leads match this priority filter.



            </div>



          ) : (



            filteredPriorityQueue.map((row) => {
              const operational =
                leadOperationalById.get(row.lead_id) ?? null;

              const batch =
                operational?.preferred_batch_id
                  ? batchesById.get(
                      operational.preferred_batch_id
                    ) ?? null
                  : null;

              return (
                <PriorityLeadCard
                  key={row.lead_id}
                  row={row}
                  contact={contactsByLeadId.get(row.lead_id) ?? null}
                  inbox={inboxByLeadId.get(row.lead_id) ?? null}
                  sla={slaByLeadId.get(row.lead_id) ?? null}
                  operational={operational}
                  batch={batch}
                />
              );
            })



          )}



        </div>



      </section>







      <section className="mt-4 grid gap-4 xl:grid-cols-2">



        <QueueCard



          title="Overdue follow-ups"



          description="Work these first. Old follow-ups are the easiest place for warm leads to get lost."



          empty="No overdue follow-ups."



          action={



            <Link



              href="/follow-ups"



              className="text-xs font-bold text-brand"



            >



              Open follow-ups



            </Link>



          }



        >



          {overdue.slice(0, 10).map((row) => (



            <FollowUpActionRow



              key={row.task_id}



              row={row}



              tone="urgent"



            />



          ))}



        </QueueCard>







        <QueueCard



          title="Due today"



          description="Follow-ups scheduled for today in India time."



          empty="Nothing else due today."



        >



          {dueToday.slice(0, 10).map((row) => (



            <FollowUpActionRow



              key={row.task_id}



              row={row}



            />



          ))}



        </QueueCard>



      </section>







      <section className="mt-4 grid gap-4 xl:grid-cols-2">



        <QueueCard



          title="Hot leads"



          description="High website engagement that may justify immediate admissions follow-up."



          empty="No hot leads right now."



          action={



            <Link



              href="/re-engaged"



              className="text-xs font-bold text-brand"



            >



              Journey intelligence



            </Link>



          }



        >



          {hotJourney.map((row) => (



            <LeadQueueRow



              key={row.lead_id}



              leadId={row.lead_id}



              leadName={row.lead_name}



              leadCode={row.lead_code}



              primary={`${formatNumber(



                row.engagement_score



              )}/100 engagement score`}



              secondary={`${formatNumber(



                row.total_sessions



              )} sessions · ${pretty(



                row.current_stage || 'new'



              )}`}



              meta={row.behaviour_reason || 'Hot behaviour'}



              tone="hot"



            />



          ))}



        </QueueCard>







        <QueueCard



          title="Hot paid-media leads"



          description="High-engagement prospects whose acquisition journey started from paid media."



          empty="No hot paid-media leads right now."



          action={



            <Link



              href="/paid-media-leads?temperature=hot"



              className="text-xs font-bold text-brand"



            >



              Open paid-media queue



            </Link>



          }



        >



          {hotPaidMedia.map((row) => (



            <LeadQueueRow



              key={row.lead_id}



              leadId={row.lead_id}



              leadName={row.lead_name}



              leadCode={row.lead_code}



              primary={



                row.campaign_name ||



                row.platform_label ||



                'Paid media'



              }



              secondary={`${row.platform_label || 'Paid Media'} · ${pretty(



                row.current_stage || 'new'



              )}`}



              meta={`${row.country || 'Unknown country'} · Score ${formatNumber(



                row.engagement_score



              )}`}



              tone="paid"



            />



          ))}



        </QueueCard>



      </section>







      <section className="mt-4 grid gap-4 xl:grid-cols-[1.1fr_.9fr]">



        <QueueCard



          title="Payment pending"



          description="Prospects already near conversion, with remaining balance visible."



          empty="No payment-pending leads."



          action={



            <Link



              href="/pipeline"



              className="text-xs font-bold text-brand"



            >



              Open pipeline



            </Link>



          }



        >



          {paymentPending.map((row) => (



            <LeadQueueRow



              key={row.lead_id}



              leadId={row.lead_id}



              leadName={row.lead_name}



              leadCode={row.lead_code}



              primary={



                row.outstanding_balance == null ||



                !row.currency



                  ? 'Balance unavailable'



                  : `${formatMoney(



                      row.outstanding_balance,



                      row.currency



                    )} outstanding`



              }



              secondary={`${pretty(



                row.payment_status || 'unpaid'



              )} · ${formatMoney(



                row.net_paid,



                row.currency || 'USD'



              )} received`}



              meta={



                row.potential_value == null ||



                !row.currency



                  ? 'Potential value not set'



                  : `Potential ${formatMoney(



                      row.potential_value,



                      row.currency



                    )}`



              }



              tone="payment"



            />



          ))}



        </QueueCard>







        <QueueCard



          title="Re-engaged leads"



          description="Existing leads who came back to the website after enquiry."



          empty="No re-engaged leads right now."



          action={



            <Link



              href="/re-engaged"



              className="text-xs font-bold text-brand"



            >



              View all re-engaged



            </Link>



          }



        >



          {reengaged.map((row) => (



            <LeadQueueRow



              key={row.lead_id}



              leadId={row.lead_id}



              leadName={row.lead_name}



              leadCode={row.lead_code}



              primary={`${formatNumber(



                row.sessions_after_lead



              )} post-lead sessions`}



              secondary={`${pretty(



                row.last_session_source || 'direct'



              )} · Score ${formatNumber(



                row.engagement_score



              )}`}



              meta={



                row.last_visit_at



                  ? `Last visit ${formatDateTime(



                      row.last_visit_at



                    )}`



                  : 'Last visit unavailable'



              }



              tone="reengaged"



            />



          ))}



        </QueueCard>



      </section>







      <section className="card-pad mt-4">



        <div className="flex flex-wrap items-start justify-between gap-3">



          <div>



            <div className="eyebrow">



              Fresh enquiries



            </div>



            <div className="section-title mt-1">



              New leads waiting to be worked



            </div>



            <p className="mt-1 text-xs leading-5 text-slate-400">



              New CRM leads that have not yet moved into Contacted.



            </p>



          </div>







          <Link



            href="/leads"



            className="text-xs font-bold text-brand"



          >



            All leads



          </Link>



        </div>







        <div className="mt-4 grid gap-2 lg:grid-cols-2">



          {newLeads.length === 0 ? (



            <div className="rounded-xl bg-slate-50 px-4 py-8 text-center text-sm text-slate-400 lg:col-span-2">



              No new leads waiting right now.



            </div>



          ) : (



            newLeads.map((row) => (



              <LeadQueueRow



                key={row.id}



                leadId={row.id}



                leadName={leadName(row)}



                leadCode={row.lead_code}



                primary={



                  row.first_touch_source



                    ? `Source: ${pretty(



                        row.first_touch_source



                      )}`



                    : 'Source unavailable'



                }



                secondary={



                  row.preferred_location ||



                  'Location not selected'



                }



                meta={



                  row.created_at



                    ? `Created ${formatDateTime(



                        row.created_at



                      )}`



                    : 'Created date unavailable'



                }



              />



            ))



          )}



        </div>



      </section>



    </>



  );



}









function AdmissionsOperationsPanel({
  needsReply,
  unread,
  breached,
  awaitingHuman,
  overdue,
  dueToday,
  critical,
  high,
  medium,
  low,
  paymentPending,
  hot,
}: {
  needsReply: number;
  unread: number;
  breached: number;
  awaitingHuman: number;
  overdue: number;
  dueToday: number;
  critical: number;
  high: number;
  medium: number;
  low: number;
  paymentPending: number;
  hot: number;
}) {
  const responseMax = Math.max(
    1,
    needsReply,
    unread,
    breached,
    awaitingHuman
  );

  const priorityMax = Math.max(
    1,
    critical,
    high,
    medium,
    low
  );

  const actionMax = Math.max(
    1,
    overdue,
    dueToday,
    paymentPending,
    hot
  );

  const responseRisk =
    needsReply +
    breached +
    awaitingHuman;

  return (
    <section className="card-pad mt-4">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="eyebrow">
            Operations intelligence
          </div>
          <div className="section-title mt-1">
            Where the admissions team should focus now
          </div>
          <p className="mt-1 max-w-3xl text-xs leading-5 text-slate-400">
            Live conversation pressure, SLA risk, priority workload and conversion
            signals are shown together so the team can decide what to work first.
          </p>
        </div>

        <Link
          href="/conversations"
          className="inline-flex items-center gap-1.5 text-xs font-bold text-brand hover:underline"
        >
          Open inbox
          <ArrowRight size={13} />
        </Link>
      </div>

      <div className="mt-5 grid gap-4 xl:grid-cols-3">
        <div
          className={`rounded-2xl border p-4 ${
            responseRisk > 0
              ? 'border-red-100 bg-red-50/35'
              : 'border-slate-100 bg-slate-50/60'
          }`}
        >
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[.14em] text-slate-400">
                <Inbox size={14} />
                Response pressure
              </div>
              <div className="mt-1 text-sm font-black text-slate-800">
                Conversations needing attention
              </div>
            </div>

            <div
              className={`rounded-full px-2.5 py-1 text-[10px] font-black ${
                responseRisk > 0
                  ? 'bg-red-100 text-red-700'
                  : 'bg-emerald-100 text-emerald-700'
              }`}
            >
              {responseRisk > 0
                ? `${formatNumber(responseRisk)} signals`
                : 'Clear'}
            </div>
          </div>

          <div className="mt-4 space-y-3">
            <OperationalBar
              label="Needs reply"
              value={needsReply}
              max={responseMax}
              tone="red"
            />
            <OperationalBar
              label="Unread"
              value={unread}
              max={responseMax}
              tone="sky"
            />
            <OperationalBar
              label="SLA breached"
              value={breached}
              max={responseMax}
              tone="red"
            />
            <OperationalBar
              label="Awaiting human"
              value={awaitingHuman}
              max={responseMax}
              tone="amber"
            />
          </div>
        </div>

        <div className="rounded-2xl border border-slate-100 bg-slate-50/60 p-4">
          <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[.14em] text-slate-400">
            <Layers3 size={14} />
            Priority workload
          </div>
          <div className="mt-1 text-sm font-black text-slate-800">
            Ranked queue distribution
          </div>

          <div className="mt-4 space-y-3">
            <OperationalBar
              label="Critical"
              value={critical}
              max={priorityMax}
              tone="red"
            />
            <OperationalBar
              label="High"
              value={high}
              max={priorityMax}
              tone="orange"
            />
            <OperationalBar
              label="Medium"
              value={medium}
              max={priorityMax}
              tone="amber"
            />
            <OperationalBar
              label="Low"
              value={low}
              max={priorityMax}
              tone="slate"
            />
          </div>
        </div>

        <div className="rounded-2xl border border-slate-100 bg-slate-50/60 p-4">
          <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[.14em] text-slate-400">
            <Clock3 size={14} />
            Action pressure
          </div>
          <div className="mt-1 text-sm font-black text-slate-800">
            Follow-up and conversion workload
          </div>

          <div className="mt-4 space-y-3">
            <OperationalBar
              label="Overdue"
              value={overdue}
              max={actionMax}
              tone="red"
            />
            <OperationalBar
              label="Due today"
              value={dueToday}
              max={actionMax}
              tone="sky"
            />
            <OperationalBar
              label="Payment pending"
              value={paymentPending}
              max={actionMax}
              tone="orange"
            />
            <OperationalBar
              label="Hot leads"
              value={hot}
              max={actionMax}
              tone="amber"
            />
          </div>
        </div>
      </div>
    </section>
  );
}


function OperationalBar({
  label,
  value,
  max,
  tone,
}: {
  label: string;
  value: number;
  max: number;
  tone:
    | 'red'
    | 'orange'
    | 'amber'
    | 'sky'
    | 'slate';
}) {
  const tones = {
    red: 'bg-red-500',
    orange: 'bg-orange-500',
    amber: 'bg-amber-500',
    sky: 'bg-sky-500',
    slate: 'bg-slate-400',
  };

  const width =
    value <= 0
      ? 0
      : Math.max(
          7,
          Math.min(
            100,
            Math.round(
              (value / Math.max(1, max)) * 100
            )
          )
        );

  return (
    <div>
      <div className="flex items-center justify-between gap-3">
        <span className="text-[11px] font-semibold text-slate-500">
          {label}
        </span>
        <span className="text-xs font-black text-slate-800">
          {formatNumber(value)}
        </span>
      </div>

      <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-white ring-1 ring-slate-100">
        <div
          className={`h-full rounded-full ${tones[tone]} transition-all duration-500`}
          style={{
            width: `${width}%`,
          }}
        />
      </div>
    </div>
  );
}







function ResponseSlaPanel({
  overview,
  queue,
  contactsByLeadId,
}: {
  overview: SlaOverviewRow | null;
  queue: SlaQueueRow[];
  contactsByLeadId: Map<string, LeadContactRow>;
}) {
  const breached = toNumber(overview?.breached_now);
  const open = toNumber(overview?.open_now);
  const awaitingHuman = toNumber(
    overview?.awaiting_human_response
  );
  const onTimeRate = toNumber(
    overview?.on_time_response_rate_percent
  );

  const hasRisk =
    breached > 0 ||
    awaitingHuman > 0;

  return (
    <section className="mt-4 grid gap-4 xl:grid-cols-[0.9fr_1.1fr]">
      <div className="card-pad">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="eyebrow">
              Response SLA
            </div>
            <div className="section-title mt-1">
              First-response speed
            </div>
            <p className="mt-1 max-w-xl text-xs leading-5 text-slate-400">
              30-minute admissions SLA during 8:00 AM–8:00 PM IST.
              Response timing uses outbound messages logged in the CRM, while
              human response is tracked separately for future AI-assisted
              conversations.
            </p>
          </div>

          <span
            className={`inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-bold ${
              hasRisk
                ? 'bg-red-100 text-red-700'
                : 'bg-emerald-100 text-emerald-700'
            }`}
          >
            <span
              className={`h-2 w-2 rounded-full ${
                hasRisk
                  ? 'bg-red-500'
                  : 'bg-emerald-500'
              }`}
            />
            {hasRisk ? 'Needs attention' : 'Within SLA'}
          </span>
        </div>

        <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <AutomationMiniMetric
            label="On-time rate"
            value={`${formatDecimalValue(onTimeRate, 1)}%`}
            sub="Responded leads · 7d"
          />
          <AutomationMiniMetric
            label="Median response"
            value={formatMinutesDuration(
              overview?.median_response_minutes
            )}
            sub="First outbound · 7d"
          />
          <AutomationMiniMetric
            label="P90 response"
            value={formatMinutesDuration(
              overview?.p90_response_minutes
            )}
            sub="Slowest response band"
          />
          <AutomationMiniMetric
            label="Breached now"
            value={formatNumber(breached)}
            sub="No response by deadline"
            alert={breached > 0}
          />
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-4">
          <AutomationInfoLine
            label="Leads · 7d"
            value={formatNumber(overview?.leads_7d)}
          />
          <AutomationInfoLine
            label="Responded"
            value={formatNumber(overview?.responded_7d)}
          />
          <AutomationInfoLine
            label="Open SLA"
            value={formatNumber(open)}
            alert={open > 0}
          />
          <AutomationInfoLine
            label="Awaiting human"
            value={formatNumber(awaitingHuman)}
            alert={awaitingHuman > 0}
          />
        </div>
      </div>

      <div className="card-pad">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="eyebrow">
              Response queue
            </div>
            <div className="section-title mt-1">
              Leads approaching or past SLA
            </div>
            <p className="mt-1 text-xs leading-5 text-slate-400">
              Active admissions leads with an open or breached first-response
              or human-response SLA.
            </p>
          </div>

          <div
            className={`rounded-full px-2.5 py-1 text-[10px] font-bold ${
              breached > 0
                ? 'bg-red-100 text-red-700'
                : 'bg-slate-100 text-slate-500'
            }`}
          >
            {formatNumber(queue.length)} visible
          </div>
        </div>

        <div className="mt-4 space-y-2">
          {queue.length === 0 ? (
            <div className="rounded-xl bg-slate-50 px-4 py-8 text-center text-sm text-slate-400">
              No leads currently waiting on the response SLA.
            </div>
          ) : (
            queue.slice(0, 8).map((row) => {
              const status =
                row.sla_status || 'open';
              const breachedRow =
                status === 'breached';
              const humanBreached =
                row.human_sla_status === 'human_breached';

              const contact =
                contactsByLeadId.get(row.lead_id) ?? null;

              return (
                <div
                  key={row.lead_id}
                  className={`group rounded-xl border px-4 py-3 transition-all duration-150 hover:-translate-y-0.5 hover:shadow-sm ${
                    breachedRow || humanBreached
                      ? 'border-red-100 bg-red-50/60'
                      : 'border-amber-100 bg-amber-50/40'
                  }`}
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <Link
                          href={`/leads/${row.lead_id}`}
                          className="truncate text-sm font-bold text-slate-800 group-hover:text-brand"
                        >
                          {row.lead_name ||
                            row.lead_code ||
                            'Lead'}
                        </Link>

                        <span
                          className={`rounded-full px-2 py-0.5 text-[9px] font-bold uppercase ${slaBadgeClass(
                            status
                          )}`}
                        >
                          {pretty(status)}
                        </span>
                      </div>

                      <div className="mt-0.5 text-[10px] font-medium text-slate-400">
                        {row.lead_code || '—'} ·{' '}
                        {pretty(row.current_stage || 'new')} ·{' '}
                        {pretty(
                          row.current_contact_channel || 'other'
                        )}
                      </div>

                      <div className="mt-2 text-xs font-semibold text-slate-600">
                        {row.awaiting_first_response
                          ? `Awaiting first response · age ${formatMinutesDuration(
                              row.lead_age_minutes
                            )}`
                          : `First response ${formatMinutesDuration(
                              row.response_minutes
                            )}`}
                      </div>

                      <div className="mt-1 text-[10px] text-slate-400">
                        {row.sla_due_at
                          ? `SLA due ${formatDateTime(
                              row.sla_due_at
                            )}`
                          : 'SLA deadline unavailable'}
                        {row.awaiting_human_response
                          ? ' · Human reply still pending'
                          : row.human_response_minutes != null
                            ? ` · Human ${formatMinutesDuration(
                                row.human_response_minutes
                              )}`
                            : ''}
                      </div>
                    </div>

                    <Link
                      href={`/leads/${row.lead_id}`}
                      className="mt-1 shrink-0 text-slate-300 transition-transform duration-150 hover:translate-x-0.5 hover:text-brand"
                      aria-label="Open lead"
                    >
                      <ArrowRight size={15} />
                    </Link>
                  </div>

                  <div className="mt-3 border-t border-black/5 pt-3">
                    <ContactActions
                      contact={contact}
                      compact
                    />

                    <ContactLogActions
                      leadId={row.lead_id}
                      contact={contact}
                    />
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </section>
  );
}

function slaBadgeClass(
  status: string
) {
  if (
    status === 'breached' ||
    status === 'responded_late'
  ) {
    return 'bg-red-100 text-red-700';
  }

  if (status === 'open') {
    return 'bg-amber-100 text-amber-700';
  }

  if (status === 'responded_on_time') {
    return 'bg-emerald-100 text-emerald-700';
  }

  return 'bg-slate-100 text-slate-600';
}

function formatMinutesDuration(
  value:
    | number
    | string
    | null
    | undefined
) {
  if (
    value === null ||
    value === undefined ||
    value === ''
  ) {
    return '—';
  }

  const minutes = Number(value);

  if (!Number.isFinite(minutes)) {
    return '—';
  }

  if (minutes < 60) {
    return `${Math.round(minutes)}m`;
  }

  const hours =
    Math.floor(minutes / 60);

  const remaining =
    Math.round(minutes % 60);

  return remaining > 0
    ? `${hours}h ${remaining}m`
    : `${hours}h`;
}

function formatDecimalValue(
  value:
    | number
    | string
    | null
    | undefined,
  digits = 1
) {
  const parsed =
    Number(value ?? 0);

  return Number.isFinite(parsed)
    ? parsed.toFixed(digits)
    : '0.0';
}


function AutomationHealthPanel({
  health,
  recentTasks,
}: {
  health: AutomationHealthRow | null;
  recentTasks: RecentAutoTaskRow[];
}) {
  const state = automationHealthState(health);
  const lastRunAt =
    health?.last_completed_at ||
    health?.last_started_at ||
    null;

  return (
    <section className="mt-4 grid gap-4 xl:grid-cols-[0.9fr_1.1fr]">
      <div className="card-pad">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="eyebrow">
              Automation
            </div>
            <div className="section-title mt-1">
              Admissions follow-up engine
            </div>
            <p className="mt-1 max-w-xl text-xs leading-5 text-slate-400">
              The rules engine checks for fresh enquiries, hot or re-engaged
              leads and payment-pending prospects, then creates follow-up
              tasks without duplicating the same event.
            </p>
          </div>

          <span
            className={`inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-bold ${state.badgeClass}`}
          >
            <span className={`h-2 w-2 rounded-full ${state.dotClass}`} />
            {state.label}
          </span>
        </div>

        <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <AutomationMiniMetric
            label="Last run"
            value={
              lastRunAt
                ? formatRelativeTime(lastRunAt)
                : 'Not recorded'
            }
            sub={
              lastRunAt
                ? formatDateTime(lastRunAt)
                : 'Waiting for first logged run'
            }
          />
          <AutomationMiniMetric
            label="Runs · 24h"
            value={formatNumber(health?.runs_24h)}
            sub="15-minute checks"
          />
          <AutomationMiniMetric
            label="Tasks created"
            value={formatNumber(health?.tasks_created_24h)}
            sub="Last 24 hours"
          />
          <AutomationMiniMetric
            label="Failures"
            value={formatNumber(health?.failures_24h)}
            sub="Last 24 hours"
            alert={toNumber(health?.failures_24h) > 0}
          />
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <AutomationInfoLine
            label="Last processed"
            value={formatNumber(health?.last_processed_count)}
          />
          <AutomationInfoLine
            label="Last created"
            value={formatNumber(health?.last_created_count)}
          />
          <AutomationInfoLine
            label="Last failed"
            value={formatNumber(health?.last_failed_count)}
            alert={toNumber(health?.last_failed_count) > 0}
          />
        </div>

        {health?.last_error_message && (
          <div className="mt-4 rounded-xl border border-red-100 bg-red-50 px-4 py-3">
            <div className="text-[10px] font-bold uppercase tracking-wide text-red-500">
              Latest automation error
            </div>
            <div className="mt-1 text-xs leading-5 text-red-700">
              {health.last_error_message}
            </div>
          </div>
        )}
      </div>

      <div className="card-pad">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="eyebrow">
              Recent automatic work
            </div>
            <div className="section-title mt-1">
              Follow-ups created by rules
            </div>
            <p className="mt-1 text-xs leading-5 text-slate-400">
              Latest tasks generated automatically for the admissions team.
            </p>
          </div>

          <div className="rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-bold text-slate-500">
            {formatNumber(health?.auto_tasks_logged_24h)} today
          </div>
        </div>

        <div className="mt-4 space-y-2">
          {recentTasks.length === 0 ? (
            <div className="rounded-xl bg-slate-50 px-4 py-8 text-center text-sm text-slate-400">
              No automatically generated follow-ups yet.
            </div>
          ) : (
            recentTasks.map((task) => (
              <Link
                key={task.id}
                href={`/leads/${task.lead_id}`}
                className="group flex items-start justify-between gap-4 rounded-xl border border-slate-100 bg-slate-50/70 px-4 py-3 transition-all duration-150 hover:-translate-y-0.5 hover:shadow-sm"
              >
                <div className="min-w-0">
                  <div className="truncate text-sm font-bold text-slate-800 group-hover:text-brand">
                    {task.lead_name || task.lead_code || 'Lead'}
                  </div>
                  <div className="mt-0.5 text-[10px] font-medium text-slate-400">
                    {task.lead_code || '—'} · {pretty(task.rule_key || 'automatic')}
                  </div>
                  <div className="mt-2 text-xs font-semibold text-slate-600">
                    {task.task_title || 'Admissions follow-up'}
                  </div>
                  <div className="mt-1 text-[10px] text-slate-400">
                    {task.created_at
                      ? `Created ${formatDateTime(task.created_at)}`
                      : 'Created time unavailable'}
                    {task.task_due_at
                      ? ` · Due ${formatDateTime(task.task_due_at)}`
                      : ''}
                  </div>
                </div>

                <ArrowRight
                  size={15}
                  className="mt-1 shrink-0 text-slate-300 transition-transform duration-150 group-hover:translate-x-0.5 group-hover:text-brand"
                />
              </Link>
            ))
          )}
        </div>
      </div>
    </section>
  );
}

function AutomationMiniMetric({
  label,
  value,
  sub,
  alert = false,
}: {
  label: string;
  value: string;
  sub: string;
  alert?: boolean;
}) {
  return (
    <div
      className={`rounded-xl border p-3 ${
        alert
          ? 'border-red-100 bg-red-50/60'
          : 'border-slate-100 bg-slate-50/70'
      }`}
    >
      <div
        className={`text-[10px] font-bold uppercase tracking-wide ${
          alert ? 'text-red-500' : 'text-slate-400'
        }`}
      >
        {label}
      </div>
      <div
        className={`mt-1 text-lg font-black ${
          alert ? 'text-red-700' : 'text-slate-800'
        }`}
      >
        {value}
      </div>
      <div className="mt-0.5 text-[10px] text-slate-400">
        {sub}
      </div>
    </div>
  );
}

function AutomationInfoLine({
  label,
  value,
  alert = false,
}: {
  label: string;
  value: string;
  alert?: boolean;
}) {
  return (
    <div className="rounded-xl border border-slate-100 bg-white px-3 py-2.5">
      <div className="text-[10px] font-bold uppercase tracking-wide text-slate-400">
        {label}
      </div>
      <div
        className={`mt-1 text-sm font-bold ${
          alert ? 'text-red-600' : 'text-slate-700'
        }`}
      >
        {value}
      </div>
    </div>
  );
}

function automationHealthState(
  health: AutomationHealthRow | null
) {
  if (!health?.last_started_at) {
    return {
      label: 'Waiting for first run',
      badgeClass: 'bg-slate-100 text-slate-600',
      dotClass: 'bg-slate-400',
    };
  }

  const runAt =
    health.last_completed_at ||
    health.last_started_at;

  const runTime =
    new Date(runAt).getTime();

  const ageMs =
    Number.isNaN(runTime)
      ? Number.POSITIVE_INFINITY
      : Date.now() - runTime;

  if (health.last_run_status === 'failed') {
    return {
      label: 'Needs attention',
      badgeClass: 'bg-red-100 text-red-700',
      dotClass: 'bg-red-500',
    };
  }

  if (health.last_run_status === 'partial') {
    return {
      label: 'Partial run',
      badgeClass: 'bg-amber-100 text-amber-700',
      dotClass: 'bg-amber-500',
    };
  }

  if (ageMs > 45 * 60 * 1000) {
    return {
      label: 'Run delayed',
      badgeClass: 'bg-amber-100 text-amber-700',
      dotClass: 'bg-amber-500',
    };
  }

  if (health.last_run_status === 'success') {
    return {
      label: 'Healthy',
      badgeClass: 'bg-emerald-100 text-emerald-700',
      dotClass: 'bg-emerald-500',
    };
  }

  return {
    label: pretty(health.last_run_status || 'running'),
    badgeClass: 'bg-blue-100 text-blue-700',
    dotClass: 'bg-blue-500',
  };
}

function ContactActions({
  contact,
  compact = false,
}: {
  contact: LeadContactRow | null;
  compact?: boolean;
}) {
  const whatsapp =
    contact?.whatsapp ||
    contact?.phone ||
    null;

  const whatsappUrl =
    whatsappHref(whatsapp);

  const emailUrl =
    contact?.email
      ? `mailto:${contact.email}`
      : null;

  const phoneUrl =
    contact?.phone
      ? `tel:${contact.phone}`
      : contact?.whatsapp
        ? `tel:${contact.whatsapp}`
        : null;

  const baseClass =
    compact
      ? 'inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[10px] font-bold transition-colors'
      : 'inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-xs font-bold transition-colors';

  if (
    !whatsappUrl &&
    !emailUrl &&
    !phoneUrl
  ) {
    return (
      <span className="text-[10px] font-semibold text-slate-400">
        No direct contact details
      </span>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {whatsappUrl && (
        <a
          href={whatsappUrl}
          target="_blank"
          rel="noreferrer"
          className={`${baseClass} border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100`}
          title="Open WhatsApp"
        >
          <MessageCircle size={13} />
          WhatsApp
        </a>
      )}

      {emailUrl && (
        <a
          href={emailUrl}
          className={`${baseClass} border-sky-200 bg-sky-50 text-sky-700 hover:bg-sky-100`}
          title="Send email"
        >
          <Mail size={13} />
          Email
        </a>
      )}

      {phoneUrl && (
        <a
          href={phoneUrl}
          className={`${baseClass} border-slate-200 bg-white text-slate-600 hover:bg-slate-50`}
          title="Call lead"
        >
          <Phone size={13} />
          Call
        </a>
      )}
    </div>
  );
}


function ContactLogActions({
  leadId,
  contact,
}: {
  leadId: string;
  contact: LeadContactRow | null;
}) {
  const canWhatsApp =
    Boolean(
      contact?.whatsapp ||
      contact?.phone
    );

  const canEmail =
    Boolean(
      contact?.email
    );

  const canCall =
    Boolean(
      contact?.phone ||
      contact?.whatsapp
    );

  if (
    !canWhatsApp &&
    !canEmail &&
    !canCall
  ) {
    return null;
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="text-[9px] font-semibold uppercase tracking-wide text-slate-400">
        After sending
      </span>

      {canWhatsApp && (
        <form action={logAdmissionContactAction}>
          <input
            type="hidden"
            name="lead_id"
            value={leadId}
          />
          <input
            type="hidden"
            name="channel"
            value="whatsapp"
          />
          <button
            type="submit"
            className="inline-flex rounded-lg border border-emerald-200 bg-white px-2 py-1 text-[9px] font-bold text-emerald-700 transition-colors hover:bg-emerald-50"
            title="Log a WhatsApp reply after you have actually sent it"
          >
            Log WA sent
          </button>
        </form>
      )}

      {canEmail && (
        <form action={logAdmissionContactAction}>
          <input
            type="hidden"
            name="lead_id"
            value={leadId}
          />
          <input
            type="hidden"
            name="channel"
            value="email"
          />
          <button
            type="submit"
            className="inline-flex rounded-lg border border-sky-200 bg-white px-2 py-1 text-[9px] font-bold text-sky-700 transition-colors hover:bg-sky-50"
            title="Log an email reply after you have actually sent it"
          >
            Log email sent
          </button>
        </form>
      )}

      {canCall && (
        <form action={logAdmissionContactAction}>
          <input
            type="hidden"
            name="lead_id"
            value={leadId}
          />
          <input
            type="hidden"
            name="channel"
            value="phone"
          />
          <button
            type="submit"
            className="inline-flex rounded-lg border border-slate-200 bg-white px-2 py-1 text-[9px] font-bold text-slate-600 transition-colors hover:bg-slate-50"
            title="Log the call after it was actually completed"
          >
            Log call
          </button>
        </form>
      )}
    </div>
  );
}


function whatsappHref(
  value:
    | string
    | null
    | undefined
) {
  if (!value) {
    return null;
  }

  const trimmed =
    value.trim();

  const digits =
    trimmed.replace(/\D/g, '');

  if (digits.length < 10) {
    return null;
  }

  // WhatsApp wa.me needs a country code.
  // We only use a plain 10-digit number when the
  // stored value explicitly contains a leading + country code.
  if (
    digits.length === 10 &&
    !trimmed.startsWith('+')
  ) {
    return null;
  }

  return `https://wa.me/${digits}`;
}


function PriorityLeadCard({
  row,
  contact,
  inbox,
  sla,
  operational,
  batch,
}: {
  row: PriorityRow;
  contact: LeadContactRow | null;
  inbox: InboxLeadState | null;
  sla: SlaQueueRow | null;
  operational: LeadOperationalRow | null;
  batch: CourseBatchRow | null;
}) {
  const score = toNumber(row.priority_score);
  const band = row.priority_band || 'low';

  const slaBreached =
    sla?.sla_status === 'breached' ||
    sla?.human_sla_status === 'human_breached';

  const needsReply =
    Boolean(inbox?.needs_reply);

  const unread =
    Boolean(inbox?.unread);

  const waitingValue =
    sla?.awaiting_first_response
      ? formatMinutesDuration(
          sla.lead_age_minutes
        )
      : needsReply
        ? waitingDurationSince(
            inbox?.last_inbound_at
          )
        : null;

  const batchLabel =
    batch
      ? [
          batch.batch_code || 'Batch',
          batch.start_date
            ? formatDateOnly(
                batch.start_date
              )
            : null,
          batch.seats_remaining != null
            ? `${formatNumber(
                batch.seats_remaining
              )} seats left`
            : null,
        ]
          .filter(Boolean)
          .join(' · ')
      : operational?.preferred_month
        ? formatMonthValue(
            operational.preferred_month
          )
        : '—';

  const location =
    batch?.location ||
    row.preferred_location ||
    '—';

  const lastContact =
    operational?.last_contacted_at
      ? formatRelativeTime(
          operational.last_contacted_at
        )
      : 'Not contacted';

  const bandClasses: Record<string, string> = {
    critical:
      'border-red-200 bg-red-50/50',
    high:
      'border-orange-200 bg-orange-50/40',
    medium:
      'border-amber-100 bg-amber-50/35',
    low:
      'border-slate-100 bg-white',
  };

  return (
    <article
      className={`rounded-2xl border p-4 shadow-sm transition-all duration-150 hover:-translate-y-0.5 hover:shadow-md ${
        slaBreached
          ? 'ring-1 ring-red-200'
          : ''
      } ${
        bandClasses[band] ||
        bandClasses.low
      }`}
    >
      <div className="grid gap-4 xl:grid-cols-[88px_1.1fr_1.15fr_1.15fr_auto] xl:items-start">
        <div>
          <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
            Priority
          </div>

          <div className="mt-1 text-3xl font-black text-slate-900">
            {score}
          </div>

          <span
            className={`mt-1 inline-flex rounded-full px-2 py-1 text-[10px] font-bold uppercase ${priorityBadgeClass(
              band
            )}`}
          >
            {band}
          </span>
        </div>

        <div className="min-w-0">
          <Link
            href={`/leads/${row.lead_id}`}
            className="truncate text-sm font-bold text-slate-900 hover:text-brand"
          >
            {row.lead_name ||
              row.lead_code ||
              'Lead'}
          </Link>

          <div className="mt-0.5 text-[10px] font-medium text-slate-400">
            {row.lead_code || '—'}
          </div>

          <div className="mt-2 flex flex-wrap gap-1.5">
            <SmallBadge
              label={pretty(
                row.current_stage ||
                  'new'
              )}
            />

            {row.behaviour_temperature && (
              <SmallBadge
                label={pretty(
                  row.behaviour_temperature
                )}
              />
            )}

            {row.is_reengaged && (
              <SmallBadge label="Re-engaged" />
            )}

            {row.is_paid_media_lead && (
              <SmallBadge
                label={
                  row.paid_media_platform ||
                  'Paid media'
                }
              />
            )}

            {needsReply && (
              <SignalBadge
                label="Needs reply"
                tone="red"
              />
            )}

            {unread && (
              <SignalBadge
                label="Unread"
                tone="sky"
              />
            )}

            {slaBreached && (
              <SignalBadge
                label="SLA breached"
                tone="red"
              />
            )}

            {row.followup_overdue && (
              <SignalBadge
                label="Follow-up overdue"
                tone="amber"
              />
            )}
          </div>
        </div>

        <div>
          <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
            Next best action
          </div>

          <div className="mt-1 text-sm font-bold text-slate-800">
            {row.next_best_action ||
              'Review lead'}
          </div>

          <div className="mt-1 text-[11px] leading-5 text-slate-500">
            {row.priority_reason ||
              'No strong priority signal yet.'}
          </div>

          {(needsReply ||
            slaBreached ||
            row.followup_overdue) && (
            <div className="mt-2 rounded-lg border border-red-100 bg-white/70 px-2.5 py-2 text-[10px] font-semibold leading-4 text-red-600">
              {slaBreached
                ? 'SLA is already breached — respond before lower-priority work.'
                : row.followup_overdue
                  ? 'Scheduled follow-up is overdue.'
                  : 'Latest customer message is waiting for a reply.'}
            </div>
          )}
        </div>

        <div className="space-y-1.5 text-xs">
          <InfoLine
            label="Course"
            value={
              row.course_name || '—'
            }
          />

          <InfoLine
            label="Batch"
            value={batchLabel}
          />

          <InfoLine
            label="Location"
            value={location}
          />

          <InfoLine
            label="Payment"
            value={pretty(
              row.payment_status ||
                'unvalued'
            )}
          />

          <InfoLine
            label="Engagement"
            value={`${formatNumber(
              row.engagement_score
            )}/100`}
          />

          <InfoLine
            label="Last contact"
            value={lastContact}
          />

          {waitingValue && (
            <InfoLine
              label="Waiting"
              value={waitingValue}
            />
          )}

          {row.outstanding_balance != null &&
            row.currency && (
              <InfoLine
                label="Outstanding"
                value={formatMoney(
                  row.outstanding_balance,
                  row.currency
                )}
              />
            )}

          {row.next_followup_due_at && (
            <InfoLine
              label="Follow-up"
              value={formatDateTime(
                row.next_followup_due_at
              )}
            />
          )}

          {operational?.expected_close_date && (
            <InfoLine
              label="Expected close"
              value={formatDateOnly(
                operational.expected_close_date
              )}
            />
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2 xl:justify-end">
          {row.next_followup_task_id && (
            <>
              <form
                action={
                  completeAdmissionFollowUpAction
                }
              >
                <input
                  type="hidden"
                  name="task_id"
                  value={
                    row.next_followup_task_id
                  }
                />
                <input
                  type="hidden"
                  name="lead_id"
                  value={row.lead_id}
                />

                <button
                  type="submit"
                  className="inline-flex rounded-lg bg-slate-900 px-3 py-2 text-[11px] font-bold text-white transition-colors hover:bg-slate-700"
                >
                  Complete
                </button>
              </form>

              <form
                action={
                  snoozeAdmissionFollowUpAction
                }
              >
                <input
                  type="hidden"
                  name="task_id"
                  value={
                    row.next_followup_task_id
                  }
                />
                <input
                  type="hidden"
                  name="lead_id"
                  value={row.lead_id}
                />

                <button
                  type="submit"
                  className="inline-flex rounded-lg border border-slate-200 bg-white px-3 py-2 text-[11px] font-bold text-slate-600 transition-colors hover:bg-slate-50"
                >
                  Snooze
                </button>
              </form>
            </>
          )}

          <ContactActions
            contact={contact}
            compact
          />

          <ContactLogActions
            leadId={row.lead_id}
            contact={contact}
          />

          <Link
            href={`/conversations?lead=${row.lead_id}`}
            className="inline-flex rounded-lg border border-slate-200 bg-white px-3 py-2 text-[11px] font-bold text-slate-600 transition-colors hover:bg-slate-50"
          >
            Conversation
          </Link>

          <Link
            href={`/leads/${row.lead_id}`}
            className="inline-flex items-center gap-1 text-xs font-bold text-brand"
          >
            Open
            <ArrowRight size={13} />
          </Link>
        </div>
      </div>
    </article>
  );
}







function PriorityTab({



  href,



  active,



  label,



}: {



  href: string;



  active: boolean;



  label: string;



}) {



  return (



    <Link



      href={href}



      className={`rounded-full border px-3 py-1.5 text-xs font-bold transition-all duration-150 ${



        active



          ? 'border-slate-900 bg-slate-900 text-white'



          : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'



      }`}



    >



      {label}



    </Link>



  );



}







function SmallBadge({



  label,



}: {



  label: string;



}) {



  return (



    <span className="inline-flex rounded-full bg-white/80 px-2 py-1 text-[10px] font-bold text-slate-600 shadow-sm ring-1 ring-slate-100">



      {label}



    </span>



  );



}







function SignalBadge({
  label,
  tone,
}: {
  label: string;
  tone:
    | 'red'
    | 'amber'
    | 'sky';
}) {
  const tones = {
    red:
      'bg-red-100 text-red-700 ring-red-200',
    amber:
      'bg-amber-100 text-amber-700 ring-amber-200',
    sky:
      'bg-sky-100 text-sky-700 ring-sky-200',
  };

  return (
    <span
      className={`inline-flex rounded-full px-2 py-1 text-[10px] font-black shadow-sm ring-1 ${tones[tone]}`}
    >
      {label}
    </span>
  );
}







function InfoLine({



  label,



  value,



}: {



  label: string;



  value: string;



}) {



  return (



    <div className="flex items-start justify-between gap-3">



      <span className="text-slate-400">



        {label}



      </span>



      <span className="max-w-[220px] text-right font-semibold text-slate-700">



        {value}



      </span>



    </div>



  );



}







function priorityBadgeClass(



  band: string



) {



  if (band === 'critical') {



    return 'bg-red-100 text-red-700';



  }







  if (band === 'high') {



    return 'bg-orange-100 text-orange-700';



  }







  if (band === 'medium') {



    return 'bg-amber-100 text-amber-700';



  }







  return 'bg-slate-100 text-slate-600';



}







function FollowUpActionRow({



  row,



  tone = 'default',



}: {



  row: FollowUpRow;



  tone?: 'default' | 'urgent';



}) {



  const toneClasses =



    tone === 'urgent'



      ? 'border-red-100 bg-red-50/60'



      : 'border-slate-100 bg-slate-50/70';







  return (



    <div className={`rounded-xl border px-4 py-3 ${toneClasses}`}>



      <div className="flex items-start justify-between gap-4">



        <Link



          href={`/leads/${row.lead_id}`}



          className="group min-w-0 flex-1"



        >



          <div className="truncate text-sm font-bold text-slate-800 group-hover:text-brand">



            {row.lead_name || row.lead_code || 'Lead'}



          </div>







          <div className="mt-0.5 text-[10px] font-medium text-slate-400">



            {row.lead_code || '—'}



          </div>







          <div className="mt-2 text-xs font-semibold text-slate-600">



            {row.title || 'Follow up'}



          </div>







          <div className="mt-0.5 text-[11px] text-slate-500">



            {pretty(row.current_stage || 'new')} ·{' '}



            {pretty(row.current_contact_channel || 'other')}



          </div>







          <div



            className={`mt-1 text-[10px] ${



              tone === 'urgent'



                ? 'font-bold text-red-500'



                : 'text-slate-400'



            }`}



          >



            {row.due_at



              ? `Due ${formatDateTime(row.due_at)}`



              : 'Due date unavailable'}



          </div>



        </Link>







        <Link



          href={`/leads/${row.lead_id}`}



          className="mt-1 shrink-0 text-slate-300 hover:text-brand"



          aria-label="Open lead"



        >



          <ArrowRight size={15} />



        </Link>



      </div>







      <div className="mt-3 flex flex-wrap gap-2 border-t border-black/5 pt-3">



        <form action={completeAdmissionFollowUpAction}>



          <input type="hidden" name="task_id" value={row.task_id} />



          <input type="hidden" name="lead_id" value={row.lead_id} />







          <button



            type="submit"



            className="inline-flex rounded-lg bg-slate-900 px-3 py-1.5 text-[11px] font-bold text-white transition-colors hover:bg-slate-700"



          >



            Complete



          </button>



        </form>







        <form action={snoozeAdmissionFollowUpAction}>



          <input type="hidden" name="task_id" value={row.task_id} />



          <input type="hidden" name="lead_id" value={row.lead_id} />







          <button



            type="submit"



            className="inline-flex rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-[11px] font-bold text-slate-600 transition-colors hover:bg-slate-50"



          >



            Snooze to tomorrow



          </button>



        </form>







        <Link



          href={`/conversations?lead=${row.lead_id}`}



          className="inline-flex rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-[11px] font-bold text-slate-600 transition-colors hover:bg-slate-50"



        >



          Conversation



        </Link>



      </div>



    </div>



  );



}







function MetricCard({



  icon,



  label,



  value,



  sub,



  emphasis = false,



}: {



  icon: React.ReactNode;



  label: string;



  value: string;



  sub: string;



  emphasis?: boolean;



}) {



  return (



    <div



      className={`rounded-xl border p-4 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md ${



        emphasis



          ? 'border-red-100 bg-red-50/60'



          : 'border-slate-100 bg-white'



      }`}



    >



      <div



        className={`flex items-center gap-2 text-xs font-semibold ${



          emphasis



            ? 'text-red-500'



            : 'text-slate-400'



        }`}



      >



        {icon}



        {label}



      </div>







      <div



        className={`mt-2 text-xl font-bold ${



          emphasis



            ? 'text-red-700'



            : 'text-slate-800'



        }`}



      >



        {value}



      </div>







      <div className="mt-1 text-[11px] text-slate-400">



        {sub}



      </div>



    </div>



  );



}







function QueueCard({



  title,



  description,



  empty,



  action,



  children,



}: {



  title: string;



  description: string;



  empty: string;



  action?: React.ReactNode;



  children: React.ReactNode;



}) {



  const items = Array.isArray(children)



    ? children



    : [children];







  const hasItems = items.some(Boolean);







  return (



    <section className="card-pad">



      <div className="flex items-start justify-between gap-4">



        <div>



          <div className="section-title">



            {title}



          </div>



          <p className="mt-1 text-xs leading-5 text-slate-400">



            {description}



          </p>



        </div>







        {action}



      </div>







      <div className="mt-4 space-y-2">



        {hasItems ? (



          children



        ) : (



          <div className="rounded-xl bg-slate-50 px-4 py-7 text-center text-sm text-slate-400">



            {empty}



          </div>



        )}



      </div>



    </section>



  );



}







function LeadQueueRow({



  leadId,



  leadName,



  leadCode,



  primary,



  secondary,



  meta,



  tone = 'default',



}: {



  leadId: string;



  leadName: string | null;



  leadCode: string | null;



  primary: string;



  secondary: string;



  meta: string;



  tone?:



    | 'default'



    | 'urgent'



    | 'hot'



    | 'paid'



    | 'payment'



    | 'reengaged';



}) {



  const toneClasses: Record<string, string> = {



    default:



      'border-slate-100 bg-slate-50/70',



    urgent:



      'border-red-100 bg-red-50/60',



    hot:



      'border-orange-100 bg-orange-50/55',



    paid:



      'border-violet-100 bg-violet-50/50',



    payment:



      'border-amber-100 bg-amber-50/55',



    reengaged:



      'border-emerald-100 bg-emerald-50/45',



  };







  return (



    <Link



      href={`/leads/${leadId}`}



      className={`group flex items-start justify-between gap-4 rounded-xl border px-4 py-3 transition-all duration-150 hover:-translate-y-0.5 hover:shadow-sm ${



        toneClasses[tone]



      }`}



    >



      <div className="min-w-0">



        <div className="truncate text-sm font-bold text-slate-800">



          {leadName || leadCode || 'Lead'}



        </div>







        <div className="mt-0.5 truncate text-[10px] font-medium text-slate-400">



          {leadCode || '—'}



        </div>







        <div className="mt-2 text-xs font-semibold text-slate-600">



          {primary}



        </div>







        <div className="mt-0.5 text-[11px] text-slate-500">



          {secondary}



        </div>







        <div className="mt-1 text-[10px] text-slate-400">



          {meta}



        </div>



      </div>







      <ArrowRight



        size={15}



        className="mt-1 shrink-0 text-slate-300 transition-transform duration-150 group-hover:translate-x-0.5 group-hover:text-brand"



      />



    </Link>



  );



}







function indiaDayBoundsUtc() {



  const now = new Date();



  const offsetMs =



    5.5 * 60 * 60 * 1000;







  const indiaClock =



    new Date(now.getTime() + offsetMs);







  const year =



    indiaClock.getUTCFullYear();



  const month =



    indiaClock.getUTCMonth();



  const day =



    indiaClock.getUTCDate();







  const start =



    new Date(



      Date.UTC(



        year,



        month,



        day,



        0,



        0,



        0,



        0



      ) - offsetMs



    );







  const end =



    new Date(



      Date.UTC(



        year,



        month,



        day,



        23,



        59,



        59,



        999



      ) - offsetMs



    );







  const todayLabel =



    new Intl.DateTimeFormat(



      'en-IN',



      {



        day: 'numeric',



        month: 'long',



        year: 'numeric',



        timeZone: 'Asia/Kolkata',



      }



    ).format(now);







  return {



    startUtc:



      start.toISOString(),



    endUtc:



      end.toISOString(),



    todayLabel,



  };



}







function leadName(



  row: NewLeadRow



) {



  return (



    row.display_name ||



    [row.first_name, row.last_name]



      .filter(Boolean)



      .join(' ')



      .trim() ||



    row.lead_code ||



    'Lead'



  );



}







function toNumber(



  value:



    | number



    | string



    | null



    | undefined



) {



  const parsed =



    Number(value ?? 0);







  return Number.isFinite(parsed)



    ? parsed



    : 0;



}







function formatNumber(



  value:



    | number



    | string



    | null



    | undefined



) {



  return new Intl.NumberFormat(



    'en-IN',



    {



      maximumFractionDigits: 0,



    }



  ).format(toNumber(value));



}







function formatMoney(



  value:



    | number



    | string



    | null



    | undefined,



  currency: string



) {



  try {



    return new Intl.NumberFormat(



      currency.toUpperCase() ===



        'INR'



        ? 'en-IN'



        : 'en-US',



      {



        style: 'currency',



        currency:



          currency.toUpperCase(),



        maximumFractionDigits: 2,



      }



    ).format(toNumber(value));



  } catch {



    return `${currency} ${toNumber(



      value



    ).toFixed(2)}`;



  }



}







function formatDateTime(



  value:



    | string



    | null



    | undefined



) {



  if (!value) return '—';







  const date =



    new Date(value);







  if (



    Number.isNaN(



      date.getTime()



    )



  ) {



    return value;



  }







  return new Intl.DateTimeFormat(



    'en-IN',



    {



      day: 'numeric',



      month: 'short',



      hour: '2-digit',



      minute: '2-digit',



      timeZone: 'Asia/Kolkata',



    }



  ).format(date);



}








function formatDateOnly(
  value:
    | string
    | null
    | undefined
) {
  if (!value) {
    return '—';
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
    'en-IN',
    {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      timeZone: 'UTC',
    }
  ).format(date);
}


function formatMonthValue(
  value:
    | string
    | null
    | undefined
) {
  if (!value) {
    return '—';
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
    'en-IN',
    {
      month: 'short',
      year: 'numeric',
      timeZone: 'UTC',
    }
  ).format(date);
}


function waitingDurationSince(
  value:
    | string
    | null
    | undefined
) {
  if (!value) {
    return null;
  }

  const time =
    new Date(value).getTime();

  if (
    Number.isNaN(time)
  ) {
    return null;
  }

  const minutes =
    Math.max(
      0,
      Math.floor(
        (
          Date.now() -
          time
        ) /
          60000
      )
    );

  return formatMinutesDuration(
    minutes
  );
}







function formatRelativeTime(
  value: string | null | undefined
) {
  if (!value) return '—';

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return '—';
  }

  const diffMs =
    Date.now() - date.getTime();

  if (diffMs <= 60 * 1000) {
    return 'Just now';
  }

  const minutes =
    Math.floor(diffMs / (60 * 1000));

  if (minutes < 60) {
    return `${minutes} min ago`;
  }

  const hours =
    Math.floor(minutes / 60);

  if (hours < 24) {
    return `${hours} hr${hours === 1 ? '' : 's'} ago`;
  }

  const days =
    Math.floor(hours / 24);

  return `${days} day${days === 1 ? '' : 's'} ago`;
}

function one(



  value: string | string[] | undefined



) {



  if (Array.isArray(value)) {



    return value[0] ?? '';



  }







  return value ?? '';



}







function pretty(value: string) {



  return value



    .replaceAll('_', ' ')



    .replace(/\b\w/g, (letter) =>



      letter.toUpperCase()



    );



}
