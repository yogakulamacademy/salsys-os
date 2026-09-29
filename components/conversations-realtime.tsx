'use client';

import {
  useEffect,
} from 'react';

import {
  useRouter,
} from 'next/navigation';

import {
  createClient,
} from '@/lib/supabase/browser';

type RealtimeMessage = {
  id?: string;
  lead_id?: string;
  conversation_id?: string;
  direction?: string;
  body?: string;
  created_at?: string;
};

export function ConversationsRealtime() {
  const router =
    useRouter();

  useEffect(() => {
    const supabase =
      createClient();

    let refreshTimer:
      ReturnType<
        typeof setTimeout
      > | null = null;

    const refreshInbox =
      () => {
        if (refreshTimer) {
          clearTimeout(
            refreshTimer
          );
        }

        refreshTimer =
          setTimeout(
            () => {
              router.refresh();
            },
            300
          );
      };

    const channel =
      supabase
        .channel(
          'crm-conversations-live'
        )
        .on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: 'public',
            table: 'messages',
          },
          (payload: unknown) => {
  const event =
    payload as {
      new?: RealtimeMessage;
    };

  const message =
    event.new;

  if (!message) {
    return;
  }

            /*
             * IMPORTANT:
             *
             * Do not refresh after our own
             * outbound CRM message.
             *
             * The composer will handle that
             * message locally.
             *
             * We only refresh for customer
             * inbound messages.
             */
            if (
              message.direction ===
              'outbound'
            ) {
              return;
            }

            refreshInbox();
          }
        )
        .subscribe();

    return () => {
      if (refreshTimer) {
        clearTimeout(
          refreshTimer
        );
      }

      void supabase
        .removeChannel(
          channel
        );
    };
  }, [
    router,
  ]);

  return null;
}