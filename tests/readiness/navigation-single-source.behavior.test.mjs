import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import {
  buildNavigation,
  isSectionActive,
  listDestinations,
  resolveLocation,
  searchDestinations,
} from '../../lib/navigation.ts';

const admin = buildNavigation({ employee: false, privileged: true, admin: true });
const manager = buildNavigation({ employee: false, privileged: true, admin: false });
const employee = buildNavigation({ employee: true, privileged: false, admin: false });
const none = buildNavigation({ employee: false, privileged: false, admin: false });

const where = (path, sections = admin) => {
  const location = resolveLocation(path, sections);
  return location ? `${location.sectionLabel} / ${location.pageLabel}` : null;
};

test('every privileged workspace is named and located once', () => {
  assert.equal(where('/home'), 'Home / Command Center');
  assert.equal(where('/conversations'), 'Inbox / Inbox');
  assert.equal(where('/leads'), 'CRM / Leads');
  assert.equal(where('/leads/abc-123'), 'CRM / Leads');
  assert.equal(where('/leads/new'), 'CRM / New lead');
  assert.equal(where('/admissions'), 'CRM / Admissions');
  assert.equal(where('/customer-360/person-1'), 'CRM / Customer 360');
  assert.equal(where('/re-engaged'), 'CRM / Re-engaged');
  assert.equal(where('/marketing'), 'Marketing / Marketing Workspace');
  assert.equal(where('/seo/technical'), 'Marketing / Search Intelligence');
  assert.equal(where('/revenue'), 'Revenue / Revenue workspace');
  assert.equal(where('/revenue/valuation'), 'Revenue / Revenue valuation');
  assert.equal(where('/operations'), 'Operations / Overview');
  assert.equal(where('/enrollments'), 'Operations / Enrollments');
  assert.equal(where('/performance'), 'Performance / Performance Workspace');
  assert.equal(where('/team-performance'), 'Performance / Team performance');
  assert.equal(where('/automation/templates'), 'Automation / Workflows');
  assert.equal(where('/settings/team'), 'Settings / Team & Permissions');
  assert.equal(where('/tracking/forms'), 'Settings / Tracking & Data');
  assert.equal(where('/system-health/message-sync'), 'Settings / Message sync');
});

test('routes that used to fall back to "Home / SalsysOS" now resolve', () => {
  for (const path of ['/home', '/marketing', '/operations', '/performance', '/customer-360', '/enrollments', '/availability']) {
    const location = resolveLocation(path, admin);
    assert.ok(location, path);
    if (path !== '/home') assert.notEqual(location.section.id, 'home', path);
  }
});

test('the header location always agrees with the sidebar highlight', () => {
  const paths = admin.flatMap((section) => [
    section.href.split('?')[0],
    ...(section.activeHrefs ?? []),
    ...(section.items ?? []).map((item) => item.href),
  ]);
  for (const path of paths) {
    const location = resolveLocation(path, admin);
    assert.ok(location, path);
    const highlighted = admin.find((section) => isSectionActive(path, section));
    assert.equal(location.section.id, highlighted.id, path);
  }
});

test('roles only see what they can open', () => {
  assert.deepEqual(employee.map((section) => section.id), ['home', 'inbox', 'crm']);
  assert.equal(where('/dashboard', employee), 'Home / My work');
  assert.equal(where('/marketing', employee), null);
  assert.equal(where('/revenue', employee), null);
  assert.deepEqual(none, []);

  const managerSettings = manager.find((section) => section.id === 'settings').items.map((item) => item.href);
  assert.ok(!managerSettings.includes('/settings/team'));
  assert.ok(!managerSettings.includes('/system-health'));
  const adminSettings = admin.find((section) => section.id === 'settings').items.map((item) => item.href);
  assert.ok(adminSettings.includes('/settings/team'));
  assert.ok(adminSettings.includes('/system-health'));
});

test('workspace search finds destinations by current and old names', () => {
  const destinations = listDestinations(admin);
  const hrefs = (query) => searchDestinations(query, destinations).map((item) => item.href);

  assert.deepEqual(hrefs('enrollments'), ['/enrollments']);
  assert.ok(hrefs('funnel').includes('/marketing'));
  assert.ok(hrefs('course management').includes('/course-management'));
  assert.ok(hrefs('system health').includes('/system-health'));
  assert.ok(hrefs('whatsapp').includes('/conversations'));
  assert.deepEqual(hrefs(''), []);
  assert.deepEqual(hrefs('zzzz-no-match'), []);

  const employeeDestinations = listDestinations(employee);
  assert.deepEqual(searchDestinations('revenue', employeeDestinations), []);
  assert.equal(new Set(destinations.map((item) => item.href)).size, destinations.length);
});

test('no menu entry points at a redirect-only route', () => {
  const redirectOnly = ['/crm', '/workspace', '/campaigns', '/analytics', '/funnel', '/attribution', '/commercial-intelligence', '/contact-intelligence'];
  for (const destination of [...listDestinations(admin), ...listDestinations(employee)]) {
    assert.ok(!redirectOnly.includes(destination.href.split('?')[0]), destination.href);
  }
});

test('every menu destination has a page', () => {
  for (const destination of [...listDestinations(admin), ...listDestinations(employee)]) {
    const route = destination.href.split('?')[0];
    assert.ok(fs.existsSync(`app${route}/page.tsx`), route);
  }
});

test('sidebar, header and search share the one navigation map', () => {
  const sidebar = fs.readFileSync('components/desktop-hover-sidebar-v3.tsx', 'utf8');
  const shell = fs.readFileSync('components/app-shell.tsx', 'utf8');
  assert.ok(sidebar.includes('from "@/lib/navigation"'));
  assert.ok(shell.includes('from "@/lib/navigation"'));
  assert.ok(shell.includes('resolveLocation(pathname, navigation)'));
  assert.ok(shell.includes('searchDestinations(query, destinations)'));
  assert.ok(!shell.includes('href: "/commercial-intelligence",\n        keywords'));
});
