'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

import { sendInstagramMessageAction } from '@/app/conversations/instagram-actions';
import { markCopilotAssistedMessageAction } from '@/app/conversations/copilot-audit-actions';

type InstagramSendResult = {
  ok: true;
  message: {
    id: string | null;
    body: string;
    channel: 'instagram';
    externalMessageId: string | null;
  };
};

type CopilotDraftEvent = CustomEvent<{
  channel?: string;
  body?: string;
}>;

function findManualInteractionForm(): HTMLFormElement | null {
  const forms = Array.from(document.querySelectorAll<HTMLFormElement>('form'));

  return (
    forms.find((form) => {
      const direction = form.querySelector<HTMLSelectElement>(
        'select[name="direction"]',
      );
      const channel = form.querySelector<HTMLSelectElement>(
        'select[name="channel"]',
      );
      const body = form.querySelector<HTMLElement>('[name="body"]');
      const submit = form.querySelector<HTMLButtonElement>('button[type="submit"]');

      return Boolean(direction && channel && body && submit);
    }) ?? null
  );
}

function selectedLeadId() {
  const fromQuery = new URLSearchParams(window.location.search)
    .get('lead')
    ?.trim();

  if (fromQuery) {
    return fromQuery;
  }

  const profileLink = Array.from(
    document.querySelectorAll<HTMLAnchorElement>('a[href^="/leads/"]'),
  ).find((link) => link.textContent?.trim() === 'Lead profile');

  if (!profileLink) {
    return '';
  }

  try {
    const url = new URL(profileLink.href, window.location.origin);
    const parts = url.pathname.split('/').filter(Boolean);

    return parts[0] === 'leads' && parts[1] ? parts[1] : '';
  } catch {
    return '';
  }
}

export function InstagramOutboundBridge() {
  const router = useRouter();

  useEffect(() => {
    let disposed = false;
    let detach: (() => void) | null = null;
    let attachedForm: HTMLFormElement | null = null;

    const attach = () => {
      if (disposed || detach) {
        return;
      }

      const form = findManualInteractionForm();

      if (!form) {
        return;
      }

      const direction = form.querySelector<HTMLSelectElement>(
        'select[name="direction"]',
      );
      const channel = form.querySelector<HTMLSelectElement>(
        'select[name="channel"]',
      );
      const body = form.querySelector<HTMLInputElement | HTMLTextAreaElement>(
        '[name="body"]',
      );
      const submit = form.querySelector<HTMLButtonElement>('button[type="submit"]');
      const helper = form.querySelector<HTMLDivElement>('div.mt-2');

      if (!direction || !channel || !body || !submit) {
        return;
      }

      attachedForm = form;

      const originalButtonText = submit.textContent ?? 'Log';
      const originalPlaceholder = body.placeholder;
      const originalHelper = helper?.textContent ?? '';
      let sending = false;
      let copilotAssisted = false;

      const updateUi = () => {
        const isInstagramOutbound =
          channel.value.toLowerCase() === 'instagram' &&
          direction.value.toLowerCase() === 'outbound';

        if (isInstagramOutbound) {
          submit.textContent = sending ? 'Sending...' : 'Send';
          body.placeholder = sending
            ? 'Sending through Instagram...'
            : 'Reply on Instagram...';

          if (helper) {
            helper.textContent = copilotAssisted
              ? 'AI-assisted draft · review before sending · sent through Instagram API + logged in CRM.'
              : 'Instagram outbound replies are sent through the connected Instagram API and logged in CRM.';
          }
        } else {
          submit.textContent = originalButtonText;
          body.placeholder = originalPlaceholder;

          if (helper) {
            helper.textContent = originalHelper;
          }
        }

        submit.disabled = sending;
        body.disabled = sending;
        channel.disabled = sending;
        direction.disabled = sending;
      };

      const applyCopilotDraft = (event: Event) => {
        const detail = (event as CopilotDraftEvent).detail;

        if (detail?.channel !== 'instagram' || !detail.body?.trim()) {
          return;
        }

        channel.value = 'instagram';
        direction.value = 'outbound';
        body.value = detail.body.slice(0, 1000);
        copilotAssisted = true;
        updateUi();
        body.focus();
      };

      const onSubmit = async (event: SubmitEvent) => {
        const isInstagramOutbound =
          channel.value.toLowerCase() === 'instagram' &&
          direction.value.toLowerCase() === 'outbound';

        if (!isInstagramOutbound || sending) {
          return;
        }

        event.preventDefault();
        event.stopPropagation();

        const leadId = selectedLeadId();

        if (!leadId) {
          if (helper) {
            helper.textContent =
              'Unable to resolve the selected CRM lead. Reopen this conversation and try again.';
          }
          return;
        }

        const text = body.value.trim();

        if (!text) {
          body.focus();
          return;
        }

        const wasCopilotAssisted = copilotAssisted;
        sending = true;
        updateUi();

        const formData = new FormData();
        formData.set('body', text);
        if (wasCopilotAssisted) {
          formData.set('ai_generated', 'true');
        }

        try {
          const result = (await sendInstagramMessageAction(
            leadId,
            formData,
          )) as InstagramSendResult | void;

          if (!result?.ok) {
            return;
          }

          if (wasCopilotAssisted && result.message.id) {
            await markCopilotAssistedMessageAction({
              leadId,
              messageId: result.message.id,
              channel: 'instagram',
            });
          }

          body.value = '';
          copilotAssisted = false;
          router.refresh();
        } catch (error) {
          console.error('Instagram send failed:', error);
        } finally {
          sending = false;
          updateUi();
        }
      };

      channel.addEventListener('change', updateUi);
      direction.addEventListener('change', updateUi);
      form.addEventListener('submit', onSubmit, true);
      window.addEventListener('crm:copilot-draft', applyCopilotDraft);
      updateUi();

      detach = () => {
        channel.removeEventListener('change', updateUi);
        direction.removeEventListener('change', updateUi);
        form.removeEventListener('submit', onSubmit, true);
        window.removeEventListener('crm:copilot-draft', applyCopilotDraft);
        submit.textContent = originalButtonText;
        submit.disabled = false;
        body.disabled = false;
        body.placeholder = originalPlaceholder;
        channel.disabled = false;
        direction.disabled = false;

        if (helper) {
          helper.textContent = originalHelper;
        }
      };
    };

    attach();

    const observer = new MutationObserver(() => {
      if (attachedForm && !attachedForm.isConnected) {
        detach?.();
        detach = null;
        attachedForm = null;
      }

      if (!detach) {
        attach();
      }
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true,
    });

    return () => {
      disposed = true;
      observer.disconnect();
      detach?.();
    };
  }, [router]);

  return null;
}
