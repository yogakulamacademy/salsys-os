import Link from 'next/link';
import { AlertTriangle, ArrowRight, DatabaseZap, ShieldCheck, UsersRound } from 'lucide-react';

import styles from '@/components/crm/crm-studio.module.css';
import { getLeads } from '@/lib/data';
import type { LeadOverview } from '@/types/crm';

type Gap = 'Ownership' | 'Contact fields' | 'Source unknown' | 'Course missing';

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

export default async function DataQualityPage() {
  const leads = await getLeads();

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

      <section className={styles.metricGrid}>
        <Metric label="Ownership" value={unassigned} note="Unassigned lead records" />
        <Metric label="Contact coverage" value={missingContact} note="No phone or email available" />
        <Metric label="Acquisition" value={unknownSource} note="Unknown first-touch source" />
        <Metric label="Profile completeness" value={missingCourse} note="Course not selected" />
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
              <AlertTriangle size={18} />
              <div>
                <strong>No automatic merge from this workspace</strong>
                Duplicate decisions require verified identifiers and human review. Generic names, channels or similar course interests are not sufficient evidence for a merge.
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
