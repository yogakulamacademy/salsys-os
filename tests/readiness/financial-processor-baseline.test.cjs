const { test } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');

const enrollmentPath = 'tests/database/process-enrollment-raw-event-v1.production-baseline.sql';
const paymentPath = 'tests/database/process-payment-raw-event-v1.production-baseline.sql';
const dispatcherPath = 'tests/database/process-tracking-raw-event-v1.production-baseline.sql';
const migrationPath = 'supabase/migrations/20261102115600_enrollment_processor_payment_association_v1.sql';
const paymentEvidenceMigrationPath = 'supabase/migrations/20261102161000_enrollment_verified_payment_evidence_v1.sql';
const contractReplayMigrationPath = 'supabase/migrations/20261102164700_enrollment_contract_replay_preservation_v1.sql';

const enrollment = fs.readFileSync(enrollmentPath, 'utf8');
const payment = fs.readFileSync(paymentPath, 'utf8');
const dispatcher = fs.readFileSync(dispatcherPath, 'utf8');
const migration = fs.readFileSync(migrationPath, 'utf8');
const paymentEvidenceMigration = fs.readFileSync(paymentEvidenceMigrationPath, 'utf8');
const contractReplayMigration = fs.readFileSync(contractReplayMigrationPath, 'utf8');

const md5 = value => crypto.createHash('md5').update(value, 'utf8').digest('hex');
const occurrences = (value, needle) => value.split(needle).length - 1;

// Authoritative read-only production evidence captured 2026-11-02 from
// supabase_migrations.schema_migrations version 20261019154130,
// event_lifecycle_projection_v1. The complete migration statement in the
// Supabase ledger was 35,391 bytes with MD5 79b3de6661e0551f862bdbd4750d41b6.
const production = {
  enrollment: { bytes: 8799, md5: '4ba0b10a80e0c205a3f6cc07bffa7c16' },
  payment: { bytes: 6627, md5: '9a002d3693411bd548a58fbd7a937de0' },
  dispatcher: { bytes: 4479, md5: '6fa37e3bfe601ed724263c05d7678e39' },
};

const anchor = "  if v_enrollment_reference is null then raise exception 'enrollment_reference is required'; end if;";
const legacyUpdate = `    update public.payments p set enrollment_id=v_enrollment_id,updated_at=now()\n    where p.organization_id=p_organization_id and p.lead_id=v_lead_id and p.enrollment_id is null\n      and p.metadata->>'booking_reference'=v_booking_reference;`;
const leadLock = `  perform 1 from public.leads where id=v_lead_id and organization_id=p_organization_id for update;\n  if not found then raise exception 'enrollment lead tenant mismatch'; end if;`;
const replacement = `    perform public.associate_booking_payments_enrollment_v1(\n      p_organization_id,v_lead_id,v_enrollment_id,v_booking_reference,p_raw_event_id\n    );`;
const paymentEvidenceAnchor = `  v_currency := upper(nullif(btrim(v_payload->>'currency'),''));\n\n  perform pg_advisory_xact_lock(hashtextextended('enrollment-ref:'||p_organization_id::text||':'||v_source.source_system||':'||v_enrollment_reference,0));`;
const paymentEvidenceReplacement = `  v_currency := upper(nullif(btrim(v_payload->>'currency'),''));\n\n  if lower(coalesce(v_raw.metadata->>'confirmation_basis','')) = 'verified_payment' then\n    perform app_private.assert_verified_payment_enrollment_v1(\n      p_organization_id,\n      v_lead_id,\n      v_booking_reference,\n      nullif(v_raw.metadata->>'payment_reference',''),\n      nullif(v_raw.metadata->>'payment_provider',''),\n      v_currency\n    );\n  end if;\n\n  perform pg_advisory_xact_lock(hashtextextended('enrollment-ref:'||p_organization_id::text||':'||v_source.source_system||':'||v_enrollment_reference,0));`;
const contractReplayAnchor = `      total_value=coalesce(v_total_value,e.total_value),\n      currency=coalesce(v_currency,e.currency),`;
const contractReplayReplacement = `      total_value=case\n        when exists (\n          select 1\n          from public.enrollment_contract_adjustments a\n          where a.organization_id=p_organization_id\n            and a.enrollment_id=e.id\n        ) then e.total_value\n        else coalesce(v_total_value,e.total_value)\n      end,\n      currency=case\n        when exists (\n          select 1\n          from public.enrollment_contract_adjustments a\n          where a.organization_id=p_organization_id\n            and a.enrollment_id=e.id\n        ) then e.currency\n        else coalesce(v_currency,e.currency)\n      end,`;

