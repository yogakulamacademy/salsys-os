'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Activity,
  AlertTriangle,
  CircleDollarSign,
  ContactRound,
  DatabaseZap,
  LayoutDashboard,
  ListTodo,
  Menu,
  Rows3,
  UserRoundSearch,
  UsersRound,
} from 'lucide-react';

import styles from '@/components/crm/crm-studio.module.css';

type Item = {
  href: string;
  label: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
};

type Group = {
  label: string;
  items: Item[];
};

const groups: Group[] = [
  {
    label: 'Workspace',
    items: [
      { href: '/crm', label: 'Command Center', icon: LayoutDashboard },
      { href: '/admissions', label: 'Admissions Desk', icon: Activity },
      { href: '/follow-ups', label: 'Follow-ups', icon: ListTodo },
    ],
  },
  {
    label: 'Customers & Sales',
    items: [
      { href: '/leads', label: 'Leads', icon: UserRoundSearch },
      { href: '/pipeline', label: 'Sales Pipeline', icon: Rows3 },
      { href: '/customer-360', label: 'Customer 360', icon: UsersRound },
    ],
  },
  {
    label: 'Intelligence',
    items: [
      { href: '/contact-intelligence', label: 'Contact Intelligence', icon: ContactRound },
      { href: '/data-quality', label: 'Data Quality', icon: DatabaseZap },
    ],
  },
  {
    label: 'Quick Views',
    items: [
      {
        href: '/leads?stage=payment_pending',
        label: 'Payment-stage leads',
        icon: CircleDollarSign,
      },
      {
        href: '/leads?view=attention',
        label: 'Stage-aging alerts',
        icon: AlertTriangle,
      },
    ],
  },
];

function pathOnly(href: string) {
  return href.split('?')[0];
}

function isActive(pathname: string, href: string) {
  if (href.includes('?')) return false;
  const path = pathOnly(href);
  if (path === '/leads') {
    return pathname === '/leads' || pathname.startsWith('/leads/');
  }
  return pathname === path || pathname.startsWith(`${path}/`);
}

function NavigationLinks() {
  const pathname = usePathname();

  return (
    <nav
      className={styles.navScroll}
      aria-label="CRM Operations navigation"
      style={{ padding: '4px 16px 28px', overflowY: 'auto' }}
    >
      {groups.map((group, groupIndex) => (
        <div key={group.label} style={{ marginTop: groupIndex === 0 ? 0 : 24 }}>
          <div
            style={{
              padding: '0 12px 8px',
              color: '#8a9990',
              fontSize: 9,
              fontWeight: 800,
              letterSpacing: '0.16em',
              textTransform: 'uppercase',
            }}
          >
            {group.label}
          </div>

          <div style={{ display: 'grid', gap: 3 }}>
            {group.items.map(({ href, label, icon: Icon }) => {
              const active = isActive(pathname, href);
              return (
                <Link
                  key={`${group.label}-${href}-${label}`}
                  href={href}
                  aria-current={active ? 'page' : undefined}
                  style={{
                    position: 'relative',
                    display: 'flex',
                    minHeight: 40,
                    alignItems: 'center',
                    gap: 11,
                    padding: '9px 12px',
                    borderRadius: 9,
                    background: active ? '#e7f1e9' : 'transparent',
                    color: active ? '#2f6a55' : '#718078',
                    fontSize: 12,
                    fontWeight: active ? 650 : 550,
                    textDecoration: 'none',
                  }}
                >
                  {active ? (
                    <span
                      aria-hidden="true"
                      style={{
                        position: 'absolute',
                        left: -16,
                        top: 9,
                        bottom: 9,
                        width: 3,
                        borderRadius: '0 3px 3px 0',
                        background: '#2f765d',
                      }}
                    />
                  ) : null}
                  <Icon size={16} className={active ? 'text-[#3a7d63]' : 'text-[#9aa8a0]'} />
                  <span>{label}</span>
                </Link>
              );
            })}
          </div>
        </div>
      ))}
    </nav>
  );
}

export function CrmNavigation({
  workspaceName,
}: {
  workspaceName: string;
  profileName: string;
  profileRole: string;
}) {
  const pathname = usePathname();
  const current = groups
    .flatMap((group) => group.items)
    .find((item) => isActive(pathname, item.href));

  return (
    <>
      <aside
        className={styles.sidebar}
        aria-label="CRM Operations navigation"
        style={{
          background: '#f4f6f5',
          borderRight: '1px solid #dfe5e1',
          boxShadow: 'none',
        }}
      >
        <div style={{ padding: '20px 22px 18px' }}>
          <Link
            href="/crm"
            aria-label="CRM command center"
            style={{ color: '#243d34', textDecoration: 'none' }}
          >
            <div style={{ fontSize: 15, fontWeight: 760, letterSpacing: '-0.015em' }}>CRM</div>
          </Link>
          <p
            style={{
              margin: '8px 0 0',
              maxWidth: 184,
              color: '#7b8881',
              fontSize: 10,
              lineHeight: 1.7,
            }}
          >
            Manage leads, admissions, pipeline and customer intelligence.
          </p>
          <div
            style={{
              marginTop: 12,
              color: '#9aa69f',
              fontSize: 9,
              fontWeight: 700,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
            title={workspaceName}
          >
            {workspaceName}
          </div>
        </div>

        <NavigationLinks />
      </aside>

      <details className={styles.mobileNavigation}>
        <summary>
          <Link
            href="/crm"
            className={styles.mobileBrand}
            onClick={(event) => event.stopPropagation()}
            style={{ color: '#243d34', textDecoration: 'none', fontSize: 15, fontWeight: 760 }}
          >
            CRM
          </Link>
          <span className={styles.mobileMenuButton}>
            <Menu size={16} />
            {current?.label || 'Menu'}
          </span>
        </summary>
        <div className={styles.mobileNavigationPanel} style={{ background: '#f4f6f5' }}>
          <div style={{ padding: '14px 22px 8px' }}>
            <div style={{ color: '#243d34', fontSize: 14, fontWeight: 760 }}>CRM</div>
            <p style={{ margin: '5px 0 0', color: '#7b8881', fontSize: 10, lineHeight: 1.6 }}>
              Leads, admissions and customer intelligence.
            </p>
          </div>
          <NavigationLinks />
        </div>
      </details>
    </>
  );
}
