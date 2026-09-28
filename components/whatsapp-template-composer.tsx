'use client';

import {
  useMemo,
  useState,
} from 'react';

import {
  AlertTriangle,
  CheckCircle2,
  MessageCircle,
  MessageSquareText,
  Send,
} from 'lucide-react';

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

  mode?: 'followup' | 'start';

  phone?: string;
};

function displayName(
  value: string
) {
  return value
    .replaceAll('_', ' ')
    .replace(
      /\b\w/g,
      (letter) =>
        letter.toUpperCase()
    );
}

export function WhatsAppTemplateComposer({
  action,
  templates,
  loadError,
  windowLabel,
  mode = 'followup',
  phone,
}: WhatsAppTemplateComposerProps) {
  const usableTemplates =
    useMemo(
      () =>
        templates.filter(
          (template) =>
            template.supported
        ),
      [templates]
    );

  const [
    selectedKey,
    setSelectedKey,
  ] = useState(
    usableTemplates[0]
      ? `${usableTemplates[0].name}::${usableTemplates[0].language}`
      : ''
  );

  const selected =
    useMemo(
      () =>
        usableTemplates.find(
          (template) =>
            `${template.name}::${template.language}` ===
            selectedKey
        ) ?? null,
      [
        usableTemplates,
        selectedKey,
      ]
    );

  const startingWhatsApp =
    mode === 'start';

  return (
    <div className="shrink-0 border-t border-slate-200 bg-white">
      {/* STATUS */}

      <div
        className={`flex items-start gap-3 border-b px-4 py-3 ${
          startingWhatsApp
            ? 'border-emerald-100 bg-emerald-50/70'
            : 'border-amber-100 bg-amber-50/70'
        }`}
      >
        <div
          className={`mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-lg ${
            startingWhatsApp
              ? 'bg-emerald-100 text-emerald-700'
              : 'bg-amber-100 text-amber-700'
          }`}
        >
          {startingWhatsApp ? (
            <MessageCircle
              size={15}
            />
          ) : (
            <MessageSquareText
              size={15}
            />
          )}
        </div>

        <div className="min-w-0">
          <div
            className={`text-xs font-black ${
              startingWhatsApp
                ? 'text-emerald-900'
                : 'text-amber-900'
            }`}
          >
            {startingWhatsApp
              ? 'Start WhatsApp conversation'
              : 'Reply window expired'}
          </div>

          <div
            className={`mt-0.5 text-[11px] leading-5 ${
              startingWhatsApp
                ? 'text-emerald-700'
                : 'text-amber-700'
            }`}
          >
            {startingWhatsApp ? (
              <>
                Send an approved
                WhatsApp template to
                this lead
                {phone
                  ? ` at ${phone}`
                  : ''}
                .
              </>
            ) : (
              windowLabel ||
              'Use an approved WhatsApp template to continue this conversation.'
            )}
          </div>
        </div>
      </div>

      {/* ERROR */}

      {loadError && (
        <div className="m-4 flex gap-3 rounded-xl border border-red-100 bg-red-50 p-3 text-xs text-red-700">
          <AlertTriangle
            size={15}
            className="mt-0.5 shrink-0"
          />

          <div>
            <div className="font-bold">
              Unable to load
              templates
            </div>

            <div className="mt-1 leading-5">
              {loadError}
            </div>
          </div>
        </div>
      )}

      {!loadError &&
        usableTemplates.length ===
          0 && (
          <div className="m-4 rounded-xl border border-amber-100 bg-amber-50 p-4">
            <div className="text-xs font-bold text-amber-900">
              No supported approved
              templates found
            </div>

            <p className="mt-1 text-[11px] leading-5 text-amber-700">
              Create and approve a
              WhatsApp message
              template in Meta, then
              refresh this
              conversation.
            </p>
          </div>
        )}

      {!loadError &&
        usableTemplates.length >
          0 && (
          <form
            action={action}
            className="p-4"
          >
            <label className="block">
              <span className="mb-1.5 block text-[10px] font-bold uppercase tracking-[.12em] text-slate-400">
                Approved template
              </span>

              <select
                className="input"
                value={selectedKey}
                onChange={(event) =>
                  setSelectedKey(
                    event.target.value
                  )
                }
              >
                {usableTemplates.map(
                  (template) => {
                    const key =
                      `${template.name}::${template.language}`;

                    return (
                      <option
                        key={
                          template.id
                        }
                        value={key}
                      >
                        {displayName(
                          template.name
                        )}{' '}
                        ·{' '}
                        {
                          template.language
                        }
                      </option>
                    );
                  }
                )}
              </select>
            </label>

            {selected && (
              <>
                <input
                  type="hidden"
                  name="template_name"
                  value={
                    selected.name
                  }
                />

                <input
                  type="hidden"
                  name="template_language"
                  value={
                    selected.language
                  }
                />

                <div className="mt-3 flex flex-wrap gap-1.5">
                  <span className="rounded-full border border-emerald-100 bg-emerald-50 px-2 py-1 text-[9px] font-bold uppercase text-emerald-700">
                    <span className="inline-flex items-center gap-1">
                      <CheckCircle2
                        size={10}
                      />

                      Approved
                    </span>
                  </span>

                  <span className="rounded-full border border-violet-100 bg-violet-50 px-2 py-1 text-[9px] font-bold uppercase text-violet-700">
                    {
                      selected.category
                    }
                  </span>

                  <span className="rounded-full border border-sky-100 bg-sky-50 px-2 py-1 text-[9px] font-bold uppercase text-sky-700">
                    {
                      selected.language
                    }
                  </span>
                </div>

                {/* HEADER VARIABLES */}

                {selected.headerVariableCount >
                  0 && (
                  <div className="mt-4 space-y-2">
                    <div className="text-[10px] font-bold uppercase tracking-[.12em] text-slate-400">
                      Header details
                    </div>

                    {Array.from({
                      length:
                        selected.headerVariableCount,
                    }).map(
                      (_, index) => (
                        <input
                          key={
                            index
                          }
                          className="input"
                          name={`header_param_${index + 1}`}
                          required
                          placeholder={`Header value ${index + 1}`}
                        />
                      )
                    )}
                  </div>
                )}

                {/* BODY VARIABLES */}

                {selected.bodyVariableCount >
                  0 && (
                  <div className="mt-4 space-y-2">
                    <div className="text-[10px] font-bold uppercase tracking-[.12em] text-slate-400">
                      Message details
                    </div>

                    {Array.from({
                      length:
                        selected.bodyVariableCount,
                    }).map(
                      (_, index) => (
                        <input
                          key={
                            index
                          }
                          className="input"
                          name={`body_param_${index + 1}`}
                          required
                          placeholder={`Template value ${index + 1}`}
                        />
                      )
                    )}
                  </div>
                )}

                {/* PREVIEW */}

                <div className="mt-4 rounded-2xl border border-emerald-100 bg-[#effcf4] p-4">
                  <div className="text-[9px] font-bold uppercase tracking-[.12em] text-emerald-700/60">
                    WhatsApp preview
                  </div>

                  {selected.headerText && (
                    <div className="mt-2 text-xs font-black text-slate-900">
                      {
                        selected.headerText
                      }
                    </div>
                  )}

                  {selected.bodyText && (
                    <div className="mt-2 whitespace-pre-wrap text-xs leading-5 text-slate-700">
                      {
                        selected.bodyText
                      }
                    </div>
                  )}

                  {selected.footerText && (
                    <div className="mt-3 text-[10px] text-slate-400">
                      {
                        selected.footerText
                      }
                    </div>
                  )}
                </div>

                <div className="mt-3 text-[10px] leading-4 text-slate-400">
                  This message uses
                  the approved Meta
                  template. The
                  template text itself
                  cannot be freely
                  edited.
                </div>

                <button
                  type="submit"
                  className="btn-primary mt-4 flex w-full items-center justify-center gap-2"
                >
                  <Send
                    size={14}
                  />

                  {startingWhatsApp
                    ? 'Start WhatsApp'
                    : 'Send WhatsApp template'}
                </button>
              </>
            )}
          </form>
        )}

      {/* UNSUPPORTED */}

      {templates.some(
        (template) =>
          !template.supported
      ) && (
        <details className="border-t border-slate-100 px-4 py-3">
          <summary className="cursor-pointer text-[10px] font-bold text-slate-400">
            Some approved templates
            aren't supported yet
          </summary>

          <div className="mt-3 space-y-2">
            {templates
              .filter(
                (template) =>
                  !template.supported
              )
              .map(
                (template) => (
                  <div
                    key={
                      template.id
                    }
                    className="rounded-lg bg-slate-50 px-3 py-2"
                  >
                    <div className="text-[10px] font-bold text-slate-700">
                      {displayName(
                        template.name
                      )}
                    </div>

                    <div className="mt-1 text-[9px] leading-4 text-slate-400">
                      {template.unsupportedReason ||
                        'Unsupported template configuration'}
                    </div>
                  </div>
                )
              )}
          </div>
        </details>
      )}
    </div>
  );
}