"use client";

import { AlertTriangle, LockKeyhole, RefreshCw } from "lucide-react";

import { useWhatsAppConnectionStatus } from "@/components/use-whatsapp-connection-status";

export function WhatsAppConnectionNotice() {
  const { state, error, refresh } = useWhatsAppConnectionStatus();

  if (state === "loading" || state === "connected") {
    return null;
  }

  if (state === "unavailable") {
    return (
      <div className="shrink-0 border-b border-[#E7D8BD] bg-[#FCF6EA] px-4 py-2.5 text-[#6B501F]">
        <div className="flex items-start gap-2.5">
          <AlertTriangle size={14} className="mt-0.5 shrink-0" />
          <div className="min-w-0 flex-1">
            <div className="text-[10px] font-semibold">WhatsApp status unavailable</div>
            <p className="mt-0.5 text-[9px] leading-4">
              Sending stays gated until the workspace connection can be verified. {error || "Try again shortly."}
            </p>
          </div>
          <button
            type="button"
            onClick={() => void refresh()}
            className="inline-flex h-7 shrink-0 items-center gap-1 rounded-md border border-[#D8C89F] bg-white px-2 text-[9px] font-semibold hover:bg-[#FFFDF7]"
          >
            <RefreshCw size={10} /> Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="shrink-0 border-b border-[#E7D8BD] bg-[#FCF6EA] px-4 py-2.5 text-[#6B501F]">
      <div className="flex items-start gap-2.5">
        <LockKeyhole size={14} className="mt-0.5 shrink-0" />
        <div className="min-w-0">
          <div className="text-[10px] font-semibold">WhatsApp connection required</div>
          <p className="mt-0.5 text-[9px] leading-4">
            Sending and template actions stay disabled while disconnected. A website inquiry or submitted phone number does not by itself make this lead eligible for WhatsApp messaging.
          </p>
        </div>
      </div>
    </div>
  );
}
