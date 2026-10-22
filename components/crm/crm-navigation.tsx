'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Activity,
  AlertTriangle,
  ChevronDown,
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

function initials(value: string) {
  const result = value
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toUpperCase();
  return result || 'SO';
}

function NavigationLinks() {
  const pathname = usePathname();

  return (
    <nav className={styles.navScroll} aria-label="CRM Operations navigation">
      {groups.map((group) => (
        <div key={group.label}>
          <div className={styles.navGroup}>{group.label}</div>
          {group.items.map(({ href, label, icon: Icon }) => {
            const active = isActive(pathname, href);
            return (
              <Link
                key={`${group.label}-${href}-${label}`}
                href={href}
                aria-current={active ? 'page' : undefined}
                className={`${styles.navItem} ${active ? styles.navItemActive : ''}`}
              >
                <Icon size={16} />
                <span>{label}</span>
              </Link>
            );
          })}
        </div>
      ))}
    </nav>
  );
}

export function CrmNavigation({
  workspaceName,
  profileName,
  profileRole,
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
      <aside className={styles.sidebar} aria-label="CRM Operations navigation">
        <Link href="/crm" className={styles.brand} aria-label="SalsysOS CRM home">
          <span className={styles.brandMark}>
            <Activity size={19} />
          </span>
          <span className={styles.brandWord}>
            Salsys<span>OS</span><sup>®</sup>
          </span>
        </Link>

        <div className={styles.workspaceCard}>
          <span className={styles.workspaceIcon}>{initials(workspaceName)}</span>
          <div>
            <strong>{workspaceName}</strong>
            <small>CRM Operations</small>
          </div>
          <ChevronDown size={13} />
        </div>

        <NavigationLinks />

        <div className={styles.sidebarFoot}>
          <Link href="/settings" className={styles.sidebarUtility}>
            CRM workspace settings
          </Link>
          <div className={styles.profile}>
            <span className={`${styles.workspaceIcon} ${styles.profileIcon}`}>
              {initials(profileName)}
            </span>
            <div>
              <strong>{profileName}</strong>
              <small>{profileRole}</small>
            </div>
            <span className={styles.onlineDot} title="Online" />
          </div>
        </div>
      </aside>

      <details className={styles.mobileNavigation}>
        <summary>
          <Link href="/crm" className={styles.mobileBrand} onClick={(event) => event.stopPropagation()}>
            <span className={styles.brandMark}>
              <Activity size={17} />
            </span>
            <span className={styles.brandWord}>
              Salsys<span>OS</span><sup>®</sup>
            </span>
          </Link>
          <span className={styles.mobileMenuButton}>
            <Menu size={16} />
            {current?.label || 'Menu'}
          </span>
        </summary>
        <div className={styles.mobileNavigationPanel}>
          <div className={styles.workspaceCard}>
            <span className={styles.workspaceIcon}>{initials(workspaceName)}</span>
            <div>
              <strong>{workspaceName}</strong>
              <small>CRM Operations</small>
            </div>
          </div>
          <NavigationLinks />
        </div>
      </details>
    </>
  );
}
