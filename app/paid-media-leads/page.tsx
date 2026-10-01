import Link from "next/link";

import {
  ArrowRight,
  BadgeIndianRupee,
  CircleDollarSign,
  Filter,
  Flame,
  Search,
  Target,
  Users,
} from "lucide-react";

import { PageHeader } from "@/components/ui";

import { getPaidMediaLeadsWorkspace } from "@/lib/paid-media-leads-data";

type SearchParams = {
  q?: string | string[];

  platform?: string | string[];

  stage?: string | string[];

  temperature?: string | string[];

  payment?: string | string[];

  match?: string | string[];

  course?: string | string[];

  country?: string | string[];

  campaign?: string | string[];

  from?: string | string[];

  to?: string | string[];

  lead?: string | string[];

  page?: string | string[];
};

const PAGE_SIZE = 50;

export default async function PaidMediaLeadsPage({
  searchParams,
}: {
  searchParams?: Promise<SearchParams>;
}) {
  const resolved = (await searchParams) ?? {};

  const q = one(resolved.q);

  const platform = one(resolved.platform);

  const stage = one(resolved.stage);

  const temperature = one(resolved.temperature);

  const payment = one(resolved.payment);

  const match = one(resolved.match);

  const course = one(resolved.course);

  const country = one(resolved.country);

  const campaign = one(resolved.campaign);

  const from = one(resolved.from);

  const to = one(resolved.to);

  const selectedLeadId = one(resolved.lead);

  const page = Math.max(
    1,

    Number(one(resolved.page) || 1),
  );

  const workspace = await getPaidMediaLeadsWorkspace({
    query: q,

    platform,

    stage,

    temperature,

    payment,

    match,

    course,

    country,

    campaign,

    from,

    to,

    selectedLeadId,

    page,

    pageSize: PAGE_SIZE,
  });

  const overview = workspace.overview;

  const leads = workspace.leads;

  const total = workspace.total;

  const selectedLead = workspace.selectedLead;

  const selectedTouchpoints = workspace.selectedTouchpoints;

  const fromIndex = (page - 1) * PAGE_SIZE;

  const toIndex = fromIndex + PAGE_SIZE - 1;

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const metaTotal =
    toNumber(overview.instagram_leads) +
    toNumber(overview.facebook_leads) +
    toNumber(overview.meta_unspecified_leads);

  const matchCoverage = percentOf(
    overview.campaign_matched_leads,

    overview.paid_media_leads,
  );

  const allocatedCostCoverage = percentOf(
    overview.leads_with_allocated_cost,

    overview.paid_media_leads,
  );

  const activeFilters = [
    q ? { key: "q", label: `Search: ${q}` } : null,

    platform && platform !== "all"
      ? { key: "platform", label: `Platform: ${pretty(platform)}` }
      : null,

    stage && stage !== "all"
      ? { key: "stage", label: `Stage: ${pretty(stage)}` }
      : null,

    temperature && temperature !== "all"
      ? { key: "temperature", label: `Temperature: ${pretty(temperature)}` }
      : null,

    payment && payment !== "all"
      ? { key: "payment", label: `Payment: ${pretty(payment)}` }
      : null,

    match && match !== "all"
      ? { key: "match", label: `Match: ${pretty(match)}` }
      : null,

    course ? { key: "course", label: `Course: ${course}` } : null,

    country ? { key: "country", label: `Country: ${country}` } : null,

    campaign ? { key: "campaign", label: `Campaign: ${campaign}` } : null,

    from ? { key: "from", label: `From: ${from}` } : null,

    to ? { key: "to", label: `To: ${to}` } : null,
  ].filter(Boolean) as Array<{
    key: keyof SearchParams;

    label: string;
  }>;

  return (
    <div className="paid-media-polish">
      <PageHeader
        eyebrow="Paid acquisition"
        title="Paid Media Leads"
        description="Individual Google, Facebook, Instagram and Meta leads connected to campaign attribution, CRM stage, payments, enrollment, revenue and allocated acquisition cost."
        actions={
          <div className="flex flex-wrap gap-2">
            <Link href="/campaigns" className="btn-secondary">
              Campaigns
            </Link>

            <Link href="/funnel" className="btn-primary">
              Funnel analytics
              <ArrowRight size={15} />
            </Link>
          </div>
        }
      />

      {workspace.warning && (
        <div className="paid-media-warning">
          Paid Media Leads loaded through the legacy fallback.{" "}
          {workspace.warning}
        </div>
      )}

      <section className="paid-media-platforms mt-6 overflow-x-auto">
        <div className="paid-media-platform-shell inline-flex min-w-full gap-2">
          <PlatformTab
            href={platformHref(resolved, "all")}
            active={!platform || platform === "all"}
            label="All"
            count={overview.paid_media_leads}
          />

          <PlatformTab
            href={platformHref(resolved, "google")}
            active={platform === "google"}
            label="Google Ads"
            count={overview.google_leads}
          />

          <PlatformTab
            href={platformHref(resolved, "instagram")}
            active={platform === "instagram"}
            label="Instagram"
            count={overview.instagram_leads}
          />

          <PlatformTab
            href={platformHref(resolved, "facebook")}
            active={platform === "facebook"}
            label="Facebook"
            count={overview.facebook_leads}
          />

          <PlatformTab
            href={platformHref(resolved, "meta")}
            active={platform === "meta"}
            label="Meta"
            count={overview.meta_unspecified_leads}
          />
        </div>
      </section>

      <section className="paid-media-quickbar mt-4">
        <div className="paid-media-quickbar-row flex flex-wrap items-center gap-2">
          <span className="mr-1 text-xs font-bold uppercase tracking-wide text-slate-400">
            Quick filters
          </span>

          <QuickFilter
            href={quickHref(resolved, { temperature: "hot" })}
            active={temperature === "hot"}
            label="Hot"
          />

          <QuickFilter
            href={quickHref(resolved, { payment: "unpaid" })}
            active={payment === "unpaid"}
            label="Unpaid"
          />

          <QuickFilter
            href={quickHref(resolved, { stage: "payment_pending" })}
            active={stage === "payment_pending"}
            label="Payment Pending"
          />

          <QuickFilter
            href={quickHref(resolved, { stage: "enrolled" })}
            active={stage === "enrolled"}
            label="Enrolled"
          />

          <QuickFilter
            href={quickHref(resolved, { match: "matched" })}
            active={match === "matched"}
            label="Matched"
          />

          <QuickFilter
            href={quickHref(resolved, { match: "unmatched" })}
            active={match === "unmatched"}
            label="Unmatched"
          />
        </div>

        {activeFilters.length > 0 && (
          <div className="paid-media-active-filters mt-3 flex flex-wrap items-center gap-2">
            <span className="mr-1 text-xs font-semibold text-slate-400">
              Active:
            </span>

            {activeFilters.map((filter) => (
              <ActiveFilterChip
                key={`${filter.key}-${filter.label}`}
                label={filter.label}
                href={removeFilterHref(
                  resolved,

                  filter.key,
                )}
              />
            ))}

            <Link
              href="/paid-media-leads"
              className="text-xs font-bold text-brand hover:underline"
            >
              Clear all
            </Link>
          </div>
        )}
      </section>

      <section className="paid-media-metrics mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <SummaryCard
          icon={<Users size={17} />}
          label="Paid media leads"
          value={formatNumber(overview.paid_media_leads)}
          sub={`${formatNumber(overview.qualified_leads)} qualified`}
        />

        <SummaryCard
          icon={<Target size={17} />}
          label="Google Ads"
          value={formatNumber(overview.google_leads)}
          sub="Attributed leads"
        />

        <SummaryCard
          icon={<Target size={17} />}
          label="Meta Ads"
          value={formatNumber(metaTotal)}
          sub="Facebook + Instagram + Meta"
        />

        <SummaryCard
          icon={<Flame size={17} />}
          label="Hot leads"
          value={formatNumber(overview.hot_leads)}
          sub={`${formatNumber(overview.paid_leads)} with payment`}
        />

        <SummaryCard
          icon={<Target size={17} />}
          label="Campaign matched"
          value={matchCoverage}
          sub={`${formatNumber(
            overview.campaign_matched_leads,
          )} deterministically matched`}
        />

        <SummaryCard
          icon={<Filter size={17} />}
          label="Allocated cost coverage"
          value={allocatedCostCoverage}
          sub={`${formatNumber(
            overview.leads_with_allocated_cost,
          )} leads with campaign CPL`}
        />

        <SummaryCard
          icon={<BadgeIndianRupee size={17} />}
          label="Revenue · INR"
          value={formatMoney(
            overview.revenue_inr,

            "INR",
          )}
          sub={`${formatNumber(overview.enrolled_leads)} enrolled`}
        />

        <SummaryCard
          icon={<CircleDollarSign size={17} />}
          label="Revenue · USD"
          value={formatMoney(
            overview.revenue_usd,

            "USD",
          )}
          sub={`${formatNumber(
            overview.campaign_matched_leads,
          )} campaign-matched`}
        />
      </section>

      <section className="paid-media-filter-panel card-pad mt-4">
        <div className="flex items-center gap-2">
          <Filter size={16} className="text-slate-400" />

          <div className="section-title">Filters</div>
        </div>

        <form
          method="get"
          className="paid-media-filter-grid mt-4 grid gap-3 lg:grid-cols-4 xl:grid-cols-6"
        >
          <div className="lg:col-span-2">
            <label className="mb-1 block text-xs font-semibold text-slate-500">
              Search
            </label>

            <div className="relative">
              <Search
                size={15}
                className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
              />

              <input
                name="q"
                defaultValue={q}
                placeholder="Lead, email, campaign, course..."
                className="input pl-9"
              />
            </div>
          </div>

          <FilterSelect
            name="platform"
            label="Platform"
            value={platform || "all"}
            options={[
              ["all", "All platforms"],

              ["google", "Google Ads"],

              ["instagram", "Instagram Ads"],

              ["facebook", "Facebook Ads"],

              ["meta", "Meta Ads"],
            ]}
          />

          <FilterSelect
            name="stage"
            label="Stage"
            value={stage || "all"}
            options={[
              ["all", "All stages"],

              ["new", "New"],

              ["contacted", "Contacted"],

              ["engaged", "Engaged"],

              ["qualified", "Qualified"],

              ["high_intent", "High intent"],

              ["payment_pending", "Payment pending"],

              ["enrolled", "Enrolled"],

              ["nurture", "Nurture"],

              ["not_now", "Not now"],

              ["lost", "Lost"],
            ]}
          />

          <FilterSelect
            name="temperature"
            label="Temperature"
            value={temperature || "all"}
            options={[
              ["all", "All temperatures"],

              ["hot", "Hot"],

              ["warm", "Warm"],

              ["cold", "Cold"],

              ["closed", "Closed"],
            ]}
          />

          <FilterSelect
            name="payment"
            label="Payment"
            value={payment || "all"}
            options={[
              ["all", "All payment states"],

              ["unvalued", "Unvalued"],

              ["unpaid", "Unpaid"],

              ["partially_paid", "Partially paid"],

              ["paid", "Paid"],
            ]}
          />

          <TextFilter
            name="course"
            label="Course"
            value={course}
            placeholder="200-Hour..."
          />

          <TextFilter
            name="country"
            label="Country"
            value={country}
            placeholder="Germany..."
          />

          <TextFilter
            name="campaign"
            label="Campaign"
            value={campaign}
            placeholder="Campaign name..."
          />

          <FilterSelect
            name="match"
            label="Campaign match"
            value={match || "all"}
            options={[
              ["all", "All"],

              ["matched", "Matched"],

              ["unmatched", "Unmatched"],
            ]}
          />

          <TextFilter name="from" label="From" value={from} type="date" />

          <TextFilter name="to" label="To" value={to} type="date" />

          <div className="flex items-end gap-2 lg:col-span-2">
            <button type="submit" className="btn-primary">
              Apply filters
            </button>

            <Link href="/paid-media-leads" className="btn-secondary">
              Reset
            </Link>
          </div>
        </form>
      </section>

      <section className="paid-media-results card-pad mt-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="eyebrow">Individual acquisition records</div>

            <div className="section-title mt-1">
              {formatNumber(total)} paid-media leads
            </div>
          </div>

          <div className="text-xs text-slate-400">
            Page {page} of {totalPages}
          </div>
        </div>

        <div className="paid-media-table-wrap mt-4 max-h-[720px] overflow-auto">
          <table className="paid-media-table min-w-[1500px] text-left text-xs">
            <thead className="paid-media-table-head sticky top-0 z-10 backdrop-blur">
              <tr className="border-b border-slate-100 uppercase tracking-wide text-slate-400">
                <th className="px-3 py-2.5">Lead</th>

                <th className="px-3 py-2.5">Platform</th>

                <th className="px-3 py-2.5">Course</th>

                <th className="px-3 py-2.5">Campaign</th>

                <th className="px-3 py-2.5">Stage</th>

                <th className="px-3 py-2.5">Temperature</th>

                <th className="px-3 py-2.5">Payment</th>

                <th className="px-3 py-2.5 text-right">Revenue</th>

                <th className="px-3 py-2.5 text-right">Allocated cost</th>

                <th className="px-3 py-2.5">Country</th>

                <th className="px-3 py-2.5">First paid visit</th>

                <th className="px-3 py-2.5">Match</th>

                <th className="px-3 py-2.5"></th>
              </tr>
            </thead>

            <tbody>
              {leads.length === 0 ? (
                <tr>
                  <td
                    colSpan={13}
                    className="px-3 py-10 text-center text-sm text-slate-400"
                  >
                    No paid-media leads match these filters.
                  </td>
                </tr>
              ) : (
                leads.map((lead) => (
                  <tr
                    key={lead.lead_id}
                    className="paid-media-row border-b transition-colors duration-150 last:border-0"
                  >
                    <td className="px-3 py-3">
                      <div className="font-semibold text-slate-800">
                        {lead.lead_name || lead.lead_code || "Lead"}
                      </div>

                      <div className="mt-0.5 text-[10px] text-slate-400">
                        {lead.lead_code || "—"}

                        {lead.email ? ` · ${lead.email}` : ""}
                      </div>
                    </td>

                    <td className="px-3 py-3">
                      <PlatformBadge
                        platform={lead.platform}
                        label={lead.platform_label}
                      />
                    </td>

                    <td className="max-w-[220px] px-3 py-3 text-slate-600">
                      <div className="truncate">{lead.course_name || "—"}</div>

                      {lead.preferred_location && (
                        <div className="mt-0.5 text-[10px] text-slate-400">
                          {lead.preferred_location}
                        </div>
                      )}
                    </td>

                    <td className="max-w-[300px] px-3 py-3">
                      <div className="truncate font-medium text-slate-700">
                        {lead.campaign_name || "—"}
                      </div>

                      <div className="mt-0.5 truncate text-[10px] text-slate-400">
                        {lead.campaign_id || "No campaign ID"}
                      </div>
                    </td>

                    <td className="px-3 py-3">
                      <span className="capitalize text-slate-600">
                        {pretty(lead.current_stage || "—")}
                      </span>
                    </td>

                    <td className="px-3 py-3">
                      <TemperatureBadge value={lead.behaviour_temperature} />
                    </td>

                    <td className="px-3 py-3">
                      <PaymentBadge value={lead.payment_status} />
                    </td>

                    <td className="px-3 py-3 text-right">
                      <RevenueCell
                        inr={lead.revenue_inr}
                        usd={lead.revenue_usd}
                      />
                    </td>

                    <td className="px-3 py-3 text-right">
                      {lead.allocated_acquisition_cost == null ? (
                        <span className="text-slate-400">—</span>
                      ) : (
                        <div>
                          <div className="font-semibold text-slate-700">
                            {formatMoney(
                              lead.allocated_acquisition_cost,

                              lead.acquisition_currency || "INR",
                            )}
                          </div>

                          <div className="mt-0.5 text-[10px] text-slate-400">
                            Campaign CPL allocation
                          </div>
                        </div>
                      )}
                    </td>

                    <td className="px-3 py-3 text-slate-600">
                      {lead.country || "—"}
                    </td>

                    <td className="px-3 py-3 text-slate-500">
                      {formatDateTime(lead.first_paid_touch_at)}
                    </td>

                    <td className="px-3 py-3">
                      {lead.campaign_matched ? (
                        <span className="inline-flex rounded-full bg-emerald-50 px-2 py-1 text-[10px] font-bold text-emerald-700">
                          Matched
                        </span>
                      ) : (
                        <span className="inline-flex rounded-full bg-slate-100 px-2 py-1 text-[10px] font-bold text-slate-500">
                          Unmatched
                        </span>
                      )}
                    </td>

                    <td className="px-3 py-3 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <Link
                          href={quickViewHref(
                            resolved,

                            lead.lead_id,
                          )}
                          className="paid-media-quick-view inline-flex rounded-lg px-2.5 py-1.5 text-[11px] font-semibold transition-colors"
                        >
                          Quick view
                        </Link>

                        <Link
                          href={`/leads/${lead.lead_id}`}
                          className="paid-media-open-link inline-flex items-center gap-1 font-semibold text-brand"
                        >
                          Open
                          <ArrowRight size={13} />
                        </Link>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <div className="paid-media-pagination mt-4 flex items-center justify-between gap-3 border-t pt-4">
          <div className="text-xs text-slate-400">
            Showing {total === 0 ? 0 : fromIndex + 1}
            {"–"}
            {Math.min(toIndex + 1, total)}
            {" of "}
            {formatNumber(total)}
          </div>

          <div className="flex items-center gap-2">
            {page > 1 && (
              <Link
                href={pageHref(resolved, page - 1)}
                className="btn-secondary"
              >
                Previous
              </Link>
            )}

            {page < totalPages && (
              <Link
                href={pageHref(resolved, page + 1)}
                className="btn-secondary"
              >
                Next
              </Link>
            )}
          </div>
        </div>
      </section>

      {selectedLead && (
        <>
          <Link
            href={closeQuickViewHref(resolved)}
            aria-label="Close quick view"
            className="paid-media-drawer-backdrop fixed inset-0 z-40"
          />

          <aside className="paid-media-drawer fixed inset-y-0 right-0 z-50 w-full max-w-[520px] overflow-y-auto">
            <div className="paid-media-drawer-header sticky top-0 z-10 px-5 py-4 backdrop-blur">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="eyebrow">Paid media lead</div>

                  <div className="mt-1 text-xl font-bold text-slate-900">
                    {selectedLead.lead_name || selectedLead.lead_code || "Lead"}
                  </div>

                  <div className="mt-1 text-xs text-slate-400">
                    {selectedLead.lead_code || "—"}

                    {selectedLead.email ? ` · ${selectedLead.email}` : ""}
                  </div>
                </div>

                <Link
                  href={closeQuickViewHref(resolved)}
                  className="paid-media-drawer-close inline-flex h-9 w-9 items-center justify-center rounded-lg text-lg font-medium transition-colors"
                  aria-label="Close"
                >
                  ×
                </Link>
              </div>

              <div className="mt-4 flex flex-wrap gap-2">
                <PlatformBadge
                  platform={selectedLead.platform}
                  label={selectedLead.platform_label}
                />

                <TemperatureBadge value={selectedLead.behaviour_temperature} />

                <PaymentBadge value={selectedLead.payment_status} />

                <span className="inline-flex rounded-full bg-slate-100 px-2 py-1 text-[10px] font-bold text-slate-600">
                  {pretty(selectedLead.current_stage || "—")}
                </span>
              </div>
            </div>

            <div className="paid-media-drawer-body space-y-4 p-5">
              <DrawerSection title="Acquisition">
                <DrawerRow
                  label="Campaign"
                  value={selectedLead.campaign_name || "—"}
                />

                <DrawerRow
                  label="Campaign ID"
                  value={selectedLead.campaign_id || "—"}
                  mono
                />

                <DrawerRow
                  label={
                    selectedLead.group_type === "ad_group"
                      ? "Ad group ID"
                      : "Ad set ID"
                  }
                  value={selectedLead.ad_group_or_adset_id || "—"}
                  mono
                />

                <DrawerRow
                  label="Ad ID"
                  value={selectedLead.ad_id || "—"}
                  mono
                />

                <DrawerRow
                  label="Campaign match"
                  value={
                    selectedLead.campaign_matched ? "Matched" : "Unmatched"
                  }
                />

                <DrawerRow
                  label="First paid visit"
                  value={formatDateTime(selectedLead.first_paid_touch_at)}
                />

                <DrawerRow
                  label="Landing page"
                  value={selectedLead.landing_page || "—"}
                />
              </DrawerSection>

              <DrawerSection title="Admissions">
                <DrawerRow
                  label="Course"
                  value={selectedLead.course_name || "—"}
                />

                <DrawerRow
                  label="Preferred location"
                  value={selectedLead.preferred_location || "—"}
                />

                <DrawerRow
                  label="Preferred month"
                  value={selectedLead.preferred_month || "—"}
                />

                <DrawerRow
                  label="Country"
                  value={selectedLead.country || "—"}
                />

                <DrawerRow
                  label="Engagement score"
                  value={String(toNumber(selectedLead.engagement_score))}
                />
              </DrawerSection>

              <DrawerSection title="Revenue & acquisition cost">
                <DrawerRow
                  label="Revenue · INR"
                  value={formatMoney(
                    selectedLead.revenue_inr,

                    "INR",
                  )}
                />

                <DrawerRow
                  label="Revenue · USD"
                  value={formatMoney(
                    selectedLead.revenue_usd,

                    "USD",
                  )}
                />

                <DrawerRow
                  label="Allocated acquisition cost"
                  value={
                    selectedLead.allocated_acquisition_cost == null
                      ? "—"
                      : formatMoney(
                          selectedLead.allocated_acquisition_cost,

                          selectedLead.acquisition_currency || "INR",
                        )
                  }
                />

                <DrawerRow
                  label="Cost method"
                  value={pretty(
                    selectedLead.acquisition_cost_method || "unavailable",
                  )}
                />

                <DrawerRow
                  label="Campaign ROAS · 30d"
                  value={
                    selectedLead.campaign_roas_30d == null
                      ? "—"
                      : `${toNumber(selectedLead.campaign_roas_30d).toFixed(
                          2,
                        )}×`
                  }
                />
              </DrawerSection>

              <DrawerSection title="Recent journey">
                {selectedTouchpoints.length === 0 ? (
                  <div className="rounded-lg bg-slate-50 px-3 py-4 text-xs text-slate-400">
                    No recent touchpoints available.
                  </div>
                ) : (
                  <div className="space-y-2">
                    {selectedTouchpoints.map((point) => (
                      <div
                        key={point.id}
                        className="rounded-xl border border-slate-100 bg-slate-50 px-3 py-3"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <div className="text-xs font-bold text-slate-700">
                              {pretty(point.event_type || "activity")}
                            </div>

                            <div className="mt-1 text-[11px] text-slate-500">
                              {[point.source, point.medium, point.campaign_name]

                                .filter(Boolean)

                                .join(" · ") || "—"}
                            </div>

                            {point.landing_page && (
                              <div className="mt-1 max-w-[340px] truncate text-[10px] text-slate-400">
                                {point.landing_page}
                              </div>
                            )}
                          </div>

                          <div className="shrink-0 text-[10px] text-slate-400">
                            {formatDateTime(point.occurred_at)}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </DrawerSection>

              <Link
                href={`/leads/${selectedLead.lead_id}`}
                className="btn-primary w-full justify-center"
              >
                Open full lead
                <ArrowRight size={15} />
              </Link>
            </div>
          </aside>
        </>
      )}
    </div>
  );
}

function DrawerSection({
  title,

  children,
}: {
  title: string;

  children: React.ReactNode;
}) {
  return (
    <section className="paid-media-drawer-section">
      <div className="text-sm font-bold text-slate-800">{title}</div>

      <div className="mt-3 space-y-2">{children}</div>
    </section>
  );
}

function DrawerRow({
  label,

  value,

  mono = false,
}: {
  label: string;

  value: string;

  mono?: boolean;
}) {
  return (
    <div className="paid-media-drawer-row flex items-start justify-between gap-4 py-2">
      <span className="text-xs text-slate-400">{label}</span>

      <span
        className={`max-w-[280px] text-right text-xs font-semibold text-slate-700 ${
          mono ? "font-mono text-[11px]" : ""
        }`}
      >
        {value}
      </span>
    </div>
  );
}

function QuickFilter({
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
      className={`paid-media-quick-filter inline-flex rounded-full border px-3 py-1.5 text-xs font-semibold transition ${
        active ? "is-active" : ""
      }`}
    >
      {label}
    </Link>
  );
}

function ActiveFilterChip({
  label,

  href,
}: {
  label: string;

  href: string;
}) {
  return (
    <Link
      href={href}
      title={`Remove ${label}`}
      className="paid-media-filter-chip inline-flex items-center gap-1 rounded-full px-3 py-1.5 text-xs font-semibold transition-colors"
    >
      <span>{label}</span>

      <span aria-hidden="true" className="text-slate-400">
        ×
      </span>
    </Link>
  );
}

function PlatformTab({
  href,

  active,

  label,

  count,
}: {
  href: string;

  active: boolean;

  label: string;

  count: number | string | null;
}) {
  return (
    <Link
      href={href}
      className={`paid-media-platform-tab inline-flex min-w-[132px] items-center justify-between gap-3 rounded-xl px-4 py-3 text-xs font-semibold transition ${
        active ? "is-active" : ""
      }`}
    >
      <span>{label}</span>

      <span
        className={`paid-media-platform-count rounded-full px-2 py-0.5 text-[10px] ${
          active ? "is-active" : ""
        }`}
      >
        {formatNumber(count)}
      </span>
    </Link>
  );
}

function SummaryCard({
  icon,

  label,

  value,

  sub,
}: {
  icon: React.ReactNode;

  label: string;

  value: string;

  sub: string;
}) {
  return (
    <div className="paid-media-metric">
      <div className="paid-media-metric-label flex items-center gap-2 text-xs font-semibold">
        {icon}

        {label}
      </div>

      <div className="paid-media-metric-value mt-2 text-xl">{value}</div>

      <div className="paid-media-metric-note mt-1 text-[11px]">{sub}</div>
    </div>
  );
}

function FilterSelect({
  name,

  label,

  value,

  options,
}: {
  name: string;

  label: string;

  value: string;

  options: Array<[string, string]>;
}) {
  return (
    <div className="paid-media-filter-field">
      <label className="mb-1 block text-xs font-semibold">{label}</label>

      <select name={name} defaultValue={value} className="input">
        {options.map(([optionValue, optionLabel]) => (
          <option key={optionValue} value={optionValue}>
            {optionLabel}
          </option>
        ))}
      </select>
    </div>
  );
}

function TextFilter({
  name,

  label,

  value,

  placeholder,

  type = "text",
}: {
  name: string;

  label: string;

  value: string;

  placeholder?: string;

  type?: string;
}) {
  return (
    <div className="paid-media-filter-field">
      <label className="mb-1 block text-xs font-semibold">{label}</label>

      <input
        type={type}
        name={name}
        defaultValue={value}
        placeholder={placeholder}
        className="input"
      />
    </div>
  );
}

function PlatformBadge({
  platform,

  label,
}: {
  platform: string | null;

  label: string | null;
}) {
  const key = platform || "paid";

  const classes: Record<string, string> = {
    google: "bg-blue-50 text-blue-700",

    instagram: "bg-fuchsia-50 text-fuchsia-700",

    facebook: "bg-indigo-50 text-indigo-700",

    meta: "bg-violet-50 text-violet-700",
  };

  return (
    <span
      className={`paid-media-platform-badge inline-flex rounded-full px-2 py-1 text-[10px] font-semibold ${
        classes[key] || "bg-slate-100 text-slate-600"
      }`}
    >
      {label || "Paid Media"}
    </span>
  );
}

function TemperatureBadge({ value }: { value: string | null }) {
  const key = value || "unknown";

  const classes: Record<string, string> = {
    hot: "bg-red-50 text-red-700",

    warm: "bg-orange-50 text-orange-700",

    cold: "bg-sky-50 text-sky-700",

    closed: "bg-slate-100 text-slate-600",
  };

  return (
    <span
      className={`paid-media-temperature-badge inline-flex rounded-full px-2 py-1 text-[10px] font-semibold capitalize ${
        classes[key] || "bg-slate-100 text-slate-500"
      }`}
    >
      {pretty(key)}
    </span>
  );
}

function PaymentBadge({ value }: { value: string | null }) {
  const key = value || "unvalued";

  const classes: Record<string, string> = {
    paid: "bg-emerald-50 text-emerald-700",

    partially_paid: "bg-amber-50 text-amber-700",

    unpaid: "bg-red-50 text-red-700",

    unvalued: "bg-slate-100 text-slate-500",
  };

  return (
    <span
      className={`paid-media-payment-badge inline-flex rounded-full px-2 py-1 text-[10px] font-semibold ${
        classes[key] || "bg-slate-100 text-slate-500"
      }`}
    >
      {pretty(key)}
    </span>
  );
}

function RevenueCell({
  inr,

  usd,
}: {
  inr: number | string | null;

  usd: number | string | null;
}) {
  const inrValue = toNumber(inr);

  const usdValue = toNumber(usd);

  if (inrValue <= 0 && usdValue <= 0) {
    return <span className="text-slate-400">—</span>;
  }

  return (
    <div className="space-y-0.5">
      {inrValue > 0 && (
        <div className="font-semibold text-slate-700">
          {formatMoney(inrValue, "INR")}
        </div>
      )}

      {usdValue > 0 && (
        <div className="font-semibold text-slate-700">
          {formatMoney(usdValue, "USD")}
        </div>
      )}
    </div>
  );
}

function one(value: string | string[] | undefined) {
  if (Array.isArray(value)) {
    return value[0] ?? "";
  }

  return value ?? "";
}

function toNumber(value: number | string | null | undefined) {
  const parsed = Number(value ?? 0);

  return Number.isFinite(parsed) ? parsed : 0;
}

function formatNumber(value: number | string | null | undefined) {
  return new Intl.NumberFormat("en-IN", {
    maximumFractionDigits: 0,
  }).format(toNumber(value));
}

function formatMoney(
  value: number | string | null | undefined,

  currency: string,
) {
  try {
    return new Intl.NumberFormat(
      currency === "INR" ? "en-IN" : "en-US",

      {
        style: "currency",

        currency,

        maximumFractionDigits: 2,
      },
    ).format(toNumber(value));
  } catch {
    return `${currency} ${toNumber(value).toFixed(2)}`;
  }
}

function formatDateTime(value: string | null | undefined) {
  if (!value) return "—";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("en-IN", {
    day: "numeric",

    month: "short",

    year: "numeric",

    hour: "2-digit",

    minute: "2-digit",
  }).format(date);
}

function pretty(value: string) {
  if (!value || value === "—") {
    return value || "—";
  }

  return value

    .replaceAll("_", " ")

    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function quickViewHref(
  params: SearchParams,

  leadId: string,
) {
  const next = new URLSearchParams();

  for (const [key, raw] of Object.entries(params)) {
    if (key === "lead") continue;

    const value = one(raw);

    if (value) {
      next.set(key, value);
    }
  }

  next.set("lead", leadId);

  return `/paid-media-leads?${next.toString()}`;
}

function closeQuickViewHref(params: SearchParams) {
  const next = new URLSearchParams();

  for (const [key, raw] of Object.entries(params)) {
    if (key === "lead") continue;

    const value = one(raw);

    if (value) {
      next.set(key, value);
    }
  }

  const query = next.toString();

  return query ? `/paid-media-leads?${query}` : "/paid-media-leads";
}

function quickHref(
  params: SearchParams,

  patch: Partial<Record<keyof SearchParams, string>>,
) {
  const next = new URLSearchParams();

  for (const [key, raw] of Object.entries(params)) {
    if (key === "page" || key === "lead") {
      continue;
    }

    const value = one(raw);

    if (value) {
      next.set(key, value);
    }
  }

  for (const [key, value] of Object.entries(patch)) {
    if (value) {
      next.set(key, value);
    } else {
      next.delete(key);
    }
  }

  next.delete("page");

  const query = next.toString();

  return query ? `/paid-media-leads?${query}` : "/paid-media-leads";
}

function removeFilterHref(
  params: SearchParams,

  keyToRemove: keyof SearchParams,
) {
  const next = new URLSearchParams();

  for (const [key, raw] of Object.entries(params)) {
    if (key === keyToRemove || key === "page" || key === "lead") {
      continue;
    }

    const value = one(raw);

    if (value) {
      next.set(key, value);
    }
  }

  const query = next.toString();

  return query ? `/paid-media-leads?${query}` : "/paid-media-leads";
}

function percentOf(
  numerator: number | string | null | undefined,

  denominator: number | string | null | undefined,
) {
  const n = toNumber(numerator);

  const d = toNumber(denominator);

  if (d <= 0) return "0%";

  return `${((n / d) * 100).toFixed(1)}%`;
}

function platformHref(
  params: SearchParams,

  platform: string,
) {
  const next = new URLSearchParams();

  for (const [key, raw] of Object.entries(params)) {
    if (key === "platform" || key === "page" || key === "lead") {
      continue;
    }

    const value = one(raw);

    if (value) {
      next.set(key, value);
    }
  }

  if (platform !== "all") {
    next.set("platform", platform);
  }

  const query = next.toString();

  return query ? `/paid-media-leads?${query}` : "/paid-media-leads";
}

function pageHref(
  params: SearchParams,

  page: number,
) {
  const next = new URLSearchParams();

  for (const [key, raw] of Object.entries(params)) {
    if (key === "page" || key === "lead") {
      continue;
    }

    const value = one(raw);

    if (value) {
      next.set(key, value);
    }
  }

  next.set(
    "page",

    String(page),
  );

  return `/paid-media-leads?${next.toString()}`;
}
