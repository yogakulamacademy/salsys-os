import { ToastOnLoad } from '@/components/app-toast';
import { feedbackNotice } from '@/lib/feedback-notices';
import { LoadErrorToast, OutcomeToast } from '@/components/use-feedback-messages';

function text(value: unknown) { return typeof value === 'string' ? value : Array.isArray(value) && typeof value[0] === 'string' ? value[0] : null; }

/** Explicit server-rendered action results, including internally rewritten clean URLs. */
export function PageFeedback({ error, notice, loadError, warning }: { error?: unknown; notice?: unknown; loadError?: unknown; warning?: unknown }) {
  const failure = text(error);
  const success = text(notice);
  const caution = text(warning);
  return <><ToastOnLoad error={failure} message={success ? feedbackNotice(success) : null} /><LoadErrorToast message={failure ? null : text(loadError)} /><OutcomeToast outcome={caution ? {tone:'warning',text:caution} : null} /></>;
}
