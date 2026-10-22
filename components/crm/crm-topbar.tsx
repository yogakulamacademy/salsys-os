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
    <header
      className={styles.topbar}
      style={{
        height: 64,
        padding: '0 28px',
        borderBottom: '1px solid #e3e8e5',
        background: 'rgba(250,251,250,.96)',
        boxShadow: 'none',
      }}
    >
      <div style={{ minWidth: 0 }}>
        <div
          style={{
            color: '#91a097',
            fontSize: 9,
            fontWeight: 800,
            letterSpacing: '0.16em',
            textTransform: 'uppercase',
          }}
        >
          CRM Studio
        </div>
        <div
          style={{
            marginTop: 3,
            color: '#2b4138',
            fontSize: 12,
            fontWeight: 650,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {label}
        </div>
      </div>

      <div className={styles.topbarActions} style={{ gap: 8 }}>
        <Link
          href="/leads"
          aria-label="Search SalsysOS leads"
          style={{
            display: 'flex',
            minWidth: 210,
            minHeight: 34,
            alignItems: 'center',
            gap: 9,
            padding: '7px 10px',
            border: '1px solid #e1e7e3',
            borderRadius: 8,
            background: '#f4f6f5',
            color: '#87958d',
            fontSize: 11,
            textDecoration: 'none',
          }}
        >
          <Search size={14} />
          <span>Search CRM</span>
          <kbd
            style={{
              marginLeft: 'auto',
              padding: '1px 5px',
              border: '1px solid #dfe6e1',
              borderRadius: 4,
              background: '#fff',
              color: '#9aa59f',
              fontFamily: 'inherit',
              fontSize: 9,
            }}
          >
            Ctrl K
          </kbd>
        </Link>

        <Link
          href="/leads/new"
          style={{
            display: 'inline-flex',
            minHeight: 34,
            alignItems: 'center',
            gap: 6,
            padding: '8px 11px',
            border: '1px solid #d9e3dc',
            borderRadius: 8,
            background: '#eef4ef',
            color: '#37664f',
            fontSize: 11,
            fontWeight: 650,
            textDecoration: 'none',
          }}
        >
          <Plus size={14} />
          New lead
        </Link>

        <Link
          href="/follow-ups"
          aria-label="Needs attention"
          style={{
            display: 'grid',
            width: 34,
            height: 34,
            placeItems: 'center',
            border: '1px solid #e1e7e3',
            borderRadius: 8,
            background: '#fff',
            color: '#78877f',
            textDecoration: 'none',
          }}
        >
          <Bell size={15} />
        </Link>

        <span
          title="CRM operator"
          style={{
            display: 'grid',
            width: 31,
            height: 31,
            placeItems: 'center',
            borderRadius: 8,
            background: '#e9efeb',
            color: '#557064',
            fontSize: 10,
            fontWeight: 700,
          }}
        >
          {profileInitials}
        </span>
      </div>
    </header>
  );
}
