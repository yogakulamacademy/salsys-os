import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const migrationPath = path.join(
  root,
  'supabase/migrations/20261029103000_whatsapp_health_canonical_state_sync_v1.sql',
);

const sql = fs.readFileSync(migrationPath, 'utf8');
const lower = sql.toLowerCase();

for (const required of [
  'create or replace function public.sync_whatsapp_webhook_terminal_state_from_raw_v1()',
  'security definer',
  "new.status not in ('processed', 'ignored', 'dead_letter')",
  "r.source_system = 'whatsapp'",
  "r.metadata->>'legacy_webhook_event_id'",
  "when new.status = 'dead_letter' then 'failed'",
  "after insert or update of status, processed_at",
  "when (new.status in ('processed', 'ignored', 'dead_letter'))",
  'revoke all on function public.sync_whatsapp_webhook_terminal_state_from_raw_v1()',
  'from public, anon, authenticated;',
  "p.status in ('processed', 'ignored', 'dead_letter')",
]) {
  if (!lower.includes(required.toLowerCase())) {
    throw new Error(`WhatsApp canonical health sync is missing required contract: ${required}`);
  }
}

if (/after\s+insert\s+or\s+update\s+of[^\n]*(updated_at|processing_error)/i.test(sql)) {
  throw new Error('WhatsApp terminal-state trigger must not fire on unrelated updated_at/processing_error changes.');
}

if (/new\.status\s*=\s*'failed'/i.test(sql) || /new\.status\s+in\s*\([^)]*'failed'/i.test(sql)) {
  throw new Error('Retryable canonical failed state must not be propagated as terminal legacy state.');
}

if (!/where\s+r\.organization_id\s*=\s*w\.organization_id/i.test(sql)) {
  throw new Error('Existing-state reconciliation must remain tenant-bound.');
}

for (const forbidden of [
  'create or replace view public.v_system_health',
  'create or replace view public.v_system_recent_failures',
  "interval '00:15:00'",
]) {
  if (lower.includes(forbidden.toLowerCase())) {
    throw new Error(`PH-3 reconciliation must not weaken or rewrite System Health alert rules: ${forbidden}`);
  }
}

if (/delete\s+from\s+public\.whatsapp_webhook_events/i.test(sql)) {
  throw new Error('Raw legacy WhatsApp webhook evidence must never be deleted by health reconciliation.');
}

console.log('WhatsApp canonical health reconciliation contracts verified.');
