'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

import { sendInstagramMessageAction } from '@/app/conversations/instagram-actions';

type InstagramSendResult = {
  ok: true;
  message: {
    id: string | null;
    body: string;
    channel: 'instagram';
    externalMessageId: string | null;
  };
};

function findManualInteractionForm() {
  const bodyInput = document.querySelector<HTMLInputElement>(
    'form input[name="body"]',
  );

  return bodyInput?.closest('form') ?? null;
}

export function InstagramOutboundBridge() {
  const router = useRouter();

  useEffect(() => {
    const leadId = new URLSearchParams(window.location.search)
      .get('lead')
      ?.trim() ?? '';

    if (!leadId) {
      return;
    }

    let disposed = false;
    let detach: (() => void) | null = null;

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
      const body = form.querySelector<HTMLInputElement>('input[name="body"]');
      const submit = form.querySelector<HTMLButtonElement>('button[type="submit"]');
      const helper = form.querySelector<HTMLDivElement>('.mt-2.text-\[10px\]');

      if (!direction || !channel || !body || !submit) {
        return;
      }

      const originalButtonText = submit.textContent ?? 'Log';
      const originalPlaceholder = body.placeholder;
      const originalHelper = helper?.textContent ?? '';
      let sending = false;

      const updateUi = () => {
        const isInstagramOutbound =
          channel.value === 'instagram' && direction.value === 'outbound';

        if (isInstagramOutbound) {
          submit.textContent = sending ? 'Sending...' : 'Send';
          body.placeholder = sending
            ? 'Sending through Instagram...'
            : 'Reply on Instagram...';

          if (helper) {
            helper.textContent =
              'Instagram outbound replies are sent through the connected Instagram API and logged in CRM.';
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

      const onSubmit = async (event: SubmitEvent) => {
        const isInstagramOutbound =
          channel.value === 'instagram' && direction.value === 'outbound';

        if (!isInstagramOutbound || sending) {
          return;
        }

        event.preventDefault();
        event.stopPropagation();

        const text = body.value.trim();

        if (!text) {
          body.focus();
          return;
        }

        sending = true;
        updateUi();

        const formData = new FormData();
        formData.set('body', text);

        try {
          const result = (await sendInstagramMessageAction(
            leadId,
            formData,
          )) as InstagramSendResult | void;

          if (!result?.ok) {
            return;
          }

          body.value = '';
          router.refresh();
        } catch (error) {
          // NEXT_REDIRECT is handled by Next.js. Genuine client-side failures
          // are logged while preserving the unsent draft in the input.
          console.error('Instagram send failed:', error);
        } finally {
          sending = false;
          updateUi();
        }
      };

      channel.addEventListener('change', updateUi);
      direction.addEventListener('change', updateUi);
      form.addEventListener('submit', onSubmit, true);
      updateUi();

      detach = () => {
        channel.removeEventListener('change', updateUi);
        direction.removeEventListener('change', updateUi);
        form.removeEventListener('submit', onSubmit, true);
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
