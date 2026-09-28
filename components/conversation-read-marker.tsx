'use client';

import {
  useEffect,
} from 'react';

import {
  markConversationReadAction,
} from '@/app/conversations/actions';

export function ConversationReadMarker({
  leadId,
}: {
  leadId: string;
}) {
  useEffect(() => {
    void markConversationReadAction(
      leadId
    );
  }, [
    leadId,
  ]);

  return null;
}