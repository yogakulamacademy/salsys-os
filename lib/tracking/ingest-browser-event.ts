import type { SupabaseClient } from '@supabase/supabase-js';

import type { TrackingPayload } from '@/lib/tracking/server';

export type TrackingRequestGeo = {
  country: string | null;
  region: string | null;
  city: string | null;
  timezone: string | null;
};

export async function ingestBrowserTrackingEvent({
  supabase,
  payload,
  organizationId,
  trustedSite,
  originHostname,
  geo,
  userAgent,
  credentialId,
  credentialPublicKey,
  schemaVersion,
  sdkVersion,
}: {
  supabase: SupabaseClient;
  payload: TrackingPayload;
  organizationId: string;
  trustedSite: string;
  originHostname: string;
  geo: TrackingRequestGeo;
  userAgent: string | null;
  credentialId: string | null;
  credentialPublicKey: string | null;
  schemaVersion: number;
  sdkVersion: string | null;
}) {
  const occurredAt = payload.occurredAt || new Date().toISOString();

  const canonicalPayload: TrackingPayload = {
    ...payload,
    metadata: {
      ...(payload.metadata || {}),
      salsys_transport: {
        sdk_version: sdkVersion,
        schema_version: schemaVersion,
      },
    },
  };

  const { data: rawEventResult, error: rawEventError } = await supabase.rpc(
    'ingest_raw_event',
    {
      p_organization_id: organizationId,
      p_source_system: 'website',
      p_source_event_id: payload.eventId,
      p_source_event_type: payload.eventType,
      p_ingestion_method: 'tracking_collect',
      p_occurred_at: occurredAt,
      p_source_account_id: credentialPublicKey,
      p_source_subject_id: null,
      p_anonymous_visitor_id: payload.anonymousVisitorId,
      p_session_key: payload.sessionKey,
      p_external_message_id: null,
      p_site: trustedSite,
      p_payload: canonicalPayload,
      p_context: {
        origin_hostname: originHostname,
        trusted_site: trustedSite,
        geo_country: geo.country,
        geo_region: geo.region,
        geo_city: geo.city,
        geo_timezone: geo.timezone,
        user_agent: userAgent,
        sdk_version: sdkVersion,
        schema_version: schemaVersion,
      },
      p_metadata: {
        adapter: 'app/api/tracking/collect',
        reported_site: payload.site || null,
        browser_auth: credentialId ? 'publishable_key' : 'legacy_origin',
        credential_id: credentialId,
        sdk_version: sdkVersion,
        schema_version: schemaVersion,
      },
      p_schema_version: schemaVersion,
    },
  );

  if (rawEventError || !rawEventResult?.event_id) {
    throw new Error(
      rawEventError?.message ||
        'Unable to persist canonical website event before normalization.',
    );
  }

  const rawEventId = String(rawEventResult.event_id);

  const { error: processingError } = await supabase.rpc(
    'process_website_raw_event',
    {
      p_organization_id: organizationId,
      p_raw_event_id: rawEventId,
    },
  );

  if (processingError) throw processingError;

  if (payload.fbc || payload.fbp) {
    const { error: matchSignalError } = await supabase.rpc(
      'apply_tracking_match_signals',
      {
        p_organization_id: organizationId,
        p_raw_event_id: rawEventId,
      },
    );

    if (matchSignalError) throw matchSignalError;
  }

  if (payload.consent) {
    const { error: consentSnapshotError } = await supabase.rpc(
      'ingest_tracking_consent_event',
      {
        p_organization_id: organizationId,
        p_source_event_id: payload.eventId,
        p_occurred_at: occurredAt,
        p_anonymous_visitor_id: payload.anonymousVisitorId,
        p_session_key: payload.sessionKey,
        p_site: trustedSite,
        p_consent_analytics: payload.consent.analytics,
        p_consent_ad_user_data: payload.consent.adUserData,
        p_consent_ad_personalization: payload.consent.adPersonalization,
        p_consent_marketing: payload.consent.marketing,
        p_consent_mode: payload.consent.mode || null,
        p_consent_source:
          payload.consent.source ||
          (credentialId ? 'salsys_browser_sdk' : 'yk_tracker'),
        p_raw_event_id: rawEventId,
        p_metadata: {
          adapter: 'app/api/tracking/collect',
          provenance: 'event_time_snapshot',
          credential_id: credentialId,
          sdk_version: sdkVersion,
          schema_version: schemaVersion,
        },
      },
    );

    if (consentSnapshotError) throw consentSnapshotError;
  }

  const { error: rawProcessingError } = await supabase.rpc(
    'set_raw_event_processing_status',
    {
      p_organization_id: organizationId,
      p_source_system: 'website',
      p_source_event_id: payload.eventId,
      p_status: 'processed',
      p_processor_name: 'tracking_collect',
      p_processor_version: credentialId
        ? 'salsys-sdk-reliable-v1'
        : 'phase3b',
      p_processing_error: null,
      p_processing_metadata: {
        normalized_target: 'web_sessions,touchpoints',
        normalizer: 'process_website_raw_event',
        match_signals_projected: Boolean(payload.fbc || payload.fbp),
        consent_snapshot_persisted: Boolean(payload.consent),
        credential_id: credentialId,
        sdk_version: sdkVersion,
        schema_version: schemaVersion,
      },
    },
  );

  // Lifecycle bookkeeping should not turn a successfully normalized event
  // into a client retry, because raw-event ingestion is already idempotent.
  if (rawProcessingError) {
    console.error('Raw website event processing sync failed', {
      organizationId,
      eventId: payload.eventId,
      eventType: payload.eventType,
      message: rawProcessingError.message,
    });
  }

  return {
    eventId: payload.eventId,
    rawEventId,
  };
}
