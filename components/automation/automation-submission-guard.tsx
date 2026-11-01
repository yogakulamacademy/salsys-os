'use client';

import { useEffect } from 'react';

const GUARDED_SUBMIT_LABEL = /\b(save draft|save trigger|create workflow|create automation|create trigger)\b/i;

export function AutomationSubmissionGuard() {
  useEffect(() => {
    function handleSubmit(event: SubmitEvent) {
      const form = event.target;
      if (!(form instanceof HTMLFormElement)) return;

      const submitter = event.submitter;
      if (!(submitter instanceof HTMLButtonElement)) return;

      const label = (submitter.textContent || '').trim();
      if (!GUARDED_SUBMIT_LABEL.test(label)) return;

      // The submit event fires only after native validation passes. Disable the
      // initiating control immediately so a second click cannot create another
      // draft while the first server action is in flight. A navigation/re-render
      // restores the control naturally.
      submitter.disabled = true;
      submitter.setAttribute('aria-busy', 'true');
      submitter.dataset.submissionGuard = 'active';
    }

    document.addEventListener('submit', handleSubmit, true);
    return () => document.removeEventListener('submit', handleSubmit, true);
  }, []);

  return null;
}
