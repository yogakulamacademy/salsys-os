import type { Metadata } from 'next';
import { Suspense } from 'react';
import './globals.css';
import { RootShell } from '@/components/root-shell';
import { InvestigationContextBar } from '@/components/investigation-context-bar';

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
        <RootShell>
          <Suspense fallback={null}>
            <InvestigationContextBar />
          </Suspense>
          {children}
        </RootShell>
      </body>
    </html>
  );
}
