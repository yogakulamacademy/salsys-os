'use client';

import { useId, useState } from 'react';
import { useFormStatus } from 'react-dom';
import { Eye, EyeOff, LoaderCircle } from 'lucide-react';
import styles from './auth-experience.module.css';

export function PasswordField({ newPassword = false }: { newPassword?: boolean }) {
  const [visible, setVisible] = useState(false);
  const id = useId();
  return (
    <div className={styles.field}>
      <div className={styles.labelRow}><label htmlFor={id}>Password</label>{!newPassword && <a href="/forgot-password">Forgot password?</a>}</div>
      <div className={styles.passwordWrap}>
        <input id={id} name="password" type={visible ? 'text' : 'password'} autoComplete={newPassword ? 'new-password' : 'current-password'} required minLength={newPassword ? 12 : undefined} maxLength={newPassword ? 128 : undefined} placeholder={newPassword ? 'Create a password' : 'Enter your password'} aria-describedby={newPassword ? `${id}-hint` : undefined} />
        <button className={styles.reveal} type="button" onClick={() => setVisible(!visible)} aria-label={visible ? 'Hide password' : 'Show password'} aria-pressed={visible}>{visible ? <EyeOff size={18} /> : <Eye size={18} />}</button>
      </div>
      {newPassword && <p className={styles.hint} id={`${id}-hint`}>Use at least 12 characters.</p>}
    </div>
  );
}

export function SubmitButton({ children, pendingText }: { children: React.ReactNode; pendingText: string }) {
  const { pending } = useFormStatus();
  return <button className={styles.submit} type="submit" disabled={pending} aria-busy={pending}>{pending && <LoaderCircle className={styles.spinner} size={18} />}<span aria-live="polite">{pending ? pendingText : children}</span></button>;
}
