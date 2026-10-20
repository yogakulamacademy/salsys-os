import 'server-only';

export type WhatsAppTemplateBinding = {
  source: string;
  value?: string;
};

export type WhatsAppTemplateBindings = {
  header: WhatsAppTemplateBinding[];
  body: WhatsAppTemplateBinding[];
};

export const WHATSAPP_BINDING_SOURCES = [
  'lead.first_name',
  'lead.last_name',
  'lead.display_name',
  'lead.lead_code',
  'lead.country',
  'lead.preferred_location',
  'lead.preferred_mode',
  'lead.preferred_month',
  'course.name',
  'campaign.name',
] as const;

const allowedSources = new Set<string>(WHATSAPP_BINDING_SOURCES);

function parseBindingValue(rawValue: string): WhatsAppTemplateBinding {
  const value = rawValue.trim();
  if (!value) throw new Error('Template binding values cannot be empty.');

  if (value.startsWith('constant:')) {
    const constant = value.slice('constant:'.length).trim();
    if (!constant) throw new Error('constant: bindings require a non-empty value.');
    if (constant.length > 500) throw new Error('Template constant values are limited to 500 characters.');
    return { source: 'constant', value: constant };
  }

  if (!allowedSources.has(value)) {
    throw new Error(
      `Unsupported template binding source “${value}”. Use a supported lead/course/campaign field or constant:<value>.`,
    );
  }

  return { source: value };
}

export function parseWhatsAppTemplateBindings(raw: string): WhatsAppTemplateBindings {
  const result: WhatsAppTemplateBindings = { header: [], body: [] };
  const trimmed = raw.trim();
  if (!trimmed) return result;

  const indexed: Record<'header' | 'body', Map<number, WhatsAppTemplateBinding>> = {
    header: new Map(),
    body: new Map(),
  };

  for (const [lineIndex, rawLine] of trimmed.split(/\r?\n/).entries()) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;

    const equals = line.indexOf('=');
    if (equals < 1) {
      throw new Error(`Invalid template binding on line ${lineIndex + 1}. Use body.1=lead.first_name.`);
    }

    const key = line.slice(0, equals).trim().toLowerCase();
    const value = line.slice(equals + 1).trim();
    const match = /^(header|body)\.(\d+)$/.exec(key);
    if (!match) {
      throw new Error(`Invalid template binding key “${key}”. Use header.N or body.N.`);
    }

    const section = match[1] as 'header' | 'body';
    const position = Number(match[2]);
    if (!Number.isInteger(position) || position < 1 || position > 20) {
      throw new Error('Template binding positions must be between 1 and 20.');
    }
    if (indexed[section].has(position)) {
      throw new Error(`Duplicate template binding ${section}.${position}.`);
    }

    indexed[section].set(position, parseBindingValue(value));
  }

  for (const section of ['header', 'body'] as const) {
    const positions = [...indexed[section].keys()].sort((left, right) => left - right);
    if (positions.length && positions.some((position, index) => position !== index + 1)) {
      throw new Error(`${section} bindings must be contiguous starting at ${section}.1.`);
    }
    result[section] = positions.map((position) => indexed[section].get(position)!);
  }

  return result;
}

export function normalizeReplyRoutingMode(value: string) {
  return [
    'preserve_owner',
    'campaign_creator_if_unassigned',
    'round_robin_if_unassigned',
  ].includes(value)
    ? value
    : 'preserve_owner';
}

export function normalizeRoutingUserIds(values: string[]) {
  return Array.from(
    new Set(
      values
        .map((value) => value.trim())
        .filter((value) => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)),
    ),
  ).slice(0, 50);
}
