// Parses chat exports uploaded by a manager so conversation learning can use
// the team's side of past conversations. Nothing here stores raw chats: the
// caller turns the parsed messages into learning insights and discards them.
//
// Supported today: WhatsApp Business "Business AI information report"
// (zip or .txt files with `You:` / `Business:` / `Bot:` / `Context:` lines).

import { inflateRawSync } from 'node:zlib';

import type { ConversationOutcome, LearningMessage } from './conversation-learning';

export type ExportFile = { name: string; text: string };

export const MAX_EXPORT_FILES = 2000;
export const MAX_EXPORT_UNCOMPRESSED_BYTES = 40 * 1024 * 1024;

/** Minimal zip reader (stored + deflate entries) with size limits. */
export function readZipTextEntries(buffer: Buffer): ExportFile[] {
  const EOCD = 0x06054b50;
  let eocd = -1;
  for (let i = buffer.length - 22; i >= Math.max(0, buffer.length - 65557); i -= 1) {
    if (buffer.readUInt32LE(i) === EOCD) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error('Not a zip file.');
  const count = buffer.readUInt16LE(eocd + 10);
  let offset = buffer.readUInt32LE(eocd + 16);
  if (count > MAX_EXPORT_FILES) throw new Error('The export has too many files.');
  const files: ExportFile[] = [];
  let total = 0;
  for (let n = 0; n < count; n += 1) {
    if (buffer.readUInt32LE(offset) !== 0x02014b50) throw new Error('Corrupt zip directory.');
    const method = buffer.readUInt16LE(offset + 10);
    const compressedSize = buffer.readUInt32LE(offset + 20);
    const size = buffer.readUInt32LE(offset + 24);
    const nameLength = buffer.readUInt16LE(offset + 28);
    const extraLength = buffer.readUInt16LE(offset + 30);
    const commentLength = buffer.readUInt16LE(offset + 32);
    const localOffset = buffer.readUInt32LE(offset + 42);
    const name = buffer.subarray(offset + 46, offset + 46 + nameLength).toString('utf8');
    offset += 46 + nameLength + extraLength + commentLength;
    if (name.endsWith('/') || !/\.txt$/i.test(name)) continue;
    total += size;
    if (total > MAX_EXPORT_UNCOMPRESSED_BYTES) throw new Error('The export is too large.');
    const localNameLength = buffer.readUInt16LE(localOffset + 26);
    const localExtraLength = buffer.readUInt16LE(localOffset + 28);
    const start = localOffset + 30 + localNameLength + localExtraLength;
    const data = buffer.subarray(start, start + compressedSize);
    let content: Buffer;
    if (method === 0) content = data;
    else if (method === 8) content = inflateRawSync(data, { maxOutputLength: Math.max(size, 1) });
    else continue;
    files.push({ name, text: content.toString('utf8') });
  }
  return files;
}

const SPEAKER = /^(You|Business|Bot|Context):\s?(.*)$/;
const LEAD_PAID = /(payment (is )?(done|made|completed)|i'?ve paid|i have paid|\bpaid\b|transaction (id|done|successful)|payment screenshot|transferred the (fee|amount))/i;
const TEAM_CONFIRMED = /(payment (received|confirmed)|received (the|your) payment|seat (is )?(confirmed|reserved)|enrol+ment (is )?confirmed)/i;
const TEST_CHAT = /\btest@|\btesting\b/i;

export type WhatsAppReportResult = {
  conversations: number;
  skippedTestConversations: number;
  messages: LearningMessage[];
  outcomes: Map<string, ConversationOutcome>;
  faqs: Array<{ question: string; answer: string }>;
};

export function isWhatsAppBusinessAiReport(files: ExportFile[]): boolean {
  return files.some((f) => /conversations\/conversation_\d+\.txt$/i.test(f.name) || /^AI at Meta Settings:/m.test(f.text));
}

/** Parses the report. Exports have no timestamps, so order is kept by sequence only. */
export function parseWhatsAppBusinessAiReport(files: ExportFile[]): WhatsAppReportResult {
  const messages: LearningMessage[] = [];
  const outcomes = new Map<string, ConversationOutcome>();
  let conversations = 0;
  let skipped = 0;
  for (const file of files) {
    if (!/conversation_\d+\.txt$/i.test(file.name)) continue;
    const id = `wa-export:${file.name.replace(/^.*\//, '').replace(/\.txt$/i, '')}`;
    const turns: Array<{ who: string; text: string }> = [];
    let current: { who: string; text: string } | null = null;
    for (const line of file.text.split(/\r?\n/)) {
      const match = SPEAKER.exec(line);
      if (match) {
        current = { who: match[1], text: match[2] };
        turns.push(current);
      } else if (current) {
        current.text += `\n${line}`;
      }
    }
    const usable = turns
      .filter((t) => t.who !== 'Context')
      .map((t) => ({ who: t.who, text: t.text.trim() }))
      .filter((t) => t.text && t.text !== '<Unsupported Message>');
    if (!usable.length) continue;
    if (usable.some((t) => TEST_CHAT.test(t.text))) { skipped += 1; continue; }
    conversations += 1;
    let paid = false;
    usable.forEach((turn, index) => {
      const inbound = turn.who === 'You';
      if (inbound && LEAD_PAID.test(turn.text)) paid = true;
      if (!inbound && TEAM_CONFIRMED.test(turn.text)) paid = true;
      messages.push({
        conversationId: id,
        direction: inbound ? 'inbound' : 'outbound',
        body: turn.text,
        messageType: 'text',
        // No timestamps in this export: a sortable sequence key, not a real time.
        createdAt: `seq:${String(index).padStart(6, '0')}`,
      });
    });
    outcomes.set(id, paid ? 'won' : 'open');
  }

  const faqs: Array<{ question: string; answer: string }> = [];
  const settings = files.find((f) => /^AI at Meta Settings:/m.test(f.text));
  if (settings) {
    const faqPart = settings.text.split(/^FAQs:\s*$/m)[1] ?? '';
    for (const block of faqPart.split(/\n(?=Question:)/)) {
      const match = /^Question:\s*([\s\S]+?)\n\s*\nAnswer:\s*([\s\S]+)$/.exec(block.trim());
      if (match) faqs.push({ question: match[1].trim(), answer: match[2].trim() });
    }
  }
  return { conversations, skippedTestConversations: skipped, messages, outcomes, faqs };
}