function associationPatchedEnrollment() {
  return enrollment
    .replace(anchor, `${anchor}\n\n${leadLock}`)
    .replace(legacyUpdate, replacement);
}

function paymentEvidencePatchedEnrollment() {
  return associationPatchedEnrollment().replace(
    paymentEvidenceAnchor,
    paymentEvidenceReplacement,
  );
}

test('captured production processor definitions retain exact reviewed hashes', () => {
  assert.equal(Buffer.byteLength(enrollment, 'utf8'), production.enrollment.bytes);
  assert.equal(md5(enrollment), production.enrollment.md5);
  assert.equal(Buffer.byteLength(payment, 'utf8'), production.payment.bytes);
  assert.equal(md5(payment), production.payment.md5);
  assert.equal(Buffer.byteLength(dispatcher, 'utf8'), production.dispatcher.bytes);
  assert.equal(md5(dispatcher), production.dispatcher.md5);
});

test('the real production enrollment baseline has exactly one reviewed patch target', () => {
  assert.equal(occurrences(enrollment, anchor), 1);
  assert.equal(occurrences(enrollment, legacyUpdate), 1);
  assert.match(enrollment, /perform public\.upsert_tracking_entity_reference_v1\(/);
  assert.match(enrollment, /insert into public\.touchpoints\(/);
});

test('the association patch transforms the real production processor without rewriting surrounding behavior', () => {
  const patched = associationPatchedEnrollment();

  assert.notEqual(patched, enrollment);
  assert.equal(occurrences(patched, legacyUpdate), 0);
  assert.equal(occurrences(patched, replacement), 1);
  assert.equal(occurrences(patched, leadLock), 1);
  assert.match(patched, /perform public\.upsert_tracking_entity_reference_v1\(/);
  assert.match(patched, /insert into public\.touchpoints\(/);
  assert.match(patched, /return jsonb_build_object\('ok',true,'processed',true/);
});

test('the verified-payment patch applies exactly once after the reviewed association patch', () => {
  const associationPatched = associationPatchedEnrollment();
  assert.equal(occurrences(associationPatched, paymentEvidenceAnchor), 1);
  assert.equal(occurrences(associationPatched, paymentEvidenceReplacement), 0);

  const fullyPatched = paymentEvidencePatchedEnrollment();

  assert.equal(occurrences(fullyPatched, paymentEvidenceAnchor), 0);
  assert.equal(occurrences(fullyPatched, paymentEvidenceReplacement), 1);
  assert.equal(occurrences(fullyPatched, replacement), 1);
  assert.equal(occurrences(fullyPatched, leadLock), 1);
  assert.match(fullyPatched, /confirmation_basis',''\)\) = 'verified_payment'/);
  assert.match(fullyPatched, /app_private\.assert_verified_payment_enrollment_v1/);
  assert.match(fullyPatched, /payment_reference/);
  assert.match(fullyPatched, /payment_provider/);
});

test('contract replay preservation applies exactly once to the fully reviewed production processor', () => {
  const beforeReplayPatch = paymentEvidencePatchedEnrollment();
  assert.equal(occurrences(beforeReplayPatch, contractReplayAnchor), 1);
  assert.equal(occurrences(beforeReplayPatch, contractReplayReplacement), 0);

  const afterReplayPatch = beforeReplayPatch.replace(
    contractReplayAnchor,
    contractReplayReplacement,
  );

  assert.equal(occurrences(afterReplayPatch, contractReplayAnchor), 0);
  assert.equal(occurrences(afterReplayPatch, contractReplayReplacement), 1);
  assert.equal(occurrences(afterReplayPatch, paymentEvidenceReplacement), 1);
  assert.equal(occurrences(afterReplayPatch, replacement), 1);
  assert.equal(occurrences(afterReplayPatch, leadLock), 1);
  assert.match(afterReplayPatch, /from public\.enrollment_contract_adjustments a/);
  assert.match(afterReplayPatch, /then e\.total_value/);
  assert.match(afterReplayPatch, /then e\.currency/);
  assert.match(afterReplayPatch, /metadata=coalesce\(e\.metadata,'\{\}'::jsonb\)/);
  assert.match(afterReplayPatch, /return jsonb_build_object\('ok',true,'processed',true/);
});

test('payment-backed enforcement is conditional and does not make payment universal for all enrollment sources', () => {
  assert.match(
    paymentEvidenceMigration,
    /if lower\(coalesce\(v_raw\.metadata->>'confirmation_basis',''\)\) = 'verified_payment' then/,
  );
  assert.doesNotMatch(
    paymentEvidenceMigration,
    /required_fields.*payment_reference/i,
  );
  assert.match(
    paymentEvidenceMigration,
    /p\.status = 'paid'::public\.payment_status/,
  );
  assert.match(
    paymentEvidenceMigration,
    /p\.payment_kind <> 'refund'::public\.payment_kind/,
  );
  assert.match(paymentEvidenceMigration, /p\.amount > 0/);
});

test('the deployed payment processor replay semantics match the financial guard tests', () => {
  assert.match(payment, /payment\.started','payment\.completed','payment\.failed/);
  assert.match(payment, /enrollment_id=coalesce\(v_enrollment_id,p\.enrollment_id\)/);
  assert.match(payment, /when p\.status='paid' then p\.status/);
  assert.match(payment, /amount=v_amount/);
  assert.match(payment, /currency=v_currency/);
  assert.match(payment, /'latest_raw_event_id',v_raw\.id,'latest_source_event_id',v_raw\.source_event_id/);
  assert.match(payment, /'booking_reference',v_booking_reference,'trusted_server_event',true/);
});

test('the captured dispatcher still routes payment and enrollment events through the reviewed entry points', () => {
  assert.equal(
    occurrences(dispatcher, 'public.process_payment_raw_event_v1(p_organization_id,p_raw_event_id)'),
    1,
  );
  assert.equal(
    occurrences(dispatcher, 'public.process_enrollment_raw_event_v1(p_organization_id,p_raw_event_id)'),
    1,
  );
  assert.match(dispatcher, /v_raw\.event_family='payment'/);
  assert.match(dispatcher, /v_raw\.event_family='enrollment'/);
});

test('all enrollment processor migrations stay fail-closed around the reviewed production patch targets', () => {
  assert.match(migration, /Reviewed enrollment\/dispatcher processor baseline is required/);
  assert.match(migration, /Trusted processor ownership must match the private association helper owner/);
  assert.match(migration, /Expected exactly one reviewed enrollment association and lead-lock anchor/);
  assert.match(migration, /associate_booking_payments_enrollment_v1/);
  assert.match(migration, /revoke all on function public\.process_enrollment_raw_event_v1/);
  assert.match(migration, /grant execute on function public\.process_tracking_raw_event_v1\(uuid,uuid\) to service_role/);

  assert.match(paymentEvidenceMigration, /Reviewed enrollment processor baseline is required before verified-payment enforcement/);
  assert.match(paymentEvidenceMigration, /Enrollment processor and verified-payment helper ownership must match/);
  assert.match(paymentEvidenceMigration, /Expected reviewed enrollment payment-association and lead-lock baseline/);
  assert.match(paymentEvidenceMigration, /revoke all on function public\.process_enrollment_raw_event_v1/);
  assert.match(paymentEvidenceMigration, /grant execute on function public\.process_enrollment_raw_event_v1\(uuid,uuid\)\s+to service_role/);

  assert.match(contractReplayMigration, /Reviewed enrollment processor baseline is required before contract replay preservation/);
  assert.match(contractReplayMigration, /Enrollment processor and contract-adjustment ledger ownership must match/);
  assert.match(contractReplayMigration, /Expected reviewed enrollment association\/payment-evidence baseline before contract replay preservation/);
  assert.match(contractReplayMigration, /enrollment_contract_adjustments/);
  assert.match(contractReplayMigration, /revoke all on function public\.process_enrollment_raw_event_v1/);
  assert.match(contractReplayMigration, /grant execute on function public\.process_enrollment_raw_event_v1\(uuid,uuid\)\s+to service_role/);
});
