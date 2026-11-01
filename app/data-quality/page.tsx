import Link from 'next/link';
import {
  AlertTriangle,
  ArrowRight,
  DatabaseZap,
  ShieldCheck,
  UsersRound,
} from 'lucide-react';

import {
  dismissIdentityResolutionConflictAction,
  mergeIdentityResolutionConflictAction,
} from '@/app/actions/identity-resolution';
import styles from '@/components/crm/crm-studio.module.css';
import { getLeads } from '@/lib/data';
import { createClient } from '@/lib/supabase/server';
import { requireCurrentOrganizationId } from '@/lib/workspace';
import type { LeadOverview } from '@/types/crm';

type Gap = 'Ownership' | 'Contact fields' | 'Source unknown' | 'Course missing';

type IdentityConflictRow = {
  id: string;
  lead_id: string;
  person_id: string | null;
  conflict_type: string;
  candidate_person_ids: string[] | null;
  evidence: unknown;
  detected_at: string | null;
};

type DataQualityPageProps = {
  searchParams: Promise<{
    notice?: string | string[];
    error?: string | string[];
    merge?: string | string[];
  }>;
};

function gaps(lead: LeadOverview): Gap[] {
  const items: Gap[] = [];
  if (!lead.owner || lead.owner === 'Unassigned') items.push('Ownership');
  if (!lead.email && !lead.phone) items.push('Contact fields');
  if (!lead.firstTouchSource || lead.firstTouchSource === 'Unknown') items.push('Source unknown');
  if (!lead.course || lead.course === 'Not selected') items.push('Course missing');
  return items;
}

