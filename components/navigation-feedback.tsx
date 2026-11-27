'use client';
import { useSearchParams } from 'next/navigation';
import { ToastOnLoad } from '@/components/app-toast';
import { feedbackNotice } from '@/lib/feedback-notices';

/** Next server-action redirects can retain their original canonical URL after an internal fetch. */
export function NavigationFeedback() {
  const params = useSearchParams();
  const error = params.get('error_description') || params.get('error_message') || params.get('error');
  const notice = params.get('notice');
  return <ToastOnLoad error={error} message={notice ? feedbackNotice(notice) : null} />;
}
