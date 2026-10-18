import 'server-only';

import { createAdminClient } from '@/lib/supabase/admin';
import type { SeoSurface } from '@/lib/seo/competitor-intelligence';

function text(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

function configured() {
  return Boolean(process.env.SEO_RANKING_API_URL && process.env.SEO_RANKING_API_KEY);
}

function surfaceEnabled(settings: any, surface: SeoSurface) {
  if (surface === 'seo') return settings?.seo_enabled !== false;
  if (surface === 'aeo') return settings?.aeo_enabled !== false;
  return settings?.geo_enabled !== false;
}

export async function getRankProviderControl(organizationId: string) {
  const admin = createAdminClient();
  const [{ data: settings, error: settingsError }, { data: health, error: healthError }] = await Promise.all([
    admin.from('seo_rank_provider_settings').select('organization_id,provider_key,enabled,seo_enabled,aeo_enabled,geo_enabled,min_interval_minutes,max_checks_per_hour,max_checks_per_day,test_query,test_country_code,test_locale,last_health_status,last_health_checked_at,last_health_latency_ms,last_health_error_category,updated_at').eq('organization_id', organizationId).maybeSingle(),
    admin.from('seo_rank_provider_health_runs').select('id,provider_key,surface,query,status,latency_ms,normalized_ok,provider_name,error_category,result_summary,created_at').eq('organization_id', organizationId).order('created_at', { ascending: false }).limit(12),
  ]);
  if (settingsError) throw new Error(`SEO_RANK_PROVIDER_SETTINGS_FAILED:${settingsError.message}`);
  if (healthError) throw new Error(`SEO_RANK_PROVIDER_HEALTH_FAILED:${healthError.message}`);

  return {
    configured: configured(),
    settings: settings ?? null,
    recent_health: health ?? [],
  };
}

export async function saveRankProviderSettings(input: {
  organizationId: string;
  enabled?: boolean;
  seoEnabled?: boolean;
  aeoEnabled?: boolean;
  geoEnabled?: boolean;
  minIntervalMinutes?: number;
  maxChecksPerHour?: number;
  maxChecksPerDay?: number;
  testQuery?: string;
  testCountryCode?: string;
  testLocale?: string;
}) {
  const admin = createAdminClient();
  const control = await getRankProviderControl(input.organizationId);
  const current = control.settings ?? {};

  if (input.enabled === true) {
    if (!control.configured) throw new Error('SEO_RANK_PROVIDER_NOT_CONFIGURED');
    if (!['ok', 'degraded'].includes(String(current.last_health_status || ''))) {
      throw new Error('SEO_RANK_PROVIDER_HEALTH_REQUIRED');
    }
  }

  const minInterval = Math.max(60, Math.min(Number(input.minIntervalMinutes ?? current.min_interval_minutes ?? 60), 10080));
  const maxHour = Math.max(1, Math.min(Number(input.maxChecksPerHour ?? current.max_checks_per_hour ?? 20), 500));
  const maxDay = Math.max(maxHour, Math.min(Number(input.maxChecksPerDay ?? current.max_checks_per_day ?? 200), 5000));
  const country = text(input.testCountryCode ?? current.test_country_code ?? 'IN').toUpperCase().slice(0, 3) || 'IN';
  const locale = text(input.testLocale ?? current.test_locale ?? 'en-IN').slice(0, 20) || 'en-IN';
  const query = text(input.testQuery ?? current.test_query ?? '').slice(0, 300) || null;

  const { data, error } = await admin.from('seo_rank_provider_settings').upsert({
    organization_id: input.organizationId,
    provider_key: 'external_http',
    enabled: input.enabled ?? current.enabled ?? false,
    seo_enabled: input.seoEnabled ?? current.seo_enabled ?? true,
    aeo_enabled: input.aeoEnabled ?? current.aeo_enabled ?? true,
    geo_enabled: input.geoEnabled ?? current.geo_enabled ?? true,
    min_interval_minutes: minInterval,
    max_checks_per_hour: maxHour,
    max_checks_per_day: maxDay,
    test_query: query,
    test_country_code: country,
    test_locale: locale,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'organization_id' }).select('*').single();
  if (error) throw new Error(`SEO_RANK_PROVIDER_SETTINGS_SAVE_FAILED:${error.message}`);
  return data;
}

function normalizedObservation(result: Record<string, unknown>, surface: SeoSurface) {
  const has = (key: string) => Object.prototype.hasOwnProperty.call(result, key);
  const nullableNumber = (key: string) => !has(key) || result[key] === null || typeof result[key] === 'number';
  const nullableBoolean = (key: string) => !has(key) || result[key] === null || typeof result[key] === 'boolean';
  const arraysOk = (!has('competitor_results') || Array.isArray(result.competitor_results)) && (!has('serp_features') || Array.isArray(result.serp_features));
  if (!arraysOk) return false;
  if (surface === 'seo') return has('own_position') && nullableNumber('own_position');
  if (surface === 'aeo') return has('answer_visibility') && nullableBoolean('answer_visibility');
  return has('ai_cited') && nullableBoolean('ai_cited') && nullableNumber('ai_citation_position');
}

export async function testRankProvider(input: {
  organizationId: string;
  userId?: string;
  surface: SeoSurface;
  query: string;
  countryCode?: string;
  locale?: string;
  device?: 'desktop' | 'mobile';
}) {
  const admin = createAdminClient();
  const control = await getRankProviderControl(input.organizationId);
  const settings = control.settings;
  const query = text(input.query).slice(0, 300);
  if (query.length < 2) throw new Error('SEO_RANK_QUERY_INVALID');
  if (!surfaceEnabled(settings, input.surface)) throw new Error('SEO_RANK_SURFACE_DISABLED');

  const started = Date.now();
  let status: 'ok' | 'degraded' | 'failed' | 'not_configured' = 'failed';
  let normalizedOk = false;
  let providerName: string | null = null;
  let errorCategory: string | null = null;
  let summary: Record<string, unknown> = {};

  if (!configured()) {
    status = 'not_configured';
    errorCategory = 'credentials_missing';
  } else {
    try {
      const response = await fetch(process.env.SEO_RANKING_API_URL!, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${process.env.SEO_RANKING_API_KEY!}`,
        },
        body: JSON.stringify({
          query,
          surface: input.surface,
          locale: text(input.locale) || settings?.test_locale || 'en-IN',
          country_code: (text(input.countryCode) || settings?.test_country_code || 'IN').toUpperCase(),
          device: input.device === 'mobile' ? 'mobile' : 'desktop',
          engine: input.surface === 'geo' ? 'ai' : 'google',
          dry_run: true,
        }),
        signal: AbortSignal.timeout(30000),
      });
      if (!response.ok) {
        status = 'failed';
        errorCategory = `provider_http_${response.status}`;
      } else {
        const result = await response.json() as Record<string, unknown>;
        normalizedOk = normalizedObservation(result, input.surface);
        providerName = text(result.provider) || null;
        status = normalizedOk ? 'ok' : 'degraded';
        errorCategory = normalizedOk ? null : 'normalization_failed';
        summary = {
          observed: input.surface === 'seo' ? result.own_position !== null : input.surface === 'aeo' ? result.answer_visibility === true : result.ai_cited === true,
          own_position: typeof result.own_position === 'number' ? result.own_position : null,
          answer_visibility: typeof result.answer_visibility === 'boolean' ? result.answer_visibility : null,
          ai_cited: typeof result.ai_cited === 'boolean' ? result.ai_cited : null,
          competitor_count: Array.isArray(result.competitor_results) ? result.competitor_results.length : 0,
          serp_feature_count: Array.isArray(result.serp_features) ? result.serp_features.length : 0,
        };
      }
    } catch (error) {
      status = 'failed';
      errorCategory = error instanceof Error && error.name === 'TimeoutError' ? 'provider_timeout' : 'provider_request_failed';
    }
  }

  const latency = Date.now() - started;
  const { data: run, error: runError } = await admin.from('seo_rank_provider_health_runs').insert({
    organization_id: input.organizationId,
    provider_key: settings?.provider_key || 'external_http',
    surface: input.surface,
    query,
    status,
    latency_ms: latency,
    normalized_ok: normalizedOk,
    provider_name: providerName,
    error_category: errorCategory,
    result_summary: summary,
    created_by: input.userId || null,
  }).select('*').single();
  if (runError) throw new Error(`SEO_RANK_PROVIDER_HEALTH_SAVE_FAILED:${runError.message}`);

  await admin.from('seo_rank_provider_settings').upsert({
    organization_id: input.organizationId,
    provider_key: settings?.provider_key || 'external_http',
    enabled: settings?.enabled ?? false,
    seo_enabled: settings?.seo_enabled ?? true,
    aeo_enabled: settings?.aeo_enabled ?? true,
    geo_enabled: settings?.geo_enabled ?? true,
    min_interval_minutes: settings?.min_interval_minutes ?? 60,
    max_checks_per_hour: settings?.max_checks_per_hour ?? 20,
    max_checks_per_day: settings?.max_checks_per_day ?? 200,
    test_query: query,
    test_country_code: (text(input.countryCode) || settings?.test_country_code || 'IN').toUpperCase(),
    test_locale: text(input.locale) || settings?.test_locale || 'en-IN',
    last_health_status: status,
    last_health_checked_at: new Date().toISOString(),
    last_health_latency_ms: latency,
    last_health_error_category: errorCategory,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'organization_id' });

  return run;
}
