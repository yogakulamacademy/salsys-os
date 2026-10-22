import Link from 'next/link';
import { ArrowRight, ContactRound, Search, ShieldCheck, UsersRound } from 'lucide-react';

import styles from '@/components/crm/crm-studio.module.css';
import { getLeads } from '@/lib/data';

function prettyStage(value: string) {
  return value
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

export default async function Customer360Page() {
  const leads = await getLeads();
  const withContact = leads.filter((lead) => lead.email || lead.phone).length;
  const assigned = leads.filter((lead) => lead.owner && lead.owner !== 'Unassigned').length;
  const withCourse = leads.filter((lead) => lead.course && lead.course !== 'Not selected').length;
  const active = leads.filter((lead) => !['enrolled', 'lost', 'unqualified', 'duplicate'].includes(lead.stage)).length;

  return (
    <div>
      <header className={styles.pageHeader}>
        <div>
          <div className={styles.pageKicker}>SalsysOS / CRM Operations</div>
          <h1>Customer 360</h1>
          <p>
            Open a customer record for one evidence-backed view of identity, sales context, journey,
            conversations, follow-ups and payment evidence where available.
          </p>
        </div>
        <div className={styles.pageActions}>
          <Link href="/leads" className={styles.button}>
            <Search size={14} /> Find a lead
          </Link>
          <Link href="/data-quality" className={styles.buttonPrimary}>
            Data quality <ArrowRight size={13} />
          </Link>
        </div>
      </header>

      <section className={styles.metricGrid}>
        <Metric label="Accessible customers" value={leads.length} note="Current tenant-scoped lead records" />
        <Metric label="Active opportunities" value={active} note="Open CRM stages" />
        <Metric label="Contact coverage" value={withContact} note="Phone or email available" />
        <Metric label="Assigned ownership" value={assigned} note="Lead owner recorded" />
      </section>

      <section className={styles.panel}>
        <div className={styles.panelHead}>
          <div>
            <div className={styles.pageKicker}>Customer records</div>
            <h2>Open an evidence-backed profile</h2>
            <p>Each record opens the canonical lead detail and Person 360 evidence already available in SalsysOS.</p>
          </div>
          <span className={styles.pill}>{withCourse} with course context</span>
        </div>

        <div className={styles.tableViewport}>
          <table className={styles.dataTable}>
            <thead>
              <tr>
                <th>Customer</th>
                <th>Stage</th>
                <th>Course</th>
                <th>Owner</th>
                <th>Contact evidence</th>
                <th>Open</th>
              </tr>
            </thead>
            <tbody>
              {leads.length ? (
                leads.slice(0, 100).map((lead) => (
                  <tr key={lead.id}>
                    <td>
                      <div className={styles.leadName}>{lead.name}</div>
                      <div className={styles.micro}>{lead.leadCode} · {lead.country || 'Location unknown'}</div>
                    </td>
                    <td><span className={styles.pill}>{prettyStage(lead.stage)}</span></td>
                    <td>
                      <div className={styles.leadName}>{lead.course || 'Not selected'}</div>
                      <div className={styles.micro}>{lead.location || 'Location not recorded'}</div>
                    </td>
                    <td>{lead.owner || 'Unassigned'}</td>
                    <td>
                      {lead.email || lead.phone ? (
                        <span className={styles.pill}><ShieldCheck size={11} /> Available</span>
                      ) : (
                        <span className={styles.pillGray}>Unavailable</span>
                      )}
                    </td>
                    <td>
                      <Link href={`/leads/${lead.id}`} className={styles.button}>
                        Open <ArrowRight size={12} />
                      </Link>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={6}>
                    <div className={styles.emptyNote}>
                      <UsersRound size={18} />
                      <div>
                        <strong>No customer records are available in this workspace</strong>
                        Create or import a lead before using Customer 360.
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
              <div className={styles.pageKicker}>Identity</div>
              <h2>Evidence before assumptions</h2>
              <p>Names and channels never establish identity by themselves.</p>
            </div>
            <ContactRound size={17} />
          </div>
          <div className={styles.panelBody}>
            <div className={styles.emptyNote}>
              <ShieldCheck size={18} />
              <div>
                <strong>Canonical customer detail remains the source of truth</strong>
                Identity, journey and contact evidence are loaded per customer record with the existing tenant and field-level access controls.
              </div>
            </div>
          </div>
        </section>

        <section className={styles.panel}>
          <div className={styles.panelHead}>
            <div>
              <div className={styles.pageKicker}>Profile completeness</div>
              <h2>Coverage in the current workspace</h2>
              <p>Missing values remain visible rather than being silently inferred.</p>
            </div>
          </div>
          <div className={styles.panelBody}>
            <div className={styles.evidenceList}>
              <Evidence label="Contact evidence" value={`${withContact} / ${leads.length}`} />
              <Evidence label="Assigned owner" value={`${assigned} / ${leads.length}`} />
              <Evidence label="Course context" value={`${withCourse} / ${leads.length}`} />
              <Evidence label="Repair missing fields" value="Open Data Quality" href="/data-quality" />
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

function Evidence({ label, value, href }: { label: string; value: string; href?: string }) {
  return (
    <div className={styles.evidenceRow}>
      <span>{label}</span>
      {href ? (
        <Link href={href} className={styles.pill}>{value}</Link>
      ) : (
        <span className={styles.pill}>{value}</span>
      )}
    </div>
  );
}
