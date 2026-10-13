import Link from 'next/link';
import { redirect } from 'next/navigation';
import {
  Activity,
  ArrowRight,
  Clock3,
  ContactRound,
  MessageCircle,
  Phone,
  Sparkles,
  TimerReset,
  UserRound,
  UsersRound,
} from 'lucide-react';

import { PageHeader } from '@/components/ui';
import { createClient } from '@/lib/supabase/server';

type OverviewRow = {
  accessible_leads: number | string | null;
  contacted_leads: number | string | null;
  never_contacted_leads: number | string | null;
  total_contacts: number | string | null;
  outbound_contacts: number | string | null;
  inbound_contacts: number | string | null;
  successful_contacts: number | string | null;
  no_answer_contacts: number | string | null;
  follow_up_needed_contacts: number | string | null;
  enrolled_leads: number | string | null;
  avg_first_response_minutes: number | string | null;
  median_first_response_minutes: number | string | null;
  avg_first_inbound_response_minutes: number | string | null;
  median_first_inbound_response_minutes: number | string | null;
  avg_attempts_before_enrollment: number | string | null;
  median_attempts_before_enrollment: number | string | null;
  avg_contacts_before_enrollment: number | string | null;
  avg_contacts_before_first_payment: number | string | null;
};

type EmployeeRow = {
  employee_user_id: string;
  employee_name: string | null;
  contacted_leads: number | string | null;
  total_contacts: number | string | null;
  outbound_contacts: number | string | null;
  inbound_contacts: number | string | null;
  successful_contacts: number | string | null;
  no_answer_contacts: number | string | null;
  follow_up_needed_contacts: number | string | null;
  phone_contacts: number | string | null;
  whatsapp_contacts: number | string | null;
  email_contacts: number | string | null;
  sms_contacts: number | string | null;
  instagram_contacts: number | string | null;
  total_call_seconds: number | string | null;
  successful_contact_rate_pct: number | string | null;
  contacted_leads_later_enrolled: number | string | null;
  contacted_to_enrolled_observed_pct: number | string | null;
  last_contact_at: string | null;
};

type ChannelRow = {
  method: string;
  contacted_leads: number | string | null;
  total_contacts: number | string | null;
  outbound_contacts: number | string | null;
  inbound_contacts: number | string | null;
  successful_contacts: number | string | null;
  no_answer_contacts: number | string | null;
  follow_up_needed_contacts: number | string | null;
  successful_contact_rate_pct: number | string | null;
  contacted_leads_later_enrolled: number | string | null;
  contacted_to_enrolled_observed_pct: number | string | null;
};

type OutcomeRow = {
  outcome: string;
  leads: number | string | null;
  total_contacts: number | string | null;
  leads_later_enrolled: number | string | null;
  later_enrolled_observed_pct: number | string | null;
};

type TimeRow = {
  iso_day_of_week: number | string | null;
  day_name: string | null;
  hour_of_day: number | string | null;
  contacted_leads: number | string | null;
  total_contacts: number | string | null;
  successful_contacts: number | string | null;
  successful_contact_rate_pct: number | string | null;
  contacted_leads_later_enrolled: number | string | null;
};

type LeadRow = {
  lead_id: string;
  lead_code: string;
  lead_name: string | null;
  owner_name: string | null;
  current_stage: string;
  course_name: string | null;
  country: string | null;
  total_contacts: number | string | null;
  outbound_contacts: number | string | null;
  inbound_contacts: number | string | null;
  successful_contacts: number | string | null;
  first_response_minutes: number | string | null;
  first_inbound_response_minutes: number | string | null;
  last_contact_at: string | null;
  is_enrolled: boolean | null;
};

