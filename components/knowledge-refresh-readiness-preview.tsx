import { ShieldAlert } from 'lucide-react';
import { assessWebsiteRefreshPreflight } from '@/lib/knowledge-extraction/website-refresh-preflight';

/**
 * Synthetic and read-only. This must remain beneath the existing
 * requireAdminWorkspaceAccess() page authorization.
 */
const ORG = '00000000-0000-4000-8000-000000000001';
const AT = '2026-11-06T12:00:00.000Z';
const sample = assessWebsiteRefreshPreflight({
  activeOrganizationId: ORG,
  evidenceOrganizationId: ORG,
  sourceUrl: 'https://sample.example.com/services',
  verifiedHostname: 'sample.example.com',
  evidenceLifecycleState: 'blocked',
  consent: null,
  limits: {
    organizationId: ORG,
    status: 'approved', version: 'illustrative-policy-v1',
    pagesPerRun: 10, pagesPerDay: 40,
    minimumIntervalMinutes: 120, concurrentRuns: 1,
    respectRobotsTxt: true,
    redirects: 'forbidden', crossOriginRequests: 'forbidden',
  },
  operations: {
    globalEmergencyStop: true, organizationPaused: false,
    ownershipRevoked: false, consentWithdrawalObserved: false,
    robotsDecision: 'unknown',
    pagesUsedToday: 0, runningJobs: 0, lastRunFinishedAt: null,
  },
}, AT);

export function KnowledgeRefreshReadinessPreview() {
  return (
    <section aria-label="Website refresh safety preview"
      className="mx-auto mb-8 max-w-6xl rounded-xl border border-slate-200 bg-white p-5 text-slate-800 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">KB-04B · Preview</p>
          <h2 className="mt-2 text-lg font-semibold">Website refresh safeguards</h2>
          <p className="mt-1 max-w-2xl text-xs leading-5 text-slate-600">
            A simulated preflight for future website change monitoring. The checks
            below are sample data, not verification of a customer's website.
          </p>
        </div>
        <span className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-900">
          Refresh blocked
        </span>
      </div>
      <div className="mt-5 flex items-start gap-3 rounded-lg bg-slate-50 p-4">
        <ShieldAlert size={18} aria-hidden="true" className="mt-0.5 shrink-0 text-slate-600"/>
        <div>
          <p className="text-sm font-semibold">No automated crawling is authorized</p>
          <p className="mt-1 text-xs leading-5 text-slate-600">
            {sample.satisfied} of {sample.total} illustrative checks satisfied.
            Consent is missing, the global emergency stop is on, and robots
            permission has not been established. Scheduling, fetching, storing
            and knowledge publishing remain disabled even when all checks pass.
          </p>
        </div>
      </div>
      <details className="mt-4 rounded-lg border border-slate-200 p-3">
        <summary className="cursor-pointer text-xs font-semibold">
          Inspect {sample.total} refresh safety requirements
        </summary>
        <ul className="mt-3 divide-y divide-slate-100">
          {sample.gates.map(gate=>(
            <li className="flex flex-wrap items-start justify-between gap-3 py-2 text-xs"
              key={gate.id}>
              <p className="max-w-xl leading-5 text-slate-600">{gate.reason}</p>
              <span className={gate.status==='satisfied'
                ? 'font-semibold text-emerald-700'
                : 'font-semibold text-amber-800'}>
                {gate.status==='satisfied'?'Synthetic check passed':'Blocked'}
              </span>
            </li>
          ))}
        </ul>
      </details>
      <p className="mt-4 text-xs leading-5 text-slate-600">
        Future execution must independently re-check domain ownership, tenant
        consent, robots permission, rate limits, retention and emergency stops
        immediately before a network request. No schedule or storage endpoint
        is connected to this preview.
      </p>
    </section>
  );
}
