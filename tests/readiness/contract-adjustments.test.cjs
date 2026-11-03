const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const page = fs.readFileSync('app/leads/[id]/page.tsx', 'utf8');
const card = fs.readFileSync('components/contract-value-card.tsx', 'utf8');
const action = fs.readFileSync('app/actions/enrollments.ts', 'utf8');
const paymentCard = fs.readFileSync('components/payment-card.tsx', 'utf8');
const contractMigration = fs.readFileSync(
  'supabase/migrations/20261102164500_enrollment_contract_adjustments_v1.sql',
  'utf8',
);
const precedenceMigration = fs.readFileSync(
  'supabase/migrations/20261102164600_enrollment_contract_value_precedence_v1.sql',
  'utf8',
);
const replayMigration = fs.readFileSync(
  'supabase/migrations/20261102164700_enrollment_contract_replay_preservation_v1.sql',
  'utf8',
);

test('lead detail exposes Contract value as a separate card before the cash payment module', () => {
  assert.match(page, /import \{ ContractValueCard \} from "@\/components\/contract-value-card"/);
  const contractIndex = page.indexOf('<ContractValueCard leadId={id} />');
  const paymentIndex = page.indexOf('<PaymentCard');
  assert.ok(contractIndex >= 0, 'ContractValueCard must be mounted on Lead detail');
  assert.ok(paymentIndex >= 0, 'PaymentCard must remain mounted on Lead detail');
  assert.ok(contractIndex < paymentIndex, 'Contract value must stay separate and precede Payments & revenue');
  assert.match(page, /"contract-adjusted":\s*\n\s*"Contract value updated\. No payment or refund was created\."/);
  assert.match(page, /"contract-adjusted-overpayment":/);
  assert.match(page, /"mock-contract-adjustment":/);
});

test('contract card communicates the human approval and no-cash boundary', () => {
  assert.match(card, /Commercial agreement/);
  assert.match(card, /Contract value/);
  assert.match(card, /Human approval boundary\./);
  assert.match(card, /does not edit a payment, issue a refund, or move money/);
  assert.match(card, /Only organization owners or admins can approve a contract value adjustment/);
  assert.match(card, /workspace\.activeWorkspace\?\.role/);
  assert.match(card, /role === 'owner' \|\| role === 'admin'/);
  assert.match(card, /Approve contract adjustment/);
  assert.match(card, /value="scholarship"/);
  assert.match(card, /value="discount"/);
  assert.match(card, /value="fee_waiver"/);
  assert.match(card, /value="price_change"/);
  assert.match(card, /value="contract_correction"/);
});

test('server action derives tenant context and uses only the governed adjustment RPC', () => {
  assert.match(action, /requireCurrentOrganizationId\(supabase, user\.id\)/);
  assert.match(action, /\.from\('enrollments'\)/);
  assert.match(action, /\.eq\('lead_id', leadId\)/);
  assert.match(action, /\.eq\('organization_id', organizationId\)/);
  assert.match(action, /supabase\.rpc\('apply_enrollment_contract_adjustment_v1'/);
  assert.match(action, /p_organization_id: organizationId/);
  assert.match(action, /p_enrollment_id: enrollmentId/);
  assert.match(action, /result\.cash_changed === true/);
  assert.doesNotMatch(action, /\.from\(['"]enrollment_contract_adjustments['"]\)\s*\.insert/);
  assert.doesNotMatch(action, /\.from\(['"]payments['"]\)\s*\.(insert|update|delete)/);
});

test('contract migration is human-approved, append-only, and never writes cash rows', () => {
  assert.match(contractMigration, /create table public\.enrollment_contract_adjustments/);
  assert.match(contractMigration, /Enrollment contract adjustments are append-only/);
  assert.match(contractMigration, /Authenticated human approval is required for contract adjustments/);
  assert.match(contractMigration, /has_organization_role\(p_organization_id, array\['owner'::text,'admin'::text\]\)/);
  assert.match(contractMigration, /grant execute on function public\.apply_enrollment_contract_adjustment_v1[\s\S]*to authenticated/);
  assert.match(contractMigration, /revoke all on function public\.apply_enrollment_contract_adjustment_v1[\s\S]*from public, anon, service_role/);
  assert.match(contractMigration, /'cash_changed', false/);
  assert.doesNotMatch(contractMigration, /insert into public\.payments/i);
  assert.doesNotMatch(contractMigration, /update public\.payments/i);
  assert.doesNotMatch(contractMigration, /delete from public\.payments/i);
});

test('forecast and contract truth remain distinct after canonical enrollment', () => {
  assert.match(precedenceMigration, /coalesce\(latest_enrollment\.total_value, l\.potential_value\)/);
  assert.match(precedenceMigration, /coalesce\(latest_enrollment\.currency, l\.potential_currency, 'INR'\)/);
  assert.match(precedenceMigration, /with \(security_invoker = true\)/);
  assert.match(precedenceMigration, /Lead potential value is pre-enrollment forecast; latest enrollment total value is authoritative contract value after enrollment/);
});

test('trusted enrollment replay preserves an approved governed contract without widening processor access', () => {
  assert.match(replayMigration, /from public\.enrollment_contract_adjustments a/);
  assert.match(replayMigration, /then e\.total_value/);
  assert.match(replayMigration, /then e\.currency/);
  assert.match(replayMigration, /Expected reviewed enrollment association\/payment-evidence baseline before contract replay preservation/);
  assert.match(replayMigration, /revoke all on function public\.process_enrollment_raw_event_v1\(uuid,uuid\)[\s\S]*from public, anon, authenticated/);
  assert.match(replayMigration, /grant execute on function public\.process_enrollment_raw_event_v1\(uuid,uuid\)[\s\S]*to service_role/);
});

test('PaymentCard remains cash-focused and does not own the contract adjustment workflow', () => {
  assert.doesNotMatch(paymentCard, /ContractValueCard/);
  assert.doesNotMatch(paymentCard, /applyEnrollmentContractAdjustmentAction/);
  assert.doesNotMatch(paymentCard, /enrollment_contract_adjustments/);
});
