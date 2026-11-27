import { noticeFor } from '@/lib/inbox-notices';

export function feedbackNotice(value: string) {
  const inbox = noticeFor(value);
  if (inbox && inbox !== 'Interaction logged.') return inbox;
  if (value.includes(' ') || !/^[a-z0-9_-]+$/i.test(value)) return value;
  const sample = value.startsWith('mock-');
  const words = value.replace(/^mock-/, '').replaceAll(/[-_]/g, ' ');
  return `${sample ? 'Sample: ' : ''}${words.charAt(0).toUpperCase()}${words.slice(1)}.`;
}
