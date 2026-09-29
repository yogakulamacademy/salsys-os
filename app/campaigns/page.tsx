import Link from 'next/link';
import {
  ArrowRight,
  BarChart3,
} from 'lucide-react';

import {
  CampaignsWorkspace,
  type CampaignWorkspaceRow,
} from '@/components/campaigns-workspace';
import {
  PageHeader,
} from '@/components/ui';
import {
  getCampaigns,
  isMockMode,
} from '@/lib/data';
import {
  createClient,
} from '@/lib/supabase/server';


export default async function CampaignsPage() {
  const mock =
    isMockMode();

  let campaigns:
    CampaignWorkspaceRow[] =
    [];

  let googleError:
    string |
    null =
    null;

  let metaError:
    string |
    null =
    null;

  if (mock) {
    const mockCampaigns =
      await getCampaigns();

    campaigns =
      mockCampaigns.map(
        (
          campaign
        ) => ({
          id:
            campaign.id,

          externalId:
            campaign.id,

          name:
            campaign.name,

          platform:
            campaign.platform,

          spend:
            safeNumber(
              campaign.spend
            ),

          spendCurrency:
            'INR',

          impressions:
            0,

          clicks:
            0,

          leads:
            safeNumber(
              campaign.leads
            ),

          qualified:
            safeNumber(
              campaign.qualified
            ),

          highIntent:
            0,

          paymentPending:
            0,

          paid:
            0,

          enrolled:
            safeNumber(
              campaign.enrolled
            ),

          revenueInr:
            safeNumber(
              campaign.revenue
            ),

          revenueUsd:
            0,

          cpl:
            safeDivide(
              campaign.spend,
              campaign.leads
            ),

          cpql:
            safeDivide(
              campaign.spend,
              campaign.qualified
            ),

          cac:
            safeDivide(
              campaign.spend,
              campaign.enrolled
            ),

          roas:
            safeDivide(
              campaign.revenue,
              campaign.spend
            ),

          source:
            'mock',
        })
      );
  } else {
    const supabase =
      await createClient();

    const [
      googleResult,
      metaResult,
    ] = await Promise.all([
      supabase
        .from(
          'v_google_ads_campaign_crm_30d'
        )
        .select(
          '*'
        )
        .limit(
          1000
        ),

      supabase
        .from(
          'v_meta_ads_campaign_crm_30d'
        )
        .select(
          '*'
        )
        .limit(
          1000
        ),
    ]);

    if (
      googleResult.error
    ) {
      googleError =
        googleResult.error.message;
    } else {
      campaigns.push(
        ...(
          googleResult.data ??
          []
        ).map(
          (
            row:
              Record<
                string,
                unknown
              >
          ) =>
            normalizeLiveCampaign(
              row,
              'Google Ads'
            )
        )
      );
    }

    if (
      metaResult.error
    ) {
      metaError =
        metaResult.error.message;
    } else {
      campaigns.push(
        ...(
          metaResult.data ??
          []
        ).map(
          (
            row:
              Record<
                string,
                unknown
              >
          ) =>
            normalizeLiveCampaign(
              row,
              'Meta Ads'
            )
        )
      );
    }
  }

  return (
    <>
      <PageHeader
        eyebrow="Paid acquisition"
        title="Campaigns"
        description="Live campaign performance connected to CRM outcomes. Compare ad spend with attributed leads, qualification, enrollments and actual CRM revenue."
        actions={
          <>
            <Link
              href="/paid-media-leads"
              className="btn-secondary"
            >
              Paid Media Leads
            </Link>

            <Link
              href="/funnel"
              className="btn-primary"
            >
              Funnel analytics
              <ArrowRight
                size={15}
              />
            </Link>
          </>
        }
      />

      {(googleError ||
        metaError) && (
        <div className="mb-4 rounded-xl border border-amber-100 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <div className="flex items-center gap-2 font-bold">
            <BarChart3
              size={15}
            />
            Some campaign data could not be loaded
          </div>

          {googleError && (
            <div className="mt-1 text-xs">
              Google Ads: {googleError}
            </div>
          )}

          {metaError && (
            <div className="mt-1 text-xs">
              Meta Ads: {metaError}
            </div>
          )}
        </div>
      )}

      <CampaignsWorkspace
        campaigns={
          campaigns
        }
        mock={
          mock
        }
      />
    </>
  );
}


