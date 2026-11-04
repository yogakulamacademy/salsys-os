const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '../..');
const read = (name) => fs.readFileSync(path.join(root, name), 'utf8');
const page = read('app/settings/team/page.tsx');
const directory = read('app/settings/team/team-directory.tsx');
const css = read('app/settings/team/team-access.css');
const actions = read('app/settings/team/actions.ts');

test('team redesign preserves tenant authorization and secure write flows', () => {
  assert.match(page, /requireCurrentOrganizationId\(supabase, user\.id\)/);
  assert.match(page, /\['owner', 'admin'\]\.includes/);
  assert.match(page, /\.eq\('organization_id', organizationId\)/);
  assert.match(page, /<TeamDirectory members=\{directoryMembers\}/);
  assert.match(page, /form action=\{createEmployeeAction\}/);
  assert.match(directory, /form action=\{setEmployeeActiveAction\}/);
  assert.match(actions, /provision_tenant_employee/);
  assert.match(actions, /set_tenant_employee_active/);
});

test('team metrics and interface reflect real membership rather than fabricated fixtures', () => {
  assert.match(page, /const totalMembers = teamMembers\.length/);
  assert.match(page, /const activeMembers = teamMembers\.filter/);
  assert.match(page, /const inactiveMembers = totalMembers - activeMembers/);
  assert.match(page, /const rolesInUse = new Set/);
  assert.match(page, /role(?:=|:).+Employee|New members receive the fixed Employee role/s);
  assert.doesNotMatch(page, /30\+ days|Last Active.*Today|Viewer.*member/);
  assert.match(directory, /members\.length > 0/);
  assert.match(directory, /No team members yet/);
  assert.match(directory, /No employees yet/);
  assert.match(directory, /No members match these filters/);
});

test('status filters and search are functional rather than decorative', () => {
  assert.match(directory, /useState<MemberStatusFilter>\('all'\)/);
  assert.match(directory, /setFilter\(option\.id\)/);
  assert.match(directory, /setSearch\(event\.target\.value\)/);
  assert.match(directory, /aria-pressed=\{filter === option\.id\}/);
  assert.match(directory, /type="search"/);
  assert.match(directory, /visible\.map\(member =>/);
});

test('new role creation is not advertised and temporary passwords remain required', () => {
  assert.match(page, /name="password".+type="password"/);
  assert.match(page, /minLength=\{10\}/);
  assert.match(page, /New members receive the fixed Employee role/);
  assert.doesNotMatch(page, /Manage Roles|Create Your First Role|Select role/);
  assert.match(css, /\.tac-empty-team/);
  assert.match(css, /\.tac-role-cards/);
  assert.match(css, /@media\(max-width:550px\)/);
});
