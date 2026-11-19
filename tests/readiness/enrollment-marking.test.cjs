const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const read = (p) => fs.readFileSync(path.join(__dirname, '..', '..', p), 'utf8');

test('enrolment: owner or admin marks, payment status required, admin verifies payments only', () => {
  const sql = read('supabase/migrations/20261119180000_enrollment_marking_and_payment_verification_v1.sql');
  assert.match(sql, /public\.can_manage_organization\(l\.organization_id\)\s*or \(l\.owner_user_id = auth\.uid\(\) and public\.can_work_lead\(l\.id\)\)/);
  assert.match(sql, /if p_payment_plan not in \('full', 'instalment', 'unpaid'\)/);
  assert.match(sql, /'pending', p_amount_paid/);
  assert.match(sql, /raise exception 'Only an admin can verify payments'/);
  assert.match(sql, /v_balance_due := v_batch_start \+ 7/);
  assert.match(sql, /raise exception 'Say why the payment is rejected'/);
  const actions = read('app/enrollments/payment-actions.ts');
  assert.match(actions, /rpc\("record_enrollment_v1"/);
  assert.match(actions, /rpc\("verify_enrollment_payment_v1"/);
  const page = read('app/enrollments/page.tsx');
  assert.match(page, /isAdmin === true \? getPaymentsToVerify/);
});
