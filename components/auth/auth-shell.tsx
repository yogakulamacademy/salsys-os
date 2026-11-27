import type { ReactNode } from 'react';
import { MessageSquare, MousePointer2, Sparkles, WalletCards } from 'lucide-react';
import styles from './auth-experience.module.css';

export { default as authStyles } from './auth-experience.module.css';

export function AuthShell({ kind, children }: { kind: 'login' | 'signup'; children: ReactNode }) {
  const signup = kind === 'signup';
  return (
    <main className={styles.shell}>
      <a className={styles.skipLink} href="#account-form">Skip to account form</a>
      <aside className={styles.story} aria-label="About SalsysOS">
        <a className={styles.brand} href="https://salsysos.com" aria-label="SalsysOS home">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/salsysos-brand.png" width="42" height="42" alt="" />
          <span>SalsysOS<small>Sales + Analysis Operating System</small></span>
        </a>
        <div className={styles.storyContent}>
          <p className={styles.eyebrow}>FROM DISCOVERY TO REVENUE</p>
          <h2>{signup ? 'Bring your business' : 'Your next move.'}<br /><span>{signup ? 'into focus.' : 'A clearer view.'}</span></h2>
          <p className={styles.storyCopy}>Connect the first conversation to the bigger picture.</p>
          <div className={styles.visual}>
            <div className={styles.visualHeader}><span className={styles.visualIcon}><Sparkles size={17} /></span><div><strong>One connected view</strong><small>Every stage. A shared picture.</small></div><span className={styles.conceptLabel}>PRODUCT CONCEPT</span></div>
            <div className={styles.visualFlow}>
              <div><span><MousePointer2 size={22} /></span><strong>Discovery</strong><small>Understand intent</small></div><i aria-hidden="true" />
              <div><span><MessageSquare size={22} /></span><strong>Conversation</strong><small>Build the connection</small></div><i aria-hidden="true" />
              <div><span><WalletCards size={22} /></span><strong>Revenue</strong><small>See the outcome</small></div>
            </div>
            <div className={styles.visualFooter}><Sparkles size={14} /><span>Clarity at every step</span><span aria-hidden="true">✦</span></div>
          </div>
          <p className={styles.storyFootnote}>Less switching. More perspective.</p>
        </div>
        <p className={styles.storyBottom}>A clearer way to move your business forward.</p>
      </aside>
      <section className={styles.formSide} aria-label={signup ? 'Account registration' : 'Account sign in'}>
        <a className={styles.backLink} href="https://salsysos.com">Back to website</a>
        <div className={styles.formContent} id="account-form" tabIndex={-1}>{children}</div>
        <footer className={styles.footer}><span>© {new Date().getFullYear()} SalsysOS</span><nav aria-label="Legal"><a href="https://salsysos.com/privacy">Privacy</a><a href="https://salsysos.com/terms">Terms</a></nav></footer>
      </section>
    </main>
  );
}

export function AuthMessage({ children, error = false }: { children: ReactNode; error?: boolean }) {
  return <p className={`${styles.message} ${error ? styles.error : styles.notice}`} role={error ? 'alert' : 'status'}>{children}</p>;
}
