import 'server-only';

import { getWhatsAppRuntimeForOrganization } from '@/lib/integrations/whatsapp-connection';
import { syncWhatsAppTemplatesForOrganization } from '@/lib/integrations/whatsapp-template-sync';

const DEFAULT_WHATSAPP_API_VERSION = 'v26.0';

export type CreateWhatsAppTemplateInput = {
  name: string;
  language: string;
  category: 'UTILITY' | 'MARKETING' | 'AUTHENTICATION';
  headerText?: string;
  bodyText: string;
  footerText?: string;
};

type MetaTemplateCreateResponse = {
  id?: string;
  status?: string;
  category?: string;
  error?: {
    message?: string;
    type?: string;
    code?: number;
    error_subcode?: number;
    error_user_title?: string;
    error_user_msg?: string;
  };
};

export type CreateWhatsAppTemplateResult = {
  ok: boolean;
  templateId: string | null;
  status: string | null;
  category: string | null;
  syncOk: boolean;
  error: string | null;
};

function apiVersion() {
  const value = process.env.WA_API_VERSION?.trim() || DEFAULT_WHATSAPP_API_VERSION;
  return /^v\d+\.\d+$/.test(value) ? value : DEFAULT_WHATSAPP_API_VERSION;
}

function normalizeName(value: string) {
  return value.trim().toLowerCase();
}

function validateInput(input: CreateWhatsAppTemplateInput) {
  const name = normalizeName(input.name);
  const language = input.language.trim();
  const headerText = input.headerText?.trim() || '';
  const bodyText = input.bodyText.trim();
  const footerText = input.footerText?.trim() || '';

  if (!/^[a-z0-9_]{1,512}$/.test(name)) {
    throw new Error('Template name must use lowercase letters, numbers, and underscores only.');
  }

  if (!/^[A-Za-z]{2,3}(?:_[A-Za-z]{2,4})?$/.test(language)) {
    throw new Error('Choose a valid WhatsApp template language code.');
  }

  if (!['UTILITY', 'MARKETING', 'AUTHENTICATION'].includes(input.category)) {
    throw new Error('Choose a valid WhatsApp template category.');
  }

  if (!bodyText) {
    throw new Error('Template body is required.');
  }

  if (bodyText.length > 1024) {
    throw new Error('Template body must be 1,024 characters or fewer.');
  }

  if (headerText.length > 60) {
    throw new Error('Template header must be 60 characters or fewer.');
  }

  if (footerText.length > 60) {
    throw new Error('Template footer must be 60 characters or fewer.');
  }

  if ([headerText, bodyText, footerText].some((text) => /\{\{[^}]+\}\}/.test(text))) {
    throw new Error('Template variables are not supported in this first creation flow. Create a static text template for now.');
  }

  return {
    name,
    language,
    category: input.category,
    headerText,
    bodyText,
    footerText,
  };
}

function providerError(payload: MetaTemplateCreateResponse, status: number) {
  const title = payload.error?.error_user_title?.trim();
  const userMessage = payload.error?.error_user_msg?.trim();
  const message = payload.error?.message?.trim();
  const code = payload.error?.code;
  const subcode = payload.error?.error_subcode;

  const parts = [title, userMessage, message].filter(Boolean);
  if (!parts.length) parts.push(`Meta returned HTTP ${status}.`);
  if (typeof code === 'number') parts.push(`code=${code}`);
  if (typeof subcode === 'number') parts.push(`subcode=${subcode}`);
  return Array.from(new Set(parts)).join(' ');
}

export async function createWhatsAppTemplateForOrganization(
  organizationId: string,
  input: CreateWhatsAppTemplateInput,
): Promise<CreateWhatsAppTemplateResult> {
  const resolvedOrganizationId = organizationId?.trim();

  if (!resolvedOrganizationId) {
    return {
      ok: false,
      templateId: null,
      status: null,
      category: null,
      syncOk: false,
      error: 'organizationId is required.',
    };
  }

  try {
    const validated = validateInput(input);
    const runtime = await getWhatsAppRuntimeForOrganization(resolvedOrganizationId);

    const components: Array<Record<string, unknown>> = [];

    if (validated.headerText) {
      components.push({
        type: 'HEADER',
        format: 'TEXT',
        text: validated.headerText,
      });
    }

    components.push({
      type: 'BODY',
      text: validated.bodyText,
    });

    if (validated.footerText) {
      components.push({
        type: 'FOOTER',
        text: validated.footerText,
      });
    }

    const response = await fetch(
      `https://graph.facebook.com/${apiVersion()}/${encodeURIComponent(runtime.wabaId)}/message_templates`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${runtime.accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: validated.name,
          language: validated.language,
          category: validated.category,
          allow_category_change: true,
          components,
        }),
        cache: 'no-store',
      },
    );

    const responseText = await response.text();
    let payload: MetaTemplateCreateResponse = {};

    try {
      payload = responseText ? JSON.parse(responseText) : {};
    } catch {
      payload = {};
    }

    if (!response.ok || !payload.id) {
      throw new Error(providerError(payload, response.status));
    }

    const sync = await syncWhatsAppTemplatesForOrganization(resolvedOrganizationId);

    return {
      ok: true,
      templateId: payload.id,
      status: payload.status?.trim() || 'PENDING',
      category: payload.category?.trim() || validated.category,
      syncOk: sync.ok,
      error: null,
    };
  } catch (error) {
    return {
      ok: false,
      templateId: null,
      status: null,
      category: null,
      syncOk: false,
      error: error instanceof Error ? error.message : 'Unable to create WhatsApp template.',
    };
  }
}