export default async function ContactIntelligencePage() {
  const supabase = await createClient();

  const mock =
    process.env.NEXT_PUBLIC_USE_MOCK_DATA !== 'false';

  if (!mock) {
    const {
      data: isAdmin,
      error: adminError,
    } = await supabase.rpc(
      'is_crm_admin',
    );

    if (
      adminError ||
      isAdmin !== true
    ) {
      redirect(
        '/dashboard?restricted=1',
      );
    }
  }

  const [
    overviewResult,
    employeeResult,
    channelResult,
    outcomeResult,
    timeResult,
    highTouchResult,
    neverContactedResult,
  ] = await Promise.all([
    supabase
      .from(
        'v_contact_intelligence_overview',
      )
      .select('*')
      .maybeSingle(),

    supabase
      .from(
        'v_contact_intelligence_employee',
      )
      .select('*')
      .order(
        'total_contacts',
        {
          ascending: false,
        },
      ),

    supabase
      .from(
        'v_contact_intelligence_channel',
      )
      .select('*')
      .order(
        'total_contacts',
        {
          ascending: false,
        },
      ),

    supabase
      .from(
        'v_contact_intelligence_outcome',
      )
      .select('*')
      .order(
        'total_contacts',
        {
          ascending: false,
        },
      ),

    supabase
      .from(
        'v_contact_intelligence_time_ist',
      )
      .select('*')
      .order(
        'total_contacts',
        {
          ascending: false,
        },
      )
      .limit(8),

    supabase
      .from(
        'v_contact_intelligence_lead',
      )
      .select(
        'lead_id,lead_code,lead_name,owner_name,current_stage,course_name,country,total_contacts,outbound_contacts,inbound_contacts,successful_contacts,first_response_minutes,first_inbound_response_minutes,last_contact_at,is_enrolled',
      )
      .gt(
        'total_contacts',
        0,
      )
      .order(
        'total_contacts',
        {
          ascending: false,
        },
      )
      .limit(8),

    supabase
      .from(
        'v_contact_intelligence_lead',
      )
      .select(
        'lead_id,lead_code,lead_name,owner_name,current_stage,course_name,country,total_contacts,outbound_contacts,inbound_contacts,successful_contacts,first_response_minutes,first_inbound_response_minutes,last_contact_at,is_enrolled',
      )
      .eq(
        'total_contacts',
        0,
      )
      .order(
        'lead_created_at',
        {
          ascending: false,
        },
      )
      .limit(8),
  ]);

  const errors = [
    ['Overview', overviewResult.error],
    ['Employee intelligence', employeeResult.error],
    ['Channel intelligence', channelResult.error],
    ['Outcome intelligence', outcomeResult.error],
    ['Contact timing', timeResult.error],
    ['High-touch leads', highTouchResult.error],
    ['Never-contacted leads', neverContactedResult.error],
  ]
    .filter(
      (
        [, error],
      ) => Boolean(error),
    )
    .map(
      (
        [label, error],
      ) =>
        `${label}: ${(error as { message?: string })?.message ?? 'Unknown error'}`,
    );

  const overview =
    (overviewResult.data ??
      null) as OverviewRow | null;

  const employees =
    (employeeResult.data ??
      []) as EmployeeRow[];

  const channels =
    (channelResult.data ??
      []) as ChannelRow[];

  const outcomes =
    (outcomeResult.data ??
      []) as OutcomeRow[];

  const timeSlots =
    (timeResult.data ??
      []) as TimeRow[];

  const highTouchLeads =
    (highTouchResult.data ??
      []) as LeadRow[];

  const neverContactedLeads =
    (neverContactedResult.data ??
      []) as LeadRow[];

  const accessibleLeads =
    numberValue(
      overview?.accessible_leads,
    );

  const contactedLeads =
    numberValue(
      overview?.contacted_leads,
    );

  const totalContacts =
    numberValue(
      overview?.total_contacts,
    );

  const successfulContacts =
    numberValue(
      overview?.successful_contacts,
    );

  const coveragePct =
    percentage(
      contactedLeads,
      accessibleLeads,
    );

  const successPct =
    percentage(
      successfulContacts,
      totalContacts,
    );

  const maxChannelContacts =
    Math.max(
      1,
      ...channels.map(
        (row) =>
          numberValue(
            row.total_contacts,
          ),
      ),
    );

  const maxOutcomeContacts =
    Math.max(
      1,
      ...outcomes.map(
        (row) =>
          numberValue(
            row.total_contacts,
          ),
      ),
    );

  return (
    <>
      <PageHeader
        title="Contact Intelligence"
        description="Admissions contact activity, response speed, channel mix and lead-touch patterns from structured CRM logs."
        actions={
          <Link
            href="/team-performance"
            className="btn-secondary"
          >
            <UsersRound size={15} />
            Team Performance
          </Link>
        }
      />

      <div className="mb-5 rounded-2xl border border-sky-100 bg-sky-50/70 px-4 py-3 text-xs leading-5 text-sky-800">
        <strong>
          All-time recorded data.
        </strong>{' '}
        Response metrics are based on the
        structured contact history currently
        available in the CRM, including the
        WhatsApp history we backfilled. Older
        leads may therefore show long
        lead-creation → first-contact times.
        “Later enrolled” is observational
        journey data, not sole-credit employee
        or channel attribution.
      </div>

      {errors.length > 0 && (
        <div className="mb-5 rounded-2xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-700">
          <div className="font-bold">
            Some Contact Intelligence data could
            not be loaded.
          </div>

          <div className="mt-2 space-y-1 text-xs">
            {errors.map(
              (error) => (
                <div key={error}>
                  {error}
                </div>
              ),
            )}
          </div>
        </div>
      )}

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          label="Contact coverage"
          value={`${coveragePct.toFixed(1)}%`}
          sub={`${contactedLeads} of ${accessibleLeads} accessible leads`}
          icon={
            <ContactRound
              size={18}
            />
          }
          tone="brand"
        />

        <KpiCard
          label="Successful outcomes"
          value={`${successPct.toFixed(1)}%`}
          sub={`${successfulContacts} of ${totalContacts} recorded contacts`}
          icon={
            <Sparkles
              size={18}
            />
          }
          tone="green"
        />

        <KpiCard
          label="Median first response"
          value={formatMinutes(
            overview?.median_first_response_minutes,
          )}
          sub="Lead created → first outbound contact"
          icon={
            <TimerReset
              size={18}
            />
          }
          tone="amber"
        />

        <KpiCard
          label="Median reply response"
          value={formatMinutes(
            overview?.median_first_inbound_response_minutes,
          )}
          sub="First inbound → next outbound contact"
          icon={
            <Clock3
              size={18}
            />
          }
          tone="sky"
        />
      </section>

      <section className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <SmallMetric
          label="Never contacted"
          value={numberValue(
            overview?.never_contacted_leads,
          )}
          detail="Accessible leads without a structured contact"
        />

        <SmallMetric
          label="Outbound contacts"
          value={numberValue(
            overview?.outbound_contacts,
          )}
          detail="Recorded attempts from admissions"
        />

        <SmallMetric
          label="Inbound contacts"
          value={numberValue(
            overview?.inbound_contacts,
          )}
          detail="Recorded lead replies / inbound touches"
        />

        <SmallMetric
          label="Known enrolled leads"
          value={numberValue(
            overview?.enrolled_leads,
          )}
          detail="Enrollment known to the current analytics view"
        />
      </section>

      <section className="mt-6 grid gap-5 xl:grid-cols-[1.1fr_.9fr]">
        <div className="card-pad">
          <SectionHeading
            eyebrow="Admissions team"
            title="Employee contact activity"
            detail="Attributed human contacts only. Inbound lead replies are not credited to an employee."
          />

          {employees.length === 0 ? (
            <EmptyState
              text="No employee-attributed contact activity yet."
            />
          ) : (
            <div className="mt-5 overflow-x-auto">
              <table className="min-w-[900px] w-full">
                <thead>
                  <tr className="border-b border-slate-100 text-left text-[10px] font-black uppercase tracking-[.12em] text-slate-400">
                    <th className="px-3 py-3">
                      Employee
                    </th>
                    <th className="px-3 py-3 text-right">
                      Leads
                    </th>
                    <th className="px-3 py-3 text-right">
                      Contacts
                    </th>
                    <th className="px-3 py-3 text-right">
                      Successful
                    </th>
                    <th className="px-3 py-3 text-right">
                      Phone
                    </th>
                    <th className="px-3 py-3 text-right">
                      WhatsApp
                    </th>
                    <th className="px-3 py-3 text-right">
                      Call time
                    </th>
                    <th className="px-3 py-3 text-right">
                      Later enrolled*
                    </th>
                  </tr>
                </thead>

                <tbody>
                  {employees.map(
                    (row) => (
                      <tr
                        key={
                          row.employee_user_id
                        }
                        className="border-b border-slate-50 last:border-0"
                      >
                        <td className="px-3 py-4">
                          <div className="flex items-center gap-3">
                            <div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-slate-100 text-slate-500">
                              <UserRound
                                size={16}
                              />
                            </div>

                            <div>
                              <div className="text-sm font-bold text-slate-800">
                                {row.employee_name ||
                                  'Unknown employee'}
                              </div>

                              <div className="mt-0.5 text-[11px] text-slate-400">
                                Last contact{' '}
                                {formatDateTime(
                                  row.last_contact_at,
                                )}
                              </div>
                            </div>
                          </div>
                        </td>

                        <NumberCell
                          value={row.contacted_leads}
                        />

                        <NumberCell
                          value={row.total_contacts}
                        />

                        <td className="px-3 py-4 text-right">
                          <div className="font-bold text-slate-800">
                            {numberValue(
                              row.successful_contacts,
                            )}
                          </div>

                          <div className="mt-0.5 text-[10px] font-semibold text-emerald-600">
                            {numberValue(
                              row.successful_contact_rate_pct,
                            ).toFixed(
                              1,
                            )}
                            %
                          </div>
                        </td>

                        <NumberCell
                          value={row.phone_contacts}
                        />

                        <NumberCell
                          value={row.whatsapp_contacts}
                        />

                        <td className="px-3 py-4 text-right text-sm font-semibold text-slate-700">
                          {formatSeconds(
                            row.total_call_seconds,
                          )}
                        </td>

                        <td className="px-3 py-4 text-right">
                          <div className="font-bold text-slate-800">
                            {numberValue(
                              row.contacted_leads_later_enrolled,
                            )}
                          </div>

                          <div className="mt-0.5 text-[10px] text-slate-400">
                            observed
                          </div>
                        </td>
                      </tr>
                    ),
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="card-pad">
          <SectionHeading
            eyebrow="Response & effort"
            title="Journey benchmarks"
            detail="Useful operational baselines from the contact history available today."
          />

          <div className="mt-5 space-y-3">
            <BenchmarkRow
              label="Average first response"
              value={formatMinutes(
                overview?.avg_first_response_minutes,
              )}
              detail="Lead creation → first outbound"
            />

            <BenchmarkRow
              label="Average inbound response"
              value={formatMinutes(
                overview?.avg_first_inbound_response_minutes,
              )}
              detail="First inbound → next outbound"
            />

            <BenchmarkRow
              label="Avg. attempts before enrollment"
              value={formatDecimal(
                overview?.avg_attempts_before_enrollment,
              )}
              detail="Outbound touches before known enrollment"
            />

            <BenchmarkRow
              label="Avg. contacts before enrollment"
              value={formatDecimal(
                overview?.avg_contacts_before_enrollment,
              )}
              detail="Inbound + outbound before known enrollment"
            />

            <BenchmarkRow
              label="Avg. contacts before first payment"
              value={formatDecimal(
                overview?.avg_contacts_before_first_payment,
              )}
              detail="Recorded touches before first paid transaction"
            />
          </div>
        </div>
      </section>

      <section className="mt-6 grid gap-5 xl:grid-cols-2">
        <div className="card-pad">
          <SectionHeading
            eyebrow="Channel mix"
            title="Contact methods"
            detail="Volume, response quality and later-enrollment association by method."
          />

          <div className="mt-5 space-y-4">
            {channels.length === 0 ? (
              <EmptyState
                text="No channel data available yet."
              />
            ) : (
              channels.map(
                (row) => {
                  const total =
                    numberValue(
                      row.total_contacts,
                    );

                  const width =
                    Math.max(
                      4,
                      Math.min(
                        100,
                        (
                          total /
                          maxChannelContacts
                        ) *
                          100,
                      ),
                    );

                  return (
                    <div
                      key={
                        row.method
                      }
                      className="rounded-2xl border border-slate-100 bg-slate-50/60 p-4"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div className="flex items-center gap-3">
                          <ChannelIcon
                            method={
                              row.method
                            }
                          />

                          <div>
                            <div className="text-sm font-black text-slate-800">
                              {pretty(
                                row.method,
                              )}
                            </div>

                            <div className="mt-0.5 text-[11px] text-slate-400">
                              {numberValue(
                                row.contacted_leads,
                              )}{' '}
                              leads
                            </div>
                          </div>
                        </div>

                        <div className="text-right">
                          <div className="text-lg font-black text-slate-900">
                            {total}
                          </div>

                          <div className="text-[10px] font-semibold text-emerald-600">
                            {numberValue(
                              row.successful_contact_rate_pct,
                            ).toFixed(
                              1,
                            )}
                            % successful
                          </div>
                        </div>
                      </div>

                      <div className="mt-4 h-2 overflow-hidden rounded-full bg-slate-200">
                        <div
                          className="h-full rounded-full bg-brand"
                          style={{
                            width: `${width}%`,
                          }}
                        />
                      </div>

                      <div className="mt-3 grid grid-cols-3 gap-2 text-center">
                        <MiniStat
                          label="Outbound"
                          value={row.outbound_contacts}
                        />

                        <MiniStat
                          label="Inbound"
                          value={row.inbound_contacts}
                        />

                        <MiniStat
                          label="Later enrolled*"
                          value={row.contacted_leads_later_enrolled}
                        />
                      </div>
                    </div>
                  );
                },
              )
            )}
          </div>
        </div>

        <div className="card-pad">
          <SectionHeading
            eyebrow="Outcome mix"
            title="What happened after contact"
            detail="Structured outcomes entered by the team or inferred from CRM WhatsApp history."
          />

          <div className="mt-5 space-y-3">
            {outcomes.length === 0 ? (
              <EmptyState
                text="No outcome data available yet."
              />
            ) : (
              outcomes.map(
                (row) => {
                  const total =
                    numberValue(
                      row.total_contacts,
                    );

                  const width =
                    Math.max(
                      4,
                      Math.min(
                        100,
                        (
                          total /
                          maxOutcomeContacts
                        ) *
                          100,
                      ),
                    );

                  return (
                    <div
                      key={
                        row.outcome
                      }
                      className="rounded-2xl border border-slate-100 p-4"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <div className="text-sm font-bold text-slate-800">
                            {pretty(
                              row.outcome,
                            )}
                          </div>

                          <div className="mt-1 text-[11px] text-slate-400">
                            {numberValue(
                              row.leads,
                            )}{' '}
                            leads ·{' '}
                            {numberValue(
                              row.leads_later_enrolled,
                            )}{' '}
                            later enrolled*
                          </div>
                        </div>

                        <div className="text-lg font-black text-slate-900">
                          {total}
                        </div>
                      </div>

                      <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-100">
                        <div
                          className="h-full rounded-full bg-slate-700"
                          style={{
                            width: `${width}%`,
                          }}
                        />
                      </div>
                    </div>
                  );
                },
              )
            )}
          </div>
        </div>
      </section>

      <section className="mt-6 grid gap-5 xl:grid-cols-[.85fr_1.15fr]">
        <div className="card-pad">
          <SectionHeading
            eyebrow="India time"
            title="Most active contact windows"
            detail="Highest-volume recorded day/hour combinations. This is not yet a recommendation of the best time to contact."
          />

          <div className="mt-5 space-y-3">
            {timeSlots.length === 0 ? (
              <EmptyState
                text="Not enough contact-time data yet."
              />
            ) : (
              timeSlots.map(
                (
                  row,
                  index,
                ) => (
                  <div
                    key={`${row.iso_day_of_week}-${row.hour_of_day}`}
                    className="flex items-center gap-3 rounded-2xl border border-slate-100 px-4 py-3"
                  >
                    <div className="grid h-8 w-8 shrink-0 place-items-center rounded-xl bg-slate-100 text-xs font-black text-slate-500">
                      {index +
                        1}
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-bold text-slate-800">
                        {row.day_name ||
                          'Unknown'}{' '}
                        ·{' '}
                        {formatHour(
                          row.hour_of_day,
                        )}
                      </div>

                      <div className="mt-1 text-[11px] text-slate-400">
                        {numberValue(
                          row.contacted_leads,
                        )}{' '}
                        leads ·{' '}
                        {numberValue(
                          row.successful_contacts,
                        )}{' '}
                        successful
                      </div>
                    </div>

                    <div className="text-right">
                      <div className="text-base font-black text-slate-900">
                        {numberValue(
                          row.total_contacts,
                        )}
                      </div>

                      <div className="text-[10px] font-semibold text-emerald-600">
                        {numberValue(
                          row.successful_contact_rate_pct,
                        ).toFixed(
                          1,
                        )}
                        %
                      </div>
                    </div>
                  </div>
                ),
              )
            )}
          </div>
        </div>

        <div className="card-pad">
          <SectionHeading
            eyebrow="Lead journeys"
            title="High-touch leads"
            detail="Leads with the most recorded contacts. Useful for spotting long or complex admissions journeys."
          />

          {highTouchLeads.length === 0 ? (
            <EmptyState
              text="No contacted leads available yet."
            />
          ) : (
            <div className="mt-5 overflow-x-auto">
              <table className="min-w-[760px] w-full">
                <thead>
                  <tr className="border-b border-slate-100 text-left text-[10px] font-black uppercase tracking-[.12em] text-slate-400">
                    <th className="px-3 py-3">
                      Lead
                    </th>
                    <th className="px-3 py-3">
                      Stage
                    </th>
                    <th className="px-3 py-3 text-right">
                      Contacts
                    </th>
                    <th className="px-3 py-3 text-right">
                      Out
                    </th>
                    <th className="px-3 py-3 text-right">
                      In
                    </th>
                    <th className="px-3 py-3 text-right">
                      Success
                    </th>
                    <th className="px-3 py-3 text-right">
                      Open
                    </th>
                  </tr>
                </thead>

                <tbody>
                  {highTouchLeads.map(
                    (row) => (
                      <tr
                        key={
                          row.lead_id
                        }
                        className="border-b border-slate-50 last:border-0"
                      >
                        <td className="px-3 py-4">
                          <div className="font-bold text-slate-800">
                            {row.lead_name ||
                              row.lead_code}
                          </div>

                          <div className="mt-0.5 text-[11px] text-slate-400">
                            {row.lead_code}
                            {row.course_name
                              ? ` · ${row.course_name}`
                              : ''}
                          </div>
                        </td>

                        <td className="px-3 py-4">
                          <span className="inline-flex rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-bold text-slate-600">
                            {pretty(
                              row.current_stage,
                            )}
                          </span>
                        </td>

                        <NumberCell
                          value={row.total_contacts}
                        />

                        <NumberCell
                          value={row.outbound_contacts}
                        />

                        <NumberCell
                          value={row.inbound_contacts}
                        />

                        <NumberCell
                          value={row.successful_contacts}
                        />

                        <td className="px-3 py-4 text-right">
                          <Link
                            href={`/leads/${row.lead_id}`}
                            className="inline-flex items-center gap-1 text-xs font-black text-brand hover:underline"
                          >
                            View
                            <ArrowRight
                              size={13}
                            />
                          </Link>
                        </td>
                      </tr>
                    ),
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </section>

      <section className="mt-6 card-pad">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <SectionHeading
            eyebrow="Coverage gap"
            title="Recently created leads with no structured contact"
            detail="This is a data-quality and admissions-workflow queue, not a performance judgment."
          />

          <Link
            href="/leads"
            className="btn-secondary"
          >
            Open leads
            <ArrowRight
              size={14}
            />
          </Link>
        </div>

        {neverContactedLeads.length === 0 ? (
          <EmptyState
            text="Every accessible lead currently has at least one structured contact."
          />
        ) : (
          <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            {neverContactedLeads.map(
              (row) => (
                <Link
                  key={
                    row.lead_id
                  }
                  href={`/leads/${row.lead_id}`}
                  className="rounded-2xl border border-slate-200 bg-white p-4 transition hover:-translate-y-0.5 hover:border-brand/20 hover:shadow-sm"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="truncate text-sm font-black text-slate-800">
                        {row.lead_name ||
                          row.lead_code}
                      </div>

                      <div className="mt-1 text-[11px] font-semibold text-slate-400">
                        {row.lead_code}
                      </div>
                    </div>

                    <div className="grid h-8 w-8 shrink-0 place-items-center rounded-xl bg-orange-50 text-orange-600">
                      <Activity
                        size={15}
                      />
                    </div>
                  </div>

                  <div className="mt-4 text-xs text-slate-500">
                    {pretty(
                      row.current_stage,
                    )}
                    {row.country
                      ? ` · ${row.country}`
                      : ''}
                  </div>

                  <div className="mt-2 text-[11px] text-slate-400">
                    Owner:{' '}
                    {row.owner_name ||
                      'Unassigned'}
                  </div>
                </Link>
              ),
            )}
          </div>
        )}

        <div className="mt-5 border-t border-slate-100 pt-4 text-[11px] leading-5 text-slate-400">
          * “Later enrolled” means a known
          enrollment occurred after a recorded
          employee/channel touch. It does not
          assign exclusive conversion credit.
        </div>
      </section>
    </>
  );
}

function KpiCard({
  label,
  value,
  sub,
  icon,
  tone,
}: {
  label: string;
  value: string;
  sub: string;
  icon: React.ReactNode;
  tone:
    | 'brand'
    | 'green'
    | 'amber'
    | 'sky';
}) {
  const tones = {
    brand:
      'bg-brand/10 text-brand',
    green:
      'bg-emerald-50 text-emerald-700',
    amber:
      'bg-amber-50 text-amber-700',
    sky:
      'bg-sky-50 text-sky-700',
  };

  return (
    <div className="card-pad">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="text-xs font-bold text-slate-400">
            {label}
          </div>

          <div className="mt-2 text-2xl font-black tracking-tight text-slate-950">
            {value}
          </div>

          <div className="mt-2 text-[11px] leading-5 text-slate-400">
            {sub}
          </div>
        </div>

        <div
          className={`grid h-10 w-10 shrink-0 place-items-center rounded-2xl ${tones[tone]}`}
        >
          {icon}
        </div>
      </div>
    </div>
  );
}

function SmallMetric({
  label,
  value,
  detail,
}: {
  label: string;
  value: number;
  detail: string;
}) {
  return (
    <div className="rounded-2xl border border-slate-100 bg-white p-4">
      <div className="text-[10px] font-black uppercase tracking-[.12em] text-slate-400">
        {label}
      </div>

      <div className="mt-2 text-xl font-black text-slate-900">
        {value}
      </div>

      <div className="mt-1 text-[11px] leading-5 text-slate-400">
        {detail}
      </div>
    </div>
  );
}

function SectionHeading({
  eyebrow,
  title,
  detail,
}: {
  eyebrow: string;
  title: string;
  detail: string;
}) {
  return (
    <div>
      <div className="eyebrow">
        {eyebrow}
      </div>

      <div className="section-title mt-1">
        {title}
      </div>

      <p className="mt-2 max-w-2xl text-xs leading-5 text-slate-400">
        {detail}
      </p>
    </div>
  );
}

function BenchmarkRow({
  label,
  value,
  detail,
}: {
  label: string;
  value: string;
  detail: string;
}) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-2xl border border-slate-100 bg-slate-50/60 px-4 py-4">
      <div>
        <div className="text-sm font-bold text-slate-800">
          {label}
        </div>

        <div className="mt-1 text-[11px] leading-5 text-slate-400">
          {detail}
        </div>
      </div>

      <div className="shrink-0 text-right text-base font-black text-slate-900">
        {value}
      </div>
    </div>
  );
}

function MiniStat({
  label,
  value,
}: {
  label: string;
  value:
    | number
    | string
    | null;
}) {
  return (
    <div className="rounded-xl bg-white px-2 py-2">
      <div className="text-[9px] font-black uppercase tracking-[.08em] text-slate-400">
        {label}
      </div>

      <div className="mt-1 text-sm font-black text-slate-800">
        {numberValue(
          value,
        )}
      </div>
    </div>
  );
}

function NumberCell({
  value,
}: {
  value:
    | number
    | string
    | null;
}) {
  return (
    <td className="px-3 py-4 text-right text-sm font-bold text-slate-700">
      {numberValue(
        value,
      )}
    </td>
  );
}

function ChannelIcon({
  method,
}: {
  method: string;
}) {
  const className =
    method === 'whatsapp'
      ? 'bg-emerald-50 text-emerald-700'
      : method === 'phone' ||
          method === 'sms'
        ? 'bg-amber-50 text-amber-700'
        : method === 'email'
          ? 'bg-sky-50 text-sky-700'
          : method === 'instagram'
            ? 'bg-pink-50 text-pink-700'
            : 'bg-slate-100 text-slate-600';

  return (
    <div
      className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl ${className}`}
    >
      {method ===
      'whatsapp' ? (
        <MessageCircle
          size={16}
        />
      ) : method ===
          'phone' ||
        method ===
          'sms' ? (
        <Phone
          size={16}
        />
      ) : (
        <Activity
          size={16}
        />
      )}
    </div>
  );
}

function EmptyState({
  text,
}: {
  text: string;
}) {
  return (
    <div className="mt-5 rounded-2xl border border-dashed border-slate-200 px-4 py-8 text-center text-sm text-slate-400">
      {text}
    </div>
  );
}

function numberValue(
  value:
    | number
    | string
    | null
    | undefined,
) {
  const parsed =
    Number(
      value ?? 0,
    );

  return Number.isFinite(
    parsed,
  )
    ? parsed
    : 0;
}

function percentage(
  numerator: number,
  denominator: number,
) {
  if (
    denominator <= 0
  ) {
    return 0;
  }

  return (
    numerator /
    denominator
  ) * 100;
}

function formatDecimal(
  value:
    | number
    | string
    | null
    | undefined,
) {
  if (
    value == null
  ) {
    return '—';
  }

  return numberValue(
    value,
  ).toFixed(1);
}

function formatMinutes(
  value:
    | number
    | string
    | null
    | undefined,
) {
  if (
    value == null
  ) {
    return '—';
  }

  const minutes =
    numberValue(
      value,
    );

  if (
    minutes < 1
  ) {
    return '< 1 min';
  }

  if (
    minutes < 60
  ) {
    return `${Math.round(
      minutes,
    )} min`;
  }

  if (
    minutes < 1440
  ) {
    const hours =
      minutes / 60;

    return `${hours.toFixed(
      hours >= 10
        ? 0
        : 1,
    )} hr`;
  }

  const days =
    minutes / 1440;

  return `${days.toFixed(
    days >= 10
      ? 0
      : 1,
  )} d`;
}

function formatSeconds(
  value:
    | number
    | string
    | null
    | undefined,
) {
  const seconds =
    numberValue(
      value,
    );

  if (
    seconds <= 0
  ) {
    return '—';
  }

  const hours =
    Math.floor(
      seconds / 3600,
    );

  const minutes =
    Math.floor(
      (
        seconds % 3600
      ) / 60,
    );

  if (
    hours > 0
  ) {
    return `${hours}h ${minutes}m`;
  }

  return `${minutes}m`;
}

function formatDateTime(
  value:
    | string
    | null
    | undefined,
) {
  if (!value) {
    return '—';
  }

  const date =
    new Date(
      value,
    );

  if (
    Number.isNaN(
      date.getTime(),
    )
  ) {
    return value;
  }

  return new Intl.DateTimeFormat(
    'en-IN',
    {
      day:
        'numeric',
      month:
        'short',
      hour:
        'numeric',
      minute:
        '2-digit',
      timeZone:
        'Asia/Kolkata',
    },
  ).format(
    date,
  );
}

function formatHour(
  value:
    | number
    | string
    | null
    | undefined,
) {
  const hour =
    numberValue(
      value,
    );

  const date =
    new Date(
      Date.UTC(
        2026,
        0,
        1,
        hour,
        0,
        0,
      ),
    );

  return new Intl.DateTimeFormat(
    'en-IN',
    {
      hour:
        'numeric',
      hour12:
        true,
      timeZone:
        'UTC',
    },
  ).format(
    date,
  );
}

function pretty(
  value: string,
) {
  return value
    .replaceAll(
      '_',
      ' ',
    )
    .replace(
      /\b\w/g,
      (
        letter,
      ) =>
        letter.toUpperCase(),
    );
}
