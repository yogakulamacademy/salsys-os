import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8');
}

function expectIncludes(source, needle, label) {
  if (!source.includes(needle)) {
    throw new Error(`Operations final closeout verification failed: ${label}`);
  }
}

function expectNotIncludes(source, needle, label) {
  if (source.includes(needle)) {
    throw new Error(`Operations final closeout verification failed: ${label}`);
  }
}

const migration = read('supabase/migrations/20261101053000_operations_final_closeout_v1.sql');
const data = read('lib/course-management-data.ts');
const overview = read('app/operations/page.tsx');
const availability = read('app/availability/page.tsx');
const courseLayout = read('app/course-management/layout.tsx');
const coursePage = read('app/course-management/page.tsx');
const enrollmentsPage = read('app/enrollments/page.tsx');
const enrollmentsData = read('lib/enrollments-data.ts');
const operationsAccess = read('lib/operations-access.ts');
const courseActions = read('app/course-management/actions.ts');

for (const [needle, label] of [
  ["regexp_count(v_def, v_end_boundary_pattern, 1, 'i') <> 3", 'migration must fail closed if legacy future-boundary definition drifts'],
  ["'b.start_date >= p.today_date'", 'canonical RPC must use future start-date boundary'],
  ["'where capacity is null or capacity <= 0'", 'canonical RPC must treat non-positive capacity as incomplete'],
  ['Upcoming/open capacity cohorts use batch start_date >= current_date', 'migration must document future schedule semantics'],
  ['missing or non-positive capacity remains incomplete setup', 'migration must document unknown-capacity semantics'],
]) {
  expectIncludes(migration, needle, label);
}

for (const [needle, label] of [
  ['Boolean(batch.start_date && batch.start_date >= today)', 'fallback future cohort must use start date'],
  ['capacity == null || capacity <= 0', 'fallback calculated seats must preserve missing/non-positive capacity as unknown'],
  ['return capacity == null || capacity <= 0;', 'fallback needs-capacity summary must include non-positive capacity'],
  ['const isFuture = Boolean(batch.start_date && batch.start_date >= today);', 'fallback open/upcoming filters must share the future boundary'],
]) {
  expectIncludes(data, needle, label);
}
expectNotIncludes(data, '!batch.end_date || batch.end_date >= today', 'fallback must not revert future capacity to end-date semantics');

for (const [needle, label] of [
  ['Boolean(batch.start_date && batch.start_date >= today)', 'Operations pressure queue must use future start-date cohort'],
  ['Future capacity setup incomplete', 'Operations must surface incomplete future capacity'],
  ['Unknown capacity is not treated as zero seats', 'Operations must preserve unknown capacity semantics'],
  ['value={hasKnownCapacity ? summary.totalOpenSeats.toLocaleString("en-IN") : "—"}', 'Calculated open must not display zero when no future capacity is known'],
  ['evidenceState={!hasKnownCapacity ? "unknown" : capacityEvidenceComplete ? "derived" : "partial"}', 'Calculated open must expose evidence completeness'],
  ['Already-started batches do not enter future-capacity totals.', 'Operations must explain future cohort boundary'],
  ['Missing future capacity is unknown, not zero', 'Operating truth must explicitly preserve unknown capacity'],
]) {
  expectIncludes(overview, needle, label);
}

for (const [needle, label] of [
  ['Boolean(row.start_date && row.start_date >= today)', 'Availability must use future start-date boundary'],
  ['Future capacity setup is incomplete.', 'Availability must surface missing future capacity'],
  ['Open-seat totals remain unknown', 'Availability must preserve unknown open seats'],
  ['capacity == null || capacity <= 0 ? "Unknown"', 'Availability capacity cell must not render missing capacity as zero'],
  ['status === "capacity_not_set"', 'Availability must recognize canonical capacity-not-set state'],
]) {
  expectIncludes(availability, needle, label);
}
expectNotIncludes(availability, '!row.end_date || row.end_date >= today', 'Availability must not use end-date future semantics');

for (const [needle, label] of [
  ["from(\"v_admissions_upcoming_batch_capacity\")", 'Course Management must read canonical future capacity readiness'],
  ['Future capacity readiness unavailable', 'Course Management must fail closed when capacity readiness cannot be read'],
  ['must not be interpreted as proof of zero seats', 'Course Management must reject false zero-seat inference'],
  ['Future capacity setup incomplete', 'Course Management must surface incomplete capacity setup'],
  ['missing capacity remains unknown rather than zero seats', 'Course Management must preserve unknown capacity semantics'],
]) {
  expectIncludes(courseLayout, needle, label);
}

for (const [needle, label] of [
  ['These rows come from the Enrollments table.', 'Enrollments UI must identify authoritative source'],
  ['Lead marked Enrolled without an Enrollment record will not appear here.', 'Lead stage must not substitute for Enrollment record'],
  ['Lead stage is shown only as context and never substitutes for Enrollment status.', 'Enrollment status semantics must remain explicit'],
]) {
  expectIncludes(enrollmentsPage, needle, label);
}
expectIncludes(enrollmentsData, '.from("enrollments")', 'Enrollment workspace must read authoritative enrollment records');
expectNotIncludes(enrollmentsData, 'current_stage === "enrolled"', 'Enrollment workspace must not synthesize records from lead stage');

expectIncludes(operationsAccess, 'new Set(["owner", "admin", "manager"])', 'Operations access must remain owner/admin/manager only');
expectIncludes(courseActions, 'Published seats remaining cannot exceed batch capacity', 'Published-seat guard must remain enforced');
expectIncludes(courseActions, 'update_course_batch_admin_v2', 'Course Management writes must remain on tenant-aware admin RPC');
expectIncludes(coursePage, 'Capacity cannot be saved below this number.', 'Course Management UI must preserve capacity floor guidance');

console.log('Operations final closeout contracts verified.');
