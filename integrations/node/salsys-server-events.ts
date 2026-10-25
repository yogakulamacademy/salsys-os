export type SalsysServerEventOptions = {
  endpoint?: string;
  sourceKey?: string;
  secret?: string;
  occurredAt?: string;
  site?: string;
  anonymousVisitorId?: string | null;
  sessionKey?: string | null;
  externalMessageId?: string | null;
  metadata?: Record<string, unknown>;
  context?: Record<string, unknown>;
};

export type SalsysServerEventResult = {
  ok: boolean;
  sent: boolean;
  status: number | null;
  accepted?: boolean;
  duplicate?: boolean;
  response?: unknown;
  error?: string | null;
};

export async function sendSalsysServerEvent(
  eventName: string,
  eventId: string,
  properties: Record<string, unknown>,
  options: SalsysServerEventOptions = {},
): Promise<SalsysServerEventResult> {
  const endpoint = options.endpoint ?? 'https://salsysos.com/api/events/v1';
  const sourceKey = options.sourceKey ?? process.env.SALSYS_SERVER_SOURCE_KEY ?? '';
  const secret = options.secret ?? process.env.SALSYS_SERVER_SECRET ?? '';

  if (!sourceKey || !secret) {
    return {
      ok: false,
      sent: false,
      status: null,
      error: 'Salsys server tracking credentials are not configured.',
    };
  }

  const body: Record<string, unknown> = {
    event_id: eventId,
    event_name: eventName,
    schema_version: 1,
    occurred_at: options.occurredAt ?? new Date().toISOString(),
    site: options.site ?? null,
    properties,
    metadata: {
      integration: 'node_backend',
      trusted_business_event: true,
      ...(options.metadata ?? {}),
    },
  };

  if (options.anonymousVisitorId) body.anonymous_visitor_id = options.anonymousVisitorId;
  if (options.sessionKey) body.session_key = options.sessionKey;
  if (options.externalMessageId) body.external_message_id = options.externalMessageId;
  if (options.context) body.context = options.context;

  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Salsys-Source-Key': sourceKey,
        Authorization: `Bearer ${secret}`,
      },
      body: JSON.stringify(body),
    });

    const payload = await response.json().catch(() => null);
    const accepted = Boolean(payload && typeof payload === 'object' && 'accepted' in payload && payload.accepted === true);
    const duplicate = Boolean(payload && typeof payload === 'object' && 'duplicate' in payload && payload.duplicate === true);

    return {
      ok: response.ok && (accepted || duplicate),
      sent: true,
      status: response.status,
      accepted,
      duplicate,
      response: payload,
      error: response.ok ? null : `Salsys returned HTTP ${response.status}`,
    };
  } catch (error) {
    return {
      ok: false,
      sent: false,
      status: null,
      error: error instanceof Error ? error.message : 'Salsys request failed.',
    };
  }
}

export async function salsysBookingEvent(
  eventName: 'booking.started' | 'booking.completed',
  bookingReference: string,
  customer: { email?: string; phone?: string },
  details: Record<string, unknown> = {},
  options: SalsysServerEventOptions = {},
) {
  return sendSalsysServerEvent(
    eventName,
    `${eventName.replace('.', '_')}:${bookingReference}`,
    {
      ...details,
      booking_reference: bookingReference,
      email: customer.email ?? '',
      phone: customer.phone ?? '',
    },
    options,
  );
}

export async function salsysPaymentEvent(
  eventName: 'payment.started' | 'payment.completed' | 'payment.failed',
  paymentReference: string,
  bookingReference: string,
  customer: { email?: string; phone?: string },
  payment: {
    provider?: string;
    paymentKind?: string;
    amount?: number;
    currency?: string;
  },
  options: SalsysServerEventOptions = {},
) {
  return sendSalsysServerEvent(
    eventName,
    `${eventName.replace('.', '_')}:${paymentReference}`,
    {
      payment_reference: paymentReference,
      booking_reference: bookingReference,
      email: customer.email ?? '',
      phone: customer.phone ?? '',
      provider: payment.provider ?? '',
      payment_kind: payment.paymentKind ?? 'other',
      amount: Number(payment.amount ?? 0),
      currency: (payment.currency ?? '').toUpperCase(),
    },
    options,
  );
}

export async function salsysEnrollmentCompleted(
  enrollmentReference: string,
  bookingReference: string,
  customer: { email?: string; phone?: string },
  enrollment: Record<string, unknown>,
  options: SalsysServerEventOptions = {},
) {
  return sendSalsysServerEvent(
    'enrollment.completed',
    `enrollment_completed:${enrollmentReference}`,
    {
      ...enrollment,
      enrollment_reference: enrollmentReference,
      booking_reference: bookingReference,
      email: customer.email ?? '',
      phone: customer.phone ?? '',
    },
    options,
  );
}
