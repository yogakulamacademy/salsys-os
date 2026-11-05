export type MessageSyncChannel = 'instagram' | 'whatsapp' | 'website';
export type MessageDirection = 'inbound' | 'outbound';

export type MessageSyncRow = {
  channel: MessageSyncChannel;
  direction: MessageDirection;
  storedCount: number;
  missingProviderId: number;
  outboundMissingSentAt: number;
  latestStoredAt: string | null;
};

export type MessageSyncEventRow = {
  channel: 'instagram' | 'whatsapp';
  status: string;
  eventCount: number;
  lastUpdatedAt: string | null;
};

export type MessageSyncHistory = {
  accountCursors: number;
  completedCycles: number;
  conversationsScanned: number;
  messagesImported: number;
  messagesAlreadyPresent: number;
  lastScannedAt: string | null;
};

export type MessageSyncAudit = {
  messages: MessageSyncRow[];
  providerEventLifecycle: MessageSyncEventRow[];
  instagramHistory: MessageSyncHistory;
  checkedAt: string;
};

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Message sync audit has an invalid payload.');
  }
  return value as Record<string, unknown>;
}

function count(value: unknown): number {
  const number = typeof value === 'number' ? value :
    typeof value === 'string' && /^\d+$/.test(value) ? Number(value) : NaN;
  if (!Number.isSafeInteger(number) || number < 0) {
    throw new Error('Message sync audit has invalid counts.');
  }
  return number;
}

function safeTime(value: unknown): string | null {
  if (value === null) return null;
  if (typeof value !== 'string' || !Number.isFinite(Date.parse(value))) {
    throw new Error('Message sync audit has an invalid timestamp.');
  }
  return value;
}

/** Validate privileged SQL results before using them in operational UI. */
export function parseMessageSyncAudit(value: unknown): MessageSyncAudit {
  const input = record(value);
  if (!Array.isArray(input.messages) || !Array.isArray(input.providerEventLifecycle)) {
    throw new Error('Message sync audit is incomplete.');
  }
  if (input.messages.length > 12 || input.providerEventLifecycle.length > 30) {
    throw new Error('Message sync audit is unexpectedly large.');
  }

  const messages: MessageSyncRow[] = input.messages.map(entry => {
    const r = record(entry);
    if (!['instagram','whatsapp','website'].includes(String(r.channel)) ||
        !['inbound','outbound'].includes(String(r.direction))) {
      throw new Error('Message sync audit contains an unknown message category.');
    }
    const row = {
      channel: r.channel as MessageSyncChannel,
      direction: r.direction as MessageDirection,
      storedCount: count(r.storedCount),
      missingProviderId: count(r.missingProviderId),
      outboundMissingSentAt: count(r.outboundMissingSentAt),
      latestStoredAt: safeTime(r.latestStoredAt),
    };
    if (row.missingProviderId > row.storedCount ||
        row.outboundMissingSentAt > row.storedCount ||
        (row.direction !== 'outbound' && row.outboundMissingSentAt > 0)) {
      throw new Error('Message sync audit counts are inconsistent.');
    }
    return row;
  });

  const providerEventLifecycle: MessageSyncEventRow[] = input.providerEventLifecycle.map(entry => {
    const r = record(entry);
    if (!['instagram','whatsapp'].includes(String(r.channel)) ||
        typeof r.status !== 'string' || !/^[a-z_]{1,50}$/.test(r.status)) {
      throw new Error('Message sync audit contains an unknown event category.');
    }
    return {
      channel: r.channel as MessageSyncEventRow['channel'],
      status: r.status,
      eventCount: count(r.eventCount),
      lastUpdatedAt: safeTime(r.lastUpdatedAt),
    };
  });
  const history = record(input.instagramHistory);
  if (typeof input.checkedAt !== 'string' ||
      !Number.isFinite(Date.parse(input.checkedAt))) {
    throw new Error('Message sync audit has no valid observation time.');
  }

  return {
    messages,
    providerEventLifecycle,
    instagramHistory: {
      accountCursors: count(history.accountCursors),
      completedCycles: count(history.completedCycles),
      conversationsScanned: count(history.conversationsScanned),
      messagesImported: count(history.messagesImported),
      messagesAlreadyPresent: count(history.messagesAlreadyPresent),
      lastScannedAt: safeTime(history.lastScannedAt),
    },
    checkedAt: input.checkedAt,
  };
}
