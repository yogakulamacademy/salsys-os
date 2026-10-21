'use client';

import { Trash2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

type RemoveResponse = {
  ok?: boolean;
  message?: string;
  error?: string;
};

export function WhatsAppRemoveButton({
  connectionId,
  displayPhoneNumber,
}: {
  connectionId: string;
  displayPhoneNumber?: string | null;
}) {
  const router = useRouter();
  const [removing, setRemoving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function remove() {
    if (removing) return;

    const confirmed = window.confirm(
      `Remove ${displayPhoneNumber || 'this WhatsApp number'} from SalsysOS? Historical CRM conversations will be preserved. This does not delete the WhatsApp Business app account or deregister the phone number.`,
    );

    if (!confirmed) return;

    setRemoving(true);
    setMessage(null);
    setError(null);

    try {
      const response = await fetch('/api/integrations/whatsapp/remove', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ connection_id: connectionId }),
      });
      const payload = (await response.json()) as RemoveResponse;

      if (!response.ok || payload.ok !== true) {
        throw new Error(payload.error || 'Unable to remove WhatsApp.');
      }

      setMessage(
        payload.message ||
          'WhatsApp was removed. You can now connect another number.',
      );
      router.refresh();
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : 'Unable to remove WhatsApp.',
      );
    } finally {
      setRemoving(false);
    }
  }

  return (
    <div className="grid gap-2">
      <button
        type="button"
        onClick={() => void remove()}
        disabled={removing}
        className="inline-flex w-fit items-center gap-2 rounded-lg border border-rose-200 bg-white px-3 py-2 text-xs font-semibold text-rose-700 transition hover:bg-rose-50 disabled:cursor-wait disabled:opacity-60"
      >
        <Trash2 size={14} />
        {removing ? 'Removing…' : 'Remove from SalsysOS'}
      </button>

      {message ? (
        <div className="max-w-xl rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-[11px] leading-5 text-emerald-700">
          {message}
        </div>
      ) : null}

      {error ? (
        <div className="max-w-xl rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-[11px] leading-5 text-rose-700">
          {error}
        </div>
      ) : null}
    </div>
  );
}
