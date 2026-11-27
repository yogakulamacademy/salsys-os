import { PasswordField } from './auth-controls';
import styles from './auth-experience.module.css';

export function EmailField() {
  return <label className={styles.field}><span>Email address</span><input name="email" type="email" autoComplete="email" required maxLength={254} placeholder="you@company.com" /></label>;
}

export function LoginFields() {
  return <><EmailField /><PasswordField /></>;
}

export function SignupFields() {
  return <><div className={styles.fieldPair}><label className={styles.field}><span>Full name</span><input name="full_name" autoComplete="name" required minLength={2} maxLength={180} placeholder="Your full name" /></label><label className={styles.field}><span>Business name</span><input name="business_name" autoComplete="organization" required minLength={2} maxLength={180} placeholder="Your business" /></label></div><EmailField /><PasswordField newPassword /></>;
}

export function SignupSteps() {
  return <ol className={styles.steps} aria-label="Registration progress"><li aria-current="step"><span>1</span>Account</li><li><span>2</span>Verify email</li><li><span>3</span>Workspace</li></ol>;
}
