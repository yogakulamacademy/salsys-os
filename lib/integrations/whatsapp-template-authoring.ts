import 'server-only';

import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';
import { getWhatsAppRuntimeForOrganization } from '@/lib/integrations/whatsapp-connection';
import { getWorkspaceContextForUser } from '@/lib/workspace';

export type TemplateAuthoringInput = {
  name: string;
  language: string;
  category: 'MARKETING' | 'UTILITY';
  header: string;
  body: string;
  footer: string;
  buttonType: 'none' | 'quick_reply' | 'url';
  buttonText: string;
  buttonUrl: string;
  examples: Record<string, string>;
};

export class TemplateAuthoringError extends Error {
  constructor(message: string, public readonly status = 400) {
    super(message);
    this.name = 'TemplateAuthoringError';
  }
}

const text = (value: unknown) => typeof value === 'string' ? value.trim() : '';
const asObject = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};

export function validateTemplateAuthoringInput(raw: unknown, forSubmission: boolean): TemplateAuthoringInput {
  const data = asObject(raw);
  const name = text(data.name);
  const language = text(data.language);
  const category = text(data.category);
  const header = text(data.header);
  const body = text(data.body);
  const footer = text(data.footer);
  const buttonType = text(data.buttonType) || 'none';
  const buttonText = text(data.buttonText);
  const buttonUrl = text(data.buttonUrl);
  const examplesRaw = asObject(data.examples);
  const examples: Record<string, string> = {};

  if (!/^[a-z0-9_]{1,512}$/.test(name)) {
    throw new TemplateAuthoringError('Use a lowercase template name with letters, numbers and underscores.');
  }
  if (!/^[a-z]{2,3}(?:_[A-Z]{2})?$/.test(language)) {
    throw new TemplateAuthoringError('Choose a supported language code.');
  }
  if (category !== 'MARKETING' && category !== 'UTILITY') {
    throw new TemplateAuthoringError('This authoring version supports Marketing and Utility templates only.');
  }
  if (!body || body.length > 1024 || header.length > 60 || footer.length > 60) {
    throw new TemplateAuthoringError('Body is required (up to 1024 characters); header and footer must be at most 60.');
  }
  if (/\{\{/.test(header + footer)) {
    throw new TemplateAuthoringError('Header and footer variables are not supported in this version.');
  }
  if (!['none', 'quick_reply', 'url'].includes(buttonType)) {
    throw new TemplateAuthoringError('Unsupported template button type.');
  }
  if (buttonType !== 'none' && (!buttonText || buttonText.length > 25 || /\{\{/.test(buttonText))) {
    throw new TemplateAuthoringError('Enter a static button label of 1–25 characters.');
  }
  if (buttonType === 'url') {
    try {
      const parsed = new URL(buttonUrl);
      if (parsed.protocol !== 'https:' || !parsed.hostname || buttonUrl.length > 2000) {
        throw new Error('Invalid URL');
      }
    } catch {
      throw new TemplateAuthoringError('Template URL buttons require a valid HTTPS URL.');
    }
  }

  const matches = [...body.matchAll(/\{\{(\d+)\}\}/g)];
  const indexes = [...new Set(matches.map((match) => Number(match[1])))].sort((a, b) => a - b);
  const stripped = body.replace(/\{\{(\d+)\}\}/g, '');
  if (stripped.includes('{{') || stripped.includes('}}') ||
      indexes.length > 10 || indexes.some((n, index) => n !== index + 1)) {
    throw new TemplateAuthoringError('Use consecutive positional variables {{1}}, {{2}}, up to {{10}}.');
  }
  for (const index of indexes) {
    const value = text(examplesRaw[String(index)]);
    if (forSubmission && !value) {
      throw new TemplateAuthoringError('Provide a nonempty example for every variable before Meta review.');
    }
    if (value.length > 256) {
      throw new TemplateAuthoringError('Variable examples must be 256 characters or fewer.');
    }
    examples[String(index)] = value;
  }

  return {
    name, language,
    category: category as 'MARKETING' | 'UTILITY',
    header, body, footer,
    buttonType: buttonType as TemplateAuthoringInput['buttonType'],
    buttonText: buttonType === 'none' ? '' : buttonText,
    buttonUrl: buttonType === 'url' ? buttonUrl : '',
    examples,
  };
}

export function buildMetaTemplateComponents(data: TemplateAuthoringInput) {
  const components: Record<string, unknown>[] = [];
  if (data.header) components.push({ type: 'HEADER', format: 'TEXT', text: data.header });
  const ids = [...new Set([...data.body.matchAll(/\{\{(\d+)\}\}/g)].map(x => Number(x[1])))].sort((a, b) => a - b);
  components.push({
    type: 'BODY',
    text: data.body,
    ...(ids.length ? { example: { body_text: [ids.map(n => data.examples[String(n)])] } } : {}),
  });
  if (data.footer) components.push({ type: 'FOOTER', text: data.footer });
  if (data.buttonType !== 'none') {
    components.push({
      type: 'BUTTONS',
      buttons: [{
        type: data.buttonType === 'url' ? 'URL' : 'QUICK_REPLY',
        text: data.buttonText,
        ...(data.buttonType === 'url' ? { url: data.buttonUrl } : {}),
      }],
    });
  }
  return components;
}

export async function authorizeTemplateManager() {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) throw new TemplateAuthoringError('Sign in to manage templates.', 401);

  const { data: profile, error: profileError } = await supabase
    .from('profiles').select('id,active').eq('id', user.id).maybeSingle();
  if (profileError || !profile || profile.active !== true) {
    throw new TemplateAuthoringError('Your CRM account is inactive.', 403);
  }
  const context = await getWorkspaceContextForUser(supabase, user.id);
  const workspace = context.activeWorkspace;
  if (!workspace || !['owner', 'admin'].includes(workspace.role)) {
    throw new TemplateAuthoringError('Workspace admin access is required.', 403);
  }
  const { data: mayManage, error: permissionError } = await supabase.rpc(
    'can_manage_organization', { p_organization_id: workspace.organizationId },
  );
  if (permissionError || mayManage !== true) {
    throw new TemplateAuthoringError('Template management permission was not verified.', 403);
  }

  const admin = createAdminClient();
  const runtime = await getWhatsAppRuntimeForOrganization(workspace.organizationId);
  const { data: account, error: accountError } = await admin.from('whatsapp_accounts')
    .select('id,organization_id')
    .eq('organization_id', workspace.organizationId)
    .eq('phone_number_id', runtime.phoneNumberId)
    .eq('connection_id', runtime.connectionId)
    .eq('is_default', true)
    .eq('active', true)
    .maybeSingle();
  if (accountError || !account?.id || account.organization_id !== workspace.organizationId) {
    throw new TemplateAuthoringError('Connected default WhatsApp sender could not be verified.', 409);
  }
  return {
    admin,
    userId: user.id,
    organizationId: workspace.organizationId,
    accountId: String(account.id),
    wabaId: runtime.wabaId,
    accessToken: runtime.accessToken,
  };
}

export async function postMetaTemplate(
  wabaId: string,
  accessToken: string,
  data: TemplateAuthoringInput,
): Promise<{ id: string | null; status: string | null }> {
  const configuredVersion = process.env.WA_API_VERSION?.trim() || 'v26.0';
  const version = /^v\d+\.\d+$/.test(configuredVersion) ? configuredVersion : 'v26.0';
  const response = await fetch(
    'https://graph.facebook.com/' + version + '/' + encodeURIComponent(wabaId) + '/message_templates',
    {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + accessToken, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: data.name, language: data.language, category: data.category,
        components: buildMetaTemplateComponents(data),
      }),
      cache: 'no-store',
      signal: AbortSignal.timeout(12000),
    },
  );
  const payload = await response.json().catch(() => ({})) as {
    id?: string; status?: string; error?: { message?: string; code?: number };
  };
  if (!response.ok) {
    // Do not reflect provider error text containing arbitrary external data to the client.
    const code = Number(payload.error?.code ?? response.status);
    // A clear 4xx response is definitive; rate limits and 5xx may be ambiguous.
    throw new TemplateAuthoringError(
      'Meta declined the template request (code ' + code + '). Review content and provider logs.',
      response.status === 429 || response.status >= 500 ? 502 : 422,
    );
  }
  return { id: typeof payload.id === 'string' ? payload.id : null, status: typeof payload.status === 'string' ? payload.status : null };
}
