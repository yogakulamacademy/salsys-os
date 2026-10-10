import 'server-only';

import { getWhatsAppRuntimeForOrganization } from '@/lib/integrations/whatsapp-connection';

const DEFAULT_WHATSAPP_API_VERSION = 'v26.0';

type RawTemplateComponent = {
  type?: string;
  format?: string;
  text?: string;

  buttons?: Array<{
    type?: string;
    text?: string;
    url?: string;
  }>;
};

type RawTemplate = {
  id?: string;
  name?: string;
  status?: string;
  language?: string;
  category?: string;
  components?: RawTemplateComponent[];
};

type TemplateApiResponse = {
  data?: RawTemplate[];

  error?: {
    message?: string;
    type?: string;
    code?: number;
  };
};

export type WhatsAppTemplateOption = {
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

function apiVersion() {
  const value =
    process.env.WA_API_VERSION?.trim() ||
    DEFAULT_WHATSAPP_API_VERSION;

  return /^v\d+\.\d+$/.test(value)
    ? value
    : DEFAULT_WHATSAPP_API_VERSION;
}

function countPositionalVariables(
  text: string
) {
  const matches = [
    ...text.matchAll(
      /\{\{(\d+)\}\}/g
    ),
  ];

  if (!matches.length) {
    return 0;
  }

  return Math.max(
    ...matches.map(
      (match) =>
        Number(match[1] ?? 0)
    )
  );
}

function hasUnsupportedVariables(
  text: string
) {
  const matches = [
    ...text.matchAll(
      /\{\{([^}]+)\}\}/g
    ),
  ];

  return matches.some(
    (match) =>
      !/^\d+$/.test(
        String(
          match[1] ?? ''
        ).trim()
      )
  );
}

export function renderTemplateText(
  text: string,
  values: string[]
) {
  return text.replace(
    /\{\{(\d+)\}\}/g,
    (_, index: string) => {
      const value =
        values[
          Number(index) - 1
        ];

      return value ?? '';
    }
  );
}

export async function getApprovedWhatsAppTemplates(
  organizationId: string
): Promise<{
  templates: WhatsAppTemplateOption[];
  error: string | null;
}> {
  const resolvedOrganizationId =
    organizationId?.trim();

  if (!resolvedOrganizationId) {
    return {
      templates: [],
      error:
        'Unable to load WhatsApp templates: organizationId is required.',
    };
  }

  let runtime;

  try {
    runtime =
      await getWhatsAppRuntimeForOrganization(
        resolvedOrganizationId,
        {
          allowLegacyBootstrap: true,
        }
      );
  } catch (error) {
    return {
      templates: [],
      error:
        error instanceof Error
          ? error.message
          : 'WhatsApp is not connected for this workspace.',
    };
  }

  const accessToken =
    runtime.accessToken;

  const wabaId =
    runtime.wabaId;

  const version =
    apiVersion();

  const url =
    new URL(
      `https://graph.facebook.com/${version}/${wabaId}/message_templates`
    );

  url.searchParams.set(
    'fields',
    [
      'id',
      'name',
      'status',
      'language',
      'category',
      'components',
    ].join(',')
  );

  url.searchParams.set(
    'limit',
    '100'
  );

  const response =
    await fetch(
      url.toString(),
      {
        method: 'GET',

        headers: {
          Authorization:
            `Bearer ${accessToken}`,
        },

        cache: 'no-store',
      }
    );

  const responseText =
    await response.text();

  let payload:
    TemplateApiResponse = {};

  try {
    payload =
      responseText
        ? JSON.parse(
            responseText
          )
        : {};
  } catch {
    payload = {};
  }

  if (!response.ok) {
    return {
      templates: [],

      error:
        payload.error?.message ||
        `Meta returned HTTP ${response.status}.`,
    };
  }

  const templates =
    (
      payload.data ?? []
    )
      .filter(
        (template) =>
          String(
            template.status ?? ''
          ).toUpperCase() ===
          'APPROVED'
      )
      .map(
        (
          template
        ): WhatsAppTemplateOption => {
          const components =
            template.components ??
            [];

          const header =
            components.find(
              (component) =>
                String(
                  component.type ??
                    ''
                ).toUpperCase() ===
                'HEADER'
            );

          const body =
            components.find(
              (component) =>
                String(
                  component.type ??
                    ''
                ).toUpperCase() ===
                'BODY'
            );

          const footer =
            components.find(
              (component) =>
                String(
                  component.type ??
                    ''
                ).toUpperCase() ===
                'FOOTER'
            );

          const buttons =
            components.find(
              (component) =>
                String(
                  component.type ??
                    ''
                ).toUpperCase() ===
                'BUTTONS'
            );

          const headerText =
            header?.text ?? '';

          const bodyText =
            body?.text ?? '';

          const footerText =
            footer?.text ?? '';

          const headerFormat =
            String(
              header?.format ??
                'TEXT'
            ).toUpperCase();

          let supported =
            true;

          let unsupportedReason:
            | string
            | undefined;

          /*
           * First version supports:
           *
           * - normal text templates
           * - text header variables
           * - body variables
           * - static buttons
           *
           * Media headers and dynamic URL
           * buttons can be added afterward.
           */

          if (
            header &&
            headerFormat !==
              'TEXT'
          ) {
            supported =
              false;

            unsupportedReason =
              'Media-header templates are not supported in the CRM yet.';
          }

          if (
            hasUnsupportedVariables(
              headerText
            ) ||
            hasUnsupportedVariables(
              bodyText
            )
          ) {
            supported =
              false;

            unsupportedReason =
              'Named template parameters are not supported yet.';
          }

          const dynamicUrl =
            buttons?.buttons?.some(
              (button) =>
                button.url?.includes(
                  '{{'
                )
            );

          if (dynamicUrl) {
            supported =
              false;

            unsupportedReason =
              'Dynamic URL button templates are not supported yet.';
          }

          return {
            id:
              template.id ??
              `${template.name}-${template.language}`,

            name:
              template.name ??
              '',

            language:
              template.language ??
              'en',

            category:
              template.category ??
              'UNKNOWN',

            headerText,

            bodyText,

            footerText,

            headerVariableCount:
              countPositionalVariables(
                headerText
              ),

            bodyVariableCount:
              countPositionalVariables(
                bodyText
              ),

            supported,

            unsupportedReason,
          };
        }
      )
      .filter(
        (template) =>
          Boolean(
            template.name
          )
      )
      .sort(
        (a, b) =>
          a.name.localeCompare(
            b.name
          )
      );

  return {
    templates,
    error: null,
  };
}