function normalizeLiveCampaign(
  row:
    Record<
      string,
      unknown
    >,
  platform: string
): CampaignWorkspaceRow {
  const externalId =
    pickText(
      row,
      [
        'campaign_id',
        'external_campaign_id',
        'id',
      ]
    ) ||
    `${platform}-${pickText(
      row,
      [
        'campaign_name',
        'name',
      ]
    ) || 'campaign'}`;

  const name =
    pickText(
      row,
      [
        'campaign_name',
        'name',
      ]
    ) ||
    externalId;

  const spend =
    pickNumber(
      row,
      [
        'spend',
        'cost',
        'ad_spend',
        'spend_amount',
      ]
    );

  const spendCurrency =
    (
      pickText(
        row,
        [
          'account_currency',
          'currency',
          'spend_currency',
        ]
      ) ||
      'INR'
    ).toUpperCase();

  const leads =
    pickNumber(
      row,
      [
        'crm_leads',
        'leads',
        'lead_count',
        'attributed_leads',
      ]
    );

  const qualified =
    pickNumber(
      row,
      [
        'qualified_leads',
        'qualified',
        'qualified_count',
      ]
    );

  const enrolled =
    pickNumber(
      row,
      [
        'enrolled_leads',
        'enrolled',
        'enrollment_count',
      ]
    );

  const revenueInr =
    pickNumber(
      row,
      [
        'revenue_inr',
        'inr_revenue',
        'crm_revenue_inr',
      ]
    );

  const revenueUsd =
    pickNumber(
      row,
      [
        'revenue_usd',
        'usd_revenue',
        'crm_revenue_usd',
      ]
    );

  const cplFromView =
    pickNullableNumber(
      row,
      [
        'cpl',
        'cost_per_lead',
      ]
    );

  const cpqlFromView =
    pickNullableNumber(
      row,
      [
        'cost_per_qualified_lead',
        'cost_per_qualified',
        'cpql',
      ]
    );

  const cacFromView =
    pickNullableNumber(
      row,
      [
        'cac',
        'cost_per_enrollment',
        'cost_per_enrolled_lead',
      ]
    );

  const roasFromView =
    pickNullableNumber(
      row,
      [
        'roas',
        'crm_roas',
      ]
    );

  return {
    id:
      `${platform}:${externalId}`,

    externalId,

    name,

    platform,

    spend,

    spendCurrency,

    impressions:
      pickNumber(
        row,
        [
          'impressions',
        ]
      ),

    clicks:
      pickNumber(
        row,
        [
          'clicks',
          'link_clicks',
        ]
      ),

    leads,

    qualified,

    highIntent:
      pickNumber(
        row,
        [
          'high_intent_leads',
          'high_intent',
        ]
      ),

    paymentPending:
      pickNumber(
        row,
        [
          'payment_pending_leads',
          'payment_pending',
        ]
      ),

    paid:
      pickNumber(
        row,
        [
          'paid_leads',
          'paid',
          'paid_count',
        ]
      ),

    enrolled,

    revenueInr,

    revenueUsd,

    cpl:
      cplFromView ??
      safeDivide(
        spend,
        leads
      ),

    cpql:
      cpqlFromView ??
      safeDivide(
        spend,
        qualified
      ),

    cac:
      cacFromView ??
      safeDivide(
        spend,
        enrolled
      ),

    roas:
      roasFromView ??
      (
        spendCurrency ===
          'INR'
          ? safeDivide(
              revenueInr,
              spend
            )
          : null
      ),

    source:
      'live',
  };
}


function pickText(
  row:
    Record<
      string,
      unknown
    >,
  keys: string[]
) {
  for (
    const key
    of keys
  ) {
    const value =
      row[
        key
      ];

    if (
      value != null &&
      String(
        value
      ).trim() !==
        ''
    ) {
      return String(
        value
      );
    }
  }

  return null;
}


function pickNumber(
  row:
    Record<
      string,
      unknown
    >,
  keys: string[]
) {
  return (
    pickNullableNumber(
      row,
      keys
    ) ??
    0
  );
}


function pickNullableNumber(
  row:
    Record<
      string,
      unknown
    >,
  keys: string[]
) {
  for (
    const key
    of keys
  ) {
    const value =
      row[
        key
      ];

    if (
      value == null ||
      value ===
        ''
    ) {
      continue;
    }

    const number =
      Number(
        value
      );

    if (
      Number.isFinite(
        number
      )
    ) {
      return number;
    }
  }

  return null;
}


function safeNumber(
  value: unknown
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


function safeDivide(
  numerator: unknown,
  denominator: unknown
) {
  const top =
    safeNumber(
      numerator
    );

  const bottom =
    safeNumber(
      denominator
    );

  if (
    bottom <=
    0
  ) {
    return null;
  }

  return (
    top /
    bottom
  );
}
