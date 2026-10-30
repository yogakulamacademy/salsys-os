import type { Metadata } from 'next';
import './globals.css';
import './design-system.css';
import './legacy-visual-aliases.css';
import './analytics-visual-system.css';
import './premium-polish.css';
import './crm-visual-system.css';
import './design-audit-polish.css';
import './motion-system.css';
import './motion-system-v3.css';
import './motion-system-v4.css';
import './motion-system-v5.css';
import './motion-system-v6.css';
import './motion-system-v7.css';
import './interaction-feedback-v8.css';
import './salsys-violet-theme.css';
import './sales-today.css';
import './leads-workspace.css';
import './inbox-workspace.css';
import './lead-detail-overflow-fix.css';
import './release-readiness-polish.css';
import './uiux-release-qa.css';
import './lead-inspector-uiux-qa.css';
import './marketing-inspector-uiux-qa.css';
import { InteractionFeedbackBridge } from '@/components/interaction-feedback-bridge';
import { MotionRouteSurface } from '@/components/motion-route-surface';
import { RootShell } from '@/components/root-shell';

export const metadata: Metadata = {
  metadataBase: new URL('https://salsysos.com'),
  title: {
    default: 'SalsysOS — Sales + Analysis Operating System',
    template: '%s | SalsysOS',
  },
  description:
    'SalsysOS connects sales, customer conversations, marketing, attribution, organic growth, experiments, and revenue intelligence in one operating system.',
};

const themeBootScript = `
(function () {
  try {
    var saved = localStorage.getItem('yk-theme') || 'light';
    var dark = saved === 'dark' || (!saved && window.matchMedia('(prefers-color-scheme: dark)').matches);
    document.documentElement.classList.toggle('dark', dark);
    document.documentElement.style.colorScheme = dark ? 'dark' : 'light';
  } catch (e) {}
})();`;

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeBootScript }} />
      </head>
      <body>
        <InteractionFeedbackBridge />
        <MotionRouteSurface>
          <RootShell>{children}</RootShell>
        </MotionRouteSurface>
      </body>
    </html>
  );
}
