'use client';

import { useMemo, useState } from "react";

import {
  AlertTriangle,
  CheckCircle2,
  MessageCircle,
  MessageSquareText,
  Send,
} from "lucide-react";

import { useWhatsAppConnectionStatus } from "@/components/use-whatsapp-connection-status";

type TemplateOption = {
  id: string;
  name: string;
  language: string;
  category: string;
  headerText: string;
  bodyText: string;
  footerText: string;
  headerVariableCount: number;
  bodyVariableCount: number;
  supported: boolean;
  unsupportedReason?: string;
};

type WhatsAppTemplateComposerProps = {
  action:
    | ((formData: FormData) => void)
    | ((formData: FormData) => Promise<void>);
  templates: TemplateOption[];
  loadError?: string | null;
  windowLabel?: string;
  mode?: "followup" | "start";
  phone?: string;
};

function displayName(value: string) {
  return value
    .replaceAll("_", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export function WhatsAppTemplateComposer({
  action,
  templates,
  loadError,
  windowLabel,
  mode = "followup",
  phone,
}: WhatsAppTemplateComposerProps) {
  const usableTemplates = useMemo(
    () => templates.filter((template) => template.supported),
    [templates],
  );

  const [selectedKey, setSelectedKey] = useState(
    usableTemplates[0]
      ? `${usableTemplates[0].name}::${usableTemplates[0].language}`
      : "",
  );

  const selected = useMemo(
    () =>
      usableTemplates.find(
        (template) => `${template.name}::${template.language}` === selectedKey,
      ) ?? null,
    [usableTemplates, selectedKey],
  );

  const startingWhatsApp = mode === "start";
  const { state: connectionState } = useWhatsAppConnectionStatus();
  const connectionReady = connectionState === "connected";

  return (
    <div className="conversation-template-composer shrink-0 border-t border-[#DCE4DF] bg-white">
      <div
        className={`flex items-start gap-3 border-b px-4 py-3 ${
          startingWhatsApp
            ? "border-[#D8E6DC] bg-[#F2F8F4]"
            : "border-[#E7D8BD] bg-[#FCF6EA]"
        }`}
      >
        <div
          className={`mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-lg ${
            startingWhatsApp
              ? "bg-white text-[#216551]"
              : "bg-white/70 text-[#825018]"
          }`}
        >
          {startingWhatsApp ? (
            <MessageCircle size={15} />
          ) : (
            <MessageSquareText size={15} />
          )}
        </div>

        <div className="min-w-0">
          <div
            className={`text-[11px] font-semibold ${
              startingWhatsApp ? "text-[#18362D]" : "text-[#6B501F]"
            }`}
          >
            {startingWhatsApp
              ? "Start WhatsApp conversation"
              : "WhatsApp reply window closed"}
          </div>

          <div
            className={`mt-0.5 text-[10px] leading-5 ${
              startingWhatsApp ? "text-[#596E64]" : "text-[#715B31]"
            }`}
          >
            {startingWhatsApp ? (
              <>
                An approved template is required before beginning an outbound WhatsApp conversation
                {phone ? ` with ${phone}` : ""}.
              </>
            ) : (
              windowLabel ||
              "Use an approved WhatsApp template to continue this conversation."
            )}
          </div>
        </div>
      </div>

      {loadError && (
        <div className="m-4 flex gap-3 rounded-lg border border-red-100 bg-red-50 p-3 text-[10px] text-red-700">
          <AlertTriangle size={14} className="mt-0.5 shrink-0" />
          <div>
            <div className="font-semibold">Unable to load templates</div>
            <div className="mt-1 leading-5">{loadError}</div>
          </div>
        </div>
      )}

      {!loadError && usableTemplates.length === 0 && (
        <div className="m-4 rounded-lg border border-[#E7D8BD] bg-[#FCF6EA] p-4">
          <div className="text-[10px] font-semibold text-[#6B501F]">
            No supported approved templates found
          </div>
          <p className="mt-1 text-[10px] leading-5 text-[#715B31]">
            Create and approve a WhatsApp message template in Meta, then refresh this conversation.
          </p>
        </div>
      )}

      {!loadError && usableTemplates.length > 0 && (
        <form
          action={action}
          onSubmit={(event) => {
            if (!connectionReady) event.preventDefault();
          }}
          className="p-4"
        >
          <fieldset disabled={!connectionReady} className="min-w-0 disabled:opacity-70">
            <label className="block">
              <span className="mb-1.5 block text-[9px] font-semibold uppercase tracking-[.12em] text-[#596E64]">
                Approved template
              </span>

              <select
                className="input"
                value={selectedKey}
                onChange={(event) => setSelectedKey(event.target.value)}
                aria-describedby="whatsapp-template-connection-state"
              >
                {usableTemplates.map((template) => {
                  const key = `${template.name}::${template.language}`;

                  return (
                    <option key={template.id} value={key}>
                      {displayName(template.name)} · {template.language}
                    </option>
                  );
                })}
              </select>
            </label>

            {selected && (
              <>
                <input type="hidden" name="template_name" value={selected.name} />
                <input
                  type="hidden"
                  name="template_language"
                  value={selected.language}
                />

                <div className="mt-3 flex flex-wrap gap-1.5">
                  <span className="rounded-full border border-[#D6E6DB] bg-[#F2F8F4] px-2 py-1 text-[8px] font-semibold uppercase text-[#216551]">
                    <span className="inline-flex items-center gap-1">
                      <CheckCircle2 size={10} /> Approved
                    </span>
                  </span>
                  <span className="rounded-full border border-[#DCE4DF] bg-[#F6F8F7] px-2 py-1 text-[8px] font-semibold uppercase text-[#596E64]">
                    {selected.category}
                  </span>
                  <span className="rounded-full border border-[#DCE4DF] bg-[#F6F8F7] px-2 py-1 text-[8px] font-semibold uppercase text-[#596E64]">
                    {selected.language}
                  </span>
                </div>

                {selected.headerVariableCount > 0 && (
                  <div className="mt-4 space-y-2">
                    <div className="text-[9px] font-semibold uppercase tracking-[.12em] text-[#596E64]">
                      Header details
                    </div>
                    {Array.from({ length: selected.headerVariableCount }).map((_, index) => (
                      <input
                        key={index}
                        className="input"
                        name={`header_param_${index + 1}`}
                        required
                        placeholder={`Header value ${index + 1}`}
                      />
                    ))}
                  </div>
                )}

                {selected.bodyVariableCount > 0 && (
                  <div className="mt-4 space-y-2">
                    <div className="text-[9px] font-semibold uppercase tracking-[.12em] text-[#596E64]">
                      Message details
                    </div>
                    {Array.from({ length: selected.bodyVariableCount }).map((_, index) => (
                      <input
                        key={index}
                        className="input"
                        name={`body_param_${index + 1}`}
                        required
                        placeholder={`Template value ${index + 1}`}
                      />
                    ))}
                  </div>
                )}

                <div className="conversation-template-preview mt-4 rounded-xl border border-[#D8E6DC] bg-[#F2F8F4] p-4">
                  <div className="text-[8px] font-semibold uppercase tracking-[.12em] text-[#216551]">
                    WhatsApp preview
                  </div>
                  {selected.headerText && (
                    <div className="mt-2 text-[11px] font-semibold text-[#18362D]">
                      {selected.headerText}
                    </div>
                  )}
                  {selected.bodyText && (
                    <div className="mt-2 whitespace-pre-wrap text-[11px] leading-5 text-[#40564C]">
                      {selected.bodyText}
                    </div>
                  )}
                  {selected.footerText && (
                    <div className="mt-3 text-[9px] text-[#71847A]">
                      {selected.footerText}
                    </div>
                  )}
                </div>

                <div className="mt-3 text-[9px] leading-4 text-[#71847A]">
                  The approved template text cannot be freely edited. Sending still requires an explicit submit.
                </div>

                <button
                  type="submit"
                  disabled={!connectionReady}
                  className="mt-4 flex h-9 w-full items-center justify-center gap-2 rounded-lg bg-[#153E33] px-3 text-[10px] font-semibold text-white transition hover:bg-[#216551] disabled:cursor-not-allowed disabled:bg-[#EDF0EC] disabled:text-[#59685F]"
                >
                  <Send size={13} />
                  {startingWhatsApp ? "Start WhatsApp" : "Send WhatsApp template"}
                </button>
              </>
            )}
          </fieldset>

          <div
            id="whatsapp-template-connection-state"
            className={`mt-2 text-[9px] ${connectionReady ? "text-[#216551]" : "text-[#71847A]"}`}
          >
            {templateConnectionLabel(connectionState)}
          </div>
        </form>
      )}

      {templates.some((template) => !template.supported) && (
        <details className="border-t border-[#DCE4DF] px-4 py-3">
          <summary className="cursor-pointer text-[9px] font-semibold text-[#596E64]">
            Some approved templates aren't supported yet
          </summary>
          <div className="mt-3 space-y-2">
            {templates
              .filter((template) => !template.supported)
              .map((template) => (
                <div key={template.id} className="rounded-lg bg-[#F6F8F7] px-3 py-2">
                  <div className="text-[10px] font-semibold text-[#18362D]">
                    {displayName(template.name)}
                  </div>
                  <div className="mt-1 text-[9px] leading-4 text-[#596E64]">
                    {template.unsupportedReason || "Unsupported template configuration"}
                  </div>
                </div>
              ))}
          </div>
        </details>
      )}
    </div>
  );
}

function templateConnectionLabel(
  state: "loading" | "connected" | "disconnected" | "unavailable",
) {
  if (state === "loading") return "Verifying WhatsApp connection… Template controls are disabled.";
  if (state === "disconnected") return "Template controls are disabled until WhatsApp is connected.";
  if (state === "unavailable") return "Template controls are disabled until the WhatsApp connection can be verified.";
  return "WhatsApp connection verified. Review the template and variables before sending.";
}
