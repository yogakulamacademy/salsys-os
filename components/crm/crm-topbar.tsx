'use client';

import Link from 'next/link';
import { Bell, Plus, Search } from 'lucide-react';
import { usePathname } from 'next/navigation';

import styles from '@/components/crm/crm-studio.module.css';

const labels: Array<[string, string]> = [
  ['/crm', 'Command Center'],
  ['/admissions', 'Admissions Desk'],
  ['/follow-ups', 'Follow-ups'],
  ['/leads', 'Leads'],
  ['/pipeline', 'Sales Pipeline'],
  ['/customer-360', 'Customer 360'],
  ['/contact-intelligence', 'Contact Intelligence'],
  ['/data-quality', 'Data Quality'],
];

function currentLabel(pathname: string) {
  const match = labels.find(
    ([prefix]) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
  return match?.[1] ?? 'CRM Operations';
}

export function CrmTopbar({ profileInitials }: { profileInitials: string }) {
  const pathname = usePathname();
  const label = currentLabel(pathname);

  return (
    <header className={styles.topbar}>
      <div className={styles.breadcrumbs}>
        <span>Workspace</span>
        <span className={styles.crumbSlash}>/</span>
        <span>CRM</span>
        <span className={styles.crumbSlash}>/</span>
        <strong>{label}</strong>
      </div>

      <div className={styles.topbarActions}>
        <Link href="/leads" className={styles.searchAsk} aria-label="Search SalsysOS leads">
          <Search size={14} />
          <span>Search SalsysOS</span>
          <kbd>Ctrl K</kbd>
        </Link>
        <Link href="/leads/new" className={styles.topNew}>
          <Plus size={14} />
          New lead
        </Link>
        <Link href="/follow-ups" className={styles.iconButton} aria-label="Needs attention">
          <Bell size={16} />
        </Link>
        <span className={styles.avatar} title="CRM operator">
          {profileInitials}
        </span>
      </div>
    </header>
  );
}
