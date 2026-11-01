'use client';

import { useEffect } from 'react';

const GUARDED_SUBMIT_LABEL = /\b(save draft|save trigger|create workflow|create automation|create trigger)\b/i;
const GUARDED_FORM_ATTR = 'data-automation-submit-guard';

function submitLabel(form: HTMLFormElement, submitter: HTMLElement | null) {
  const direct = (submitter?.textContent || '').trim();
  if (direct) return direct;

  const candidate = Array.from(
    form.querySelectorAll<HTMLButtonElement | HTMLInputElement>('button[type="submit"], input[type="submit"]'),
  ).find((control) => {
    const label = control instanceof HTMLInputElement ? control.value : control.textContent || '';
    return GUARDED_SUBMIT_LABEL.test(label.trim());
  });

  return candidate instanceof HTMLInputElement
    ? candidate.value.trim()
    : (candidate?.textContent || '').trim();
}

export function AutomationSubmissionGuard() {
  useEffect(() => {
    function handleSubmit(event: SubmitEvent) {
      const form = event.target;
      if (!(form instanceof HTMLFormElement)) return;

      const submitter = event.submitter instanceof HTMLElement ? event.submitter : null;
      const label = submitLabel(form, submitter);
      if (!GUARDED_SUBMIT_LABEL.test(label)) return;

      if (form.getAttribute(GUARDED_FORM_ATTR) === 'active') {
        event.preventDefault();
        event.stopImmediatePropagation();
        return;
      }

      // The submit event fires after native validation succeeds. Lock the whole
      // create form immediately so repeated clicks, Enter-key submits, or other
      // duplicate submit events cannot create a second draft while the first
      // server action is in flight. Navigation/re-render naturally clears it.
      form.setAttribute(GUARDED_FORM_ATTR, 'active');
      form.setAttribute('aria-busy', 'true');

      form
        .querySelectorAll<HTMLButtonElement | HTMLInputElement>('button[type="submit"], input[type="submit"]')
        .forEach((control) => {
          const controlLabel = control instanceof HTMLInputElement ? control.value : control.textContent || '';
          if (GUARDED_SUBMIT_LABEL.test(controlLabel.trim())) {
            control.disabled = true;
            control.setAttribute('aria-busy', 'true');
          }
        });
    }

    document.addEventListener('submit', handleSubmit, true);
    return () => document.removeEventListener('submit', handleSubmit, true);
  }, []);

  return null;
}