function prettyStage(value: string) {
  return value
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function gapClass(gap: Gap) {
  if (gap === 'Source unknown') return styles.pillAmber;
  if (gap === 'Contact fields') return styles.pillRed;
  return styles.pillGray;
}

export default async function DataQualityPage({ searchParams }: DataQualityPageProps) {
  const params = await searchParams;
  const notice = one(params.notice);
  const error = one(params.error);
  const mergeConflictId = one(params.merge);

  const supabase = await createClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) return null;

  const organizationId = await requireCurrentOrganizationId(supabase, user.id);

  const [leads, conflictsResult, reviewPermissionResult] = await Promise.all([
    getLeads(),
    supabase
      .from('identity_resolution_conflicts')
      .select(
        'id,lead_id,person_id,conflict_type,candidate_person_ids,evidence,detected_at',
      )
      .eq('organization_id', organizationId)
      .eq('status', 'open')
      .order('detected_at', { ascending: false })
      .limit(50),
    (supabase as any).rpc('can_administer_organization_crm', {
      p_organization_id: organizationId,
    }),
  ]);

  const canReviewIdentityConflicts =
    !reviewPermissionResult.error && reviewPermissionResult.data === true;

  const identityConflicts = conflictsResult.error
    ? []
    : ((conflictsResult.data ?? []) as IdentityConflictRow[]);
  const identityConflictLoadError = conflictsResult.error
    ? 'Identity conflict evidence is temporarily unavailable. No conflict count is inferred while the canonical read is degraded.'
    : null;

  const unassigned = leads.filter((lead) => !lead.owner || lead.owner === 'Unassigned').length;
  const missingContact = leads.filter((lead) => !lead.email && !lead.phone).length;
  const unknownSource = leads.filter(
    (lead) => !lead.firstTouchSource || lead.firstTouchSource === 'Unknown',
  ).length;
  const missingCourse = leads.filter(
    (lead) => !lead.course || lead.course === 'Not selected',
  ).length;
  const repairRows = leads.filter((lead) => gaps(lead).length > 0).slice(0, 50);
  const knownCampaigns = leads.filter(
    (lead) => lead.firstTouchCampaign && lead.firstTouchCampaign !== 'Unattributed',
  ).length;
  const leadById = new Map(leads.map((lead) => [lead.id, lead]));

  return (
    <div>
      <header className={styles.pageHeader}>
        <div>
          <div className={styles.pageKicker}>SalsysOS / CRM Operations</div>
          <h1>Data Quality Center</h1>
          <p>
            Repair missing information without inventing attribution, contact details or customer identity.
            Every correction should remain evidence-backed and reviewable.
          </p>
        </div>
        <div className={styles.pageActions}>
          <Link href="/customer-360" className={styles.button}>
            <UsersRound size={14} /> Customer 360
          </Link>
          <Link href="/leads" className={styles.buttonPrimary}>
            Review lead records <ArrowRight size={13} />
          </Link>
        </div>
      </header>

      {notice === 'identity-conflict-dismissed' ? (
        <div className={styles.emptyNote}>
          <ShieldCheck size={18} />
          <div>
            <strong>Identity conflict reviewed</strong>
            The conflict was dismissed after human review. No Person records, identifiers or lead links were merged or rewritten.
          </div>
        </div>
      ) : null}

      {notice === 'identity-conflict-merged' ? (
        <div className={styles.emptyNote}>
          <ShieldCheck size={18} />
          <div>
            <strong>Identity merge completed</strong>
            The candidate Contact was merged into the current canonical Contact after human approval. Identity, opportunity and session ownership were reconciled transactionally and the source Contact was retained as a merged audit record.
          </div>
        </div>
      ) : null}

      {error ? (
        <div className={styles.emptyNote}>
          <AlertTriangle size={18} />
          <div>
            <strong>Review action could not be completed</strong>
            {error}
          </div>
        </div>
      ) : null}

      <section className={styles.metricGrid}>
        <Metric label="Ownership" value={unassigned} note="Unassigned lead records" />
        <Metric label="Contact coverage" value={missingContact} note="No phone or email available" />
        <Metric label="Acquisition" value={unknownSource} note="Unknown first-touch source" />
        <Metric label="Profile completeness" value={missingCourse} note="Course not selected" />
        <Metric
          label="Identity review"
          value={identityConflicts.length}
          note={
            identityConflictLoadError
              ? 'Canonical conflict read unavailable'
              : 'Open conflicts awaiting human review'
          }
        />
      </section>

      <section className={styles.panel}>
        <div className={styles.panelHead}>
          <div>
            <div className={styles.pageKicker}>Repair worklist</div>
            <h2>Records requiring validation</h2>
            <p>Open the lead to verify missing fields. Unknown values remain unknown until evidence exists.</p>
          </div>
          <span className={styles.pillAmber}>{repairRows.length} visible issues</span>
        </div>

        <div className={styles.tableViewport}>
          <table className={styles.dataTable}>
            <thead>
              <tr>
                <th>Lead</th>
                <th>Stage</th>
                <th>Validation gaps</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {repairRows.length ? (
                repairRows.map((lead) => (
                  <tr key={lead.id}>
                    <td>
                      <div className={styles.leadName}>{lead.name}</div>
                      <div className={styles.micro}>{lead.leadCode}</div>
                    </td>
                    <td><span className={styles.pill}>{prettyStage(lead.stage)}</span></td>
                    <td>
                      {gaps(lead).map((gap) => (
                        <span key={gap} className={gapClass(gap)}>{gap}</span>
                      ))}
                    </td>
                    <td>
                      <Link href={`/leads/${lead.id}`} className={styles.button}>
                        Review <ArrowRight size={12} />
                      </Link>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={4}>
                    <div className={styles.emptyNote}>
                      <ShieldCheck size={18} />
                      <div>
                        <strong>No validation gaps in the loaded CRM snapshot</strong>
                        The current accessible lead records have ownership, contact coverage, source and course values.
                      </div>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className={styles.panel}>
        <div className={styles.panelHead}>
          <div>
            <div className={styles.pageKicker}>Identity conflict review</div>
            <h2>Canonical identity decisions requiring a person</h2>
            <p>
              Exact identifier conflicts are surfaced here rather than silently merging Contacts. Compare both Contact records before deciding whether the evidence represents one person or two distinct people.
            </p>
          </div>
          <span className={identityConflictLoadError ? styles.pillRed : styles.pillAmber}>
            {identityConflictLoadError ? 'Unavailable' : `${identityConflicts.length} open`}
          </span>
        </div>

        {identityConflictLoadError ? (
          <div className={styles.panelBody}>
            <div className={styles.emptyNote}>
              <AlertTriangle size={18} />
              <div>
                <strong>Identity evidence is temporarily unavailable</strong>
                {identityConflictLoadError}
              </div>
            </div>
          </div>
        ) : identityConflicts.length ? (
          <div className={styles.tableViewport}>
            <table className={styles.dataTable}>
              <thead>
                <tr>
                  <th>Lead</th>
                  <th>Conflict</th>
                  <th>Evidence</th>
                  <th>Candidate</th>
                  <th>Detected</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {identityConflicts.map((conflict) => {
                  const lead = leadById.get(conflict.lead_id);
                  const evidence = asRecord(conflict.evidence);
                  const identifierType = pretty(
                    stringValue(evidence?.identifier_type) || 'identifier',
                  );
                  const sourceSystem = pretty(
                    stringValue(evidence?.source_system) || 'identity engine',
                  );
                  const candidateIds = Array.isArray(conflict.candidate_person_ids)
                    ? conflict.candidate_person_ids.filter(Boolean)
                    : [];
                  const firstCandidateId = candidateIds[0] ?? null;
                  const mergeEligible = Boolean(
                    conflict.person_id
                    && firstCandidateId
                    && candidateIds.length === 1
                    && firstCandidateId !== conflict.person_id,
                  );
                  const mergeConfirmationOpen = mergeConflictId === conflict.id;

                  return (
                    <tr key={conflict.id}>
                      <td>
                        <div className={styles.leadName}>{lead?.name || 'Accessible lead'}</div>
                        <div className={styles.micro}>{lead?.leadCode || conflict.lead_id}</div>
                      </td>
                      <td>
                        <span className={styles.pillAmber}>{pretty(conflict.conflict_type)}</span>
                      </td>
                      <td>
                        <div>{identifierType}</div>
                        <div className={styles.micro}>Source · {sourceSystem}</div>
                      </td>
                      <td>
                        <div>{candidateIds.length} candidate contact{candidateIds.length === 1 ? '' : 's'}</div>
                        <div className={styles.micro}>Exact value is intentionally not shown in this queue.</div>
                      </td>
                      <td>{formatDateTime(conflict.detected_at)}</td>
                      <td>
                        <div className={styles.pageActions}>
                          <Link href={`/leads/${conflict.lead_id}`} className={styles.button}>
                            Lead <ArrowRight size={12} />
                          </Link>
                          {conflict.person_id ? (
                            <Link
                              href={`/customer-360/${conflict.person_id}?opportunity=${conflict.lead_id}`}
                              className={styles.button}
                            >
                              Current contact
                            </Link>
                          ) : null}
                          {firstCandidateId ? (
                            <Link href={`/customer-360/${firstCandidateId}`} className={styles.button}>
                              Candidate
                            </Link>
                          ) : null}
                          {canReviewIdentityConflicts ? (
                            <>
                              <form action={dismissIdentityResolutionConflictAction}>
                                <input type="hidden" name="conflict_id" value={conflict.id} />
                                <button type="submit" className={styles.button}>
                                  Dismiss as distinct
                                </button>
                              </form>

                              {mergeEligible ? (
                                mergeConfirmationOpen ? (
                                  <>
                                    <form action={mergeIdentityResolutionConflictAction}>
                                      <input type="hidden" name="conflict_id" value={conflict.id} />
                                      <button type="submit" className={styles.buttonPrimary}>
                                        Confirm same person & merge
                                      </button>
                                    </form>
                                    <Link href="/data-quality" className={styles.button}>
                                      Cancel merge
                                    </Link>
                                  </>
                                ) : (
                                  <Link
                                    href={`/data-quality?merge=${encodeURIComponent(conflict.id)}`}
                                    className={styles.button}
                                  >
                                    Same person
                                  </Link>
                                )
                              ) : candidateIds.length > 1 ? (
                                <span className={styles.pillGray}>Multi-candidate review only</span>
                              ) : null}
                            </>
                          ) : (
                            <span className={styles.pillGray}>Manager review required</span>
                          )}
                        </div>
                        {mergeConfirmationOpen && mergeEligible ? (
                          <div className={styles.micro}>
                            Confirm only after comparing both Contact records. The database will still block the merge if active privacy, legal or ad-delivery state makes the operation unsafe.
                          </div>
                        ) : null}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className={styles.panelBody}>
            <div className={styles.emptyNote}>
              <ShieldCheck size={18} />
              <div>
                <strong>No open identity conflicts</strong>
                The canonical identity graph has no conflicts waiting for human review.
              </div>
            </div>
          </div>
        )}

        <div className={styles.panelBody}>
          <div className={styles.emptyNote}>
            <AlertTriangle size={18} />
            <div>
              <strong>No automatic merge from this workspace</strong>
              One-candidate conflicts can be merged only through an explicit two-step manager/admin confirmation after comparing both Contact records. Multi-candidate conflicts remain review-only, and the database fails closed around active privacy, legal and ad-activation dependencies.
            </div>
          </div>
        </div>
      </section>

      <div className={styles.splitGrid}>
        <section className={styles.panel}>
          <div className={styles.panelHead}>
            <div>
              <div className={styles.pageKicker}>Identity integrity</div>
              <h2>Duplicate-review safeguards</h2>
              <p>Similarity is a review signal, never proof that two records belong to the same person.</p>
            </div>
            <DatabaseZap size={17} />
          </div>
          <div className={styles.panelBody}>
            <div className={styles.emptyNote}>
              <ShieldCheck size={18} />
              <div>
                <strong>Primary-contact uniqueness is enforced at the database boundary</strong>
                Each lead can have at most one primary contact per contact type. Ingestion paths cannot create duplicate primary email, phone or messaging identities.
              </div>
            </div>
          </div>
        </section>

        <section className={styles.panel}>
          <div className={styles.panelHead}>
            <div>
              <div className={styles.pageKicker}>Attribution readiness</div>
              <h2>Evidence requirements</h2>
              <p>Source, campaign and conversion credit remain separate evidence layers.</p>
            </div>
          </div>
          <div className={styles.panelBody}>
            <div className={styles.evidenceList}>
              <Evidence label="CRM source label" value={`${leads.length - unknownSource} / ${leads.length} known`} />
              <Evidence label="Exact first-touch campaign" value={`${knownCampaigns} / ${leads.length} known`} />
              <Evidence label="Linked click / session lineage" value="Review tracking evidence" muted />
              <Evidence label="Consent & lawful join state" value="Not inferred here" muted />
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}

function Metric({ label, value, note }: { label: string; value: number; note: string }) {
  return (
    <div className={styles.metricCard}>
      <small>{label}</small>
      <div className={styles.metricValue}>{value.toLocaleString('en-IN')}</div>
      <p>{note}</p>
    </div>
  );
}

function Evidence({
  label,
  value,
  muted = false,
}: {
  label: string;
  value: string;
  muted?: boolean;
}) {
  return (
    <div className={styles.evidenceRow}>
      <span>{label}</span>
      <span className={muted ? styles.pillGray : styles.pill}>{value}</span>
    </div>
  );
}

function one(value: string | string[] | undefined) {
  if (Array.isArray(value)) return value[0] ?? '';
  return value ?? '';
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function stringValue(value: unknown) {
  return value == null ? '' : String(value).trim();
}

function pretty(value: string) {
  return value
    .replace(/[_-]+/g, ' ')
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

function formatDateTime(value: string | null) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}
