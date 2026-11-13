/**
 * Fail-closed audit for WhatsApp template variables.
 *
 * Meta supports named and positional template variables, but SalsysOS
 * currently resolves only positional parameters. Never mistake an
 * unsupported {{...}} token for a static, zero-variable template.
 *
 * This module has no network, database or send side effects.
 */
type TemplateComponent = {
  type?: unknown;
  text?: unknown;
  format?: unknown;
};

export type WhatsAppVariableAudit = {
  supported: boolean;
  reason: string | null;
  headerVariableCount: number;
  bodyVariableCount: number;
  headerFormat: string;
  syntax: 'none' | 'positional' | 'unsupported';
};

function inspectSection(text: string) {
  const placeholders = [...text.matchAll(/\{\{([^{}]*)\}\}/g)];
  const stripped = text.replace(/\{\{[^{}]*\}\}/g, '');
  if (stripped.includes('{{') || stripped.includes('}}')) {
    return { count: 0, reason: 'malformed_template_placeholder' };
  }

  if (placeholders.some(match => !/^[1-9]\d*$/.test(match[1] ?? ''))) {
    return { count: 0, reason: 'unsupported_named_or_dotted_placeholder' };
  }

  const positions = [...new Set(placeholders.map(match => Number(match[1])))].sort((a, b) => a - b);
  if (positions.length > 20 || positions.some((value, index) => value !== index + 1)) {
    return { count: 0, reason: 'noncontiguous_template_placeholders' };
  }
  return { count: positions.length, reason: null };
}

export function auditWhatsAppTemplateVariables(components: unknown): WhatsAppVariableAudit {
  const blocked = (reason: string): WhatsAppVariableAudit => ({
    supported: false, reason,
    headerVariableCount: 0, bodyVariableCount: 0,
    headerFormat: 'UNKNOWN', syntax: 'unsupported',
  });

  if (!Array.isArray(components)) return blocked('template_components_missing');
  const list = components.filter(
    (item): item is TemplateComponent =>
      typeof item === 'object' && item !== null && !Array.isArray(item),
  );
  const header = list.find(item => String(item.type ?? '').toUpperCase() === 'HEADER');
  const body = list.find(item => String(item.type ?? '').toUpperCase() === 'BODY');

  if (!body || typeof body.text !== 'string') return blocked('template_body_missing');
  if (header && typeof header.text !== 'string' && String(header.format ?? 'TEXT').toUpperCase() === 'TEXT') {
    return blocked('text_header_missing');
  }

  const headerFormat = String(header?.format ?? 'TEXT').toUpperCase();
  const headerParams = inspectSection(typeof header?.text === 'string' ? header.text : '');
  const bodyParams = inspectSection(body.text);

  if (headerParams.reason || bodyParams.reason) {
    return blocked(headerParams.reason || bodyParams.reason || 'unsupported_template_placeholder');
  }

  return {
    supported: true, reason: null,
    headerVariableCount: headerParams.count,
    bodyVariableCount: bodyParams.count,
    headerFormat,
    syntax: headerParams.count || bodyParams.count ? 'positional' : 'none',
  };
}

/**
 * The prepared send must match the exact current Meta-synchronized template.
 * Guard before making any Meta HTTP request, including for old campaigns.
 */
export function validateWhatsAppTemplateSendParameters(
  audit: WhatsAppVariableAudit,
  requestedComponents: unknown,
): boolean {
  if (!audit.supported) return false;
  if (requestedComponents !== undefined && !Array.isArray(requestedComponents)) return false;
  const components = (requestedComponents ?? []) as unknown[];
  if (components.some(component => !component || typeof component !== 'object' || Array.isArray(component))) {
    return false;
  }
  const parameterCounts = new Map<string, number>();
  for (const raw of components) {
    const component = raw as Record<string, unknown>;
    const type = String(component.type ?? '').toLowerCase();
    if (!['header', 'body'].includes(type) || parameterCounts.has(type) || !Array.isArray(component.parameters)) {
      return false;
    }
    const values = component.parameters;
    if (values.some(value => {
      if (!value || typeof value !== 'object' || Array.isArray(value)) return true;
      const item = value as Record<string, unknown>;
      return item.type !== 'text' || typeof item.text !== 'string'
        || !item.text.trim() || item.text.length > 1024
        || /[\u0000-\u001f\u007f]|\{\{|\}\}/.test(item.text);
    })) return false;
    parameterCounts.set(type, values.length);
  }
  return (parameterCounts.get('header') ?? 0) === audit.headerVariableCount
    && (parameterCounts.get('body') ?? 0) === audit.bodyVariableCount
    && (!parameterCounts.has('header') || audit.headerVariableCount > 0)
    && (!parameterCounts.has('body') || audit.bodyVariableCount > 0);
}
