import {
  prepareWebsiteEvidence,
  type VisibleWebsiteBlock,
  type VisibleBlockKind,
  type WebsiteEvidenceResult,
} from './website-evidence';

/**
 * KB-02B: deliberately conservative, bounded HTML text extraction.
 * This is a fail-closed subset parser, NOT a replacement for a standards-
 * compliant HTML5 parser. Only explicitly supported structures are emitted.
 * It makes no network, AI, or database calls.
 */
type ElementNode = { tag: string; attrs: Record<string, string>; children: Node[] };
type TextNode = { text: string };
type Node = ElementNode | TextNode;
type Parsed = { ok: true; root: ElementNode } | { ok: false; error: string };
export type HtmlBlockResult =
  | { ok: true; pageTitle: string; blocks: VisibleWebsiteBlock[] }
  | { ok: false; error: string };

const MAX_BYTES = 512 * 1024;
const MAX_TAG_BYTES = 4096;
const MAX_NODES = 20_000;
const MAX_DEPTH = 60;
const MAX_BLOCKS = 250;
const MAX_TEXT = 100_000;
const voidTags = new Set([
  'area','base','br','col','embed','hr','img','input','link','meta',
  'param','source','track','wbr',
]);
const rawTags = new Set(['script','style','textarea','title','xmp','iframe','noembed','noframes']);
const ignoreTags = new Set([
  'head','nav','footer','header','aside','form','script','style',
  'noscript','template','svg','canvas','iframe','object','textarea',
  'select','option','button','dialog','xmp','noembed','noframes',
]);
const blockTags = new Set([
  'h1','h2','h3','h4','h5','h6','p','li','dt','dd','summary',
  'blockquote','tr','table','ul','ol','dl','section','article','div',
]);
const named = new Map(Object.entries({
  amp:'&',lt:'<',gt:'>',quot:'"',apos:"'",nbsp:' ',copy:'©',reg:'®',
  trade:'™',ndash:'–',mdash:'—',hellip:'…',lsquo:'‘',rsquo:'’',
  ldquo:'“',rdquo:'”',bull:'•',middot:'·',euro:'€',pound:'£',
  yen:'¥',times:'×',laquo:'«',raquo:'»',
}));

function decodeHtml(input: string): string | null {
  let invalid = false;
  const result = input.replace(/&(#(?:x[0-9a-f]+|[0-9]+)|[a-z][a-z0-9]*);/gi, (original, entity: string) => {
    if (entity.startsWith('#')) {
      const hex = /^#x/i.test(entity);
      const value = Number.parseInt(entity.slice(hex ? 2 : 1), hex ? 16 : 10);
      if (!Number.isInteger(value) || value <= 0 || value > 0x10ffff ||
          (value >= 0xd800 && value <= 0xdfff)) {
        invalid = true; return original;
      }
      return String.fromCodePoint(value);
    }
    const decoded = named.get(entity.toLowerCase());
    if (decoded === undefined) { invalid = true; return original; }
    return decoded;
  });
  return invalid ? null : result;
}

function openingEnd(input: string, from: number): number {
  let quote = '';
  const end = Math.min(input.length, from + MAX_TAG_BYTES);
  for (let i = from + 1; i < end; i++) {
    const char = input[i];
    if (quote) {
      if (char === quote) quote = '';
    } else if (char === '"' || char === "'") quote = char;
    else if (char === '>') return i;
  }
  return -1;
}

function attributes(input: string): Record<string, string> | null {
  const attrs: Record<string, string> = {};
  let i = 0;
  while (i < input.length) {
    while (i < input.length && /\s/.test(input[i])) i++;
    if (i >= input.length || input[i] === '/') break;
    const start = i;
    while (i < input.length && /[^\s=/>]/.test(input[i])) i++;
    if (i === start) return null;
    const key = input.slice(start, i).toLowerCase();
    if (!/^[a-z_:][a-z0-9_:.-]*$/.test(key)) return null;
    while (i < input.length && /\s/.test(input[i])) i++;
    let value = '';
    if (input[i] === '=') {
      i++;
      while (i < input.length && /\s/.test(input[i])) i++;
      if (input[i] === '"' || input[i] === "'") {
        const quote = input[i++];
        const startValue = i;
        while (i < input.length && input[i] !== quote) i++;
        if (i === input.length) return null;
        value = input.slice(startValue, i++);
      } else {
        const startValue = i;
        while (i < input.length && /[^\s>]/.test(input[i])) i++;
        if (i === startValue) return null;
        value = input.slice(startValue, i);
      }
    }
    const decoded = decodeHtml(value);
    if (decoded === null) return null;
    // Duplicate attributes are ambiguous and rejected rather than guessed.
    if (Object.hasOwn(attrs,key)) return null;
    attrs[key] = decoded;
  }
  return attrs;
}

function parseBounded(html: string): Parsed {
  if (typeof html !== 'string' || Buffer.byteLength(html, 'utf8') > MAX_BYTES) {
    return { ok:false, error:'html_size_limit' };
  }
  const root: ElementNode = { tag:'root',attrs:{},children:[] };
  const stack = [root];
  const lower = html.toLowerCase();
  let index = 0;
  let nodes = 0;
  while (index < html.length) {
    if (++nodes > MAX_NODES) return { ok:false, error:'html_node_limit' };
    if (html.startsWith('<!--',index)) {
      const end = html.indexOf('-->',index+4);
      if (end < 0) return { ok:false, error:'malformed_html' };
      index = end+3;continue;
    }
    if (html[index] !== '<') {
      const end = html.indexOf('<',index);
      const textEnd = end < 0 ? html.length : end;
      const decoded = decodeHtml(html.slice(index,textEnd));
      if (decoded === null) return { ok:false, error:'unsupported_html_entity' };
      if (decoded) stack[stack.length-1].children.push({text:decoded});
      index = textEnd;continue;
    }
    const end = openingEnd(html,index);
    if (end < 0) return { ok:false, error:'malformed_html' };
    const inside = html.slice(index+1,end).trim();
    index = end+1;
    if (/^!doctype\b/i.test(inside) || inside.startsWith('?')) continue;
    if (inside.startsWith('!')) return { ok:false, error:'malformed_html' };
    const closing = inside.startsWith('/');
    const tagBody = closing ? inside.slice(1).trim() : inside;
    const match = /^([a-z][a-z0-9:-]*)(?=\s|\/|$)/i.exec(tagBody);
    if (!match) return { ok:false, error:'malformed_html' };
    const tag = match[1].toLowerCase();
    if (tag.includes(':')) return { ok:false, error:'unsupported_html_namespace' };
    if (closing) {
      if (tagBody.slice(match[0].length).trim()) return {ok:false,error:'malformed_html'};
      const at = stack.findLastIndex(node=>node.tag === tag);
      if (at >= 1) stack.length = at;
      continue;
    }
    const rest = tagBody.slice(match[0].length);
    const selfClosing = /\/\s*$/.test(rest);
    const attrs = attributes(selfClosing ? rest.replace(/\/\s*$/, '') : rest);
    if (!attrs) return { ok:false, error:'malformed_html_attributes' };
    // Common omitted closing tags handled explicitly; other ambiguity is
    // left intact rather than claiming browser-accurate repair.
    if (['p','li','dt','dd','tr','td','th'].includes(tag)) {
      const same = stack.findLastIndex(node => node.tag === tag);
      if (same >= 1) stack.length = same;
    }
    const node: ElementNode = { tag,attrs,children:[] };
    stack[stack.length-1].children.push(node);
    if (voidTags.has(tag) || selfClosing) {
      if (tag === 'br') stack[stack.length-1].children.push({text:' '});
      continue;
    }
    if (stack.length > MAX_DEPTH) return { ok:false,error:'html_depth_limit' };
    stack.push(node);
    if (rawTags.has(tag)) {
      const close = '</'+tag;
      const rawEnd = lower.indexOf(close,index);
      if (rawEnd < 0) return { ok:false, error:'malformed_raw_text' };
      const raw = html.slice(index,rawEnd);
      if (tag === 'title') {
        const decoded = decodeHtml(raw);
        if (decoded === null) return { ok:false, error:'unsupported_html_entity' };
        node.children.push({text:decoded});
      }
      index = rawEnd;
    }
  }
  return { ok:true,root };
}

function element(node: Node): node is ElementNode {
  return 'tag' in node;
}

function excluded(node: ElementNode): boolean {
  if (ignoreTags.has(node.tag)) return true;
  const attrs = node.attrs;
  if ('hidden' in attrs || 'inert' in attrs ||
      attrs['aria-hidden']?.toLowerCase() === 'true') return true;
  if (['navigation','banner','contentinfo','dialog','search','form'].includes((attrs.role ?? '').toLowerCase())) return true;
  if (/(?:^|;)\s*(?:display\s*:\s*none|visibility\s*:\s*hidden)\s*(?:!important)?\s*(?:;|$)/i.test(attrs.style ?? '')) return true;
  if (/(?:^|[\s_-])(?:cookie|consent|modal|popup|hidden)(?:[\s_-]|$)/i.test(
    (attrs.class ?? '')+' '+(attrs.id ?? ''))) return true;
  return false;
}

function visibleText(node: Node, omitBlocks = false): string {
  if (!element(node)) return node.text;
  if (excluded(node)) return '';
  if (omitBlocks && blockTags.has(node.tag)) return '';
  // DOM-like text concatenation preserves literal punctuation and number
  // formatting. Layout whitespace is normalized by the evidence contract.
  return node.children.map(child=>visibleText(child,omitBlocks)).join('');
}

function descendantsHaveBlocks(node: ElementNode): boolean {
  return node.children.some(child=>element(child) &&
    !excluded(child) && (blockTags.has(child.tag) || descendantsHaveBlocks(child)));
}

export function extractVisibleWebsiteBlocks(html: string): HtmlBlockResult {
  const parsed = parseBounded(html);
  if (!parsed.ok) return parsed;
  const blocks: VisibleWebsiteBlock[] = [];
  let pageTitle = '';
  let length = 0;
  let exceeded = false;
  let titleFound = false;
  const append = (kind: VisibleBlockKind,text: string) => {
    const normalized = text.replace(/\s+/gu,' ').trim();
    if (!normalized) return;
    length += normalized.length;
    if (length > MAX_TEXT || blocks.length >= MAX_BLOCKS || normalized.length > 6000) {
      exceeded = true; return;
    }
    blocks.push({kind,text:normalized});
  };
  const visit = (node: Node,insideTable = false) => {
    if (exceeded || !element(node)) return;
    if (node.tag === 'title' && !titleFound) {
      pageTitle = visibleText(node).replace(/\s+/gu,' ').trim();
      titleFound = true;
      return;
    }
    if (excluded(node)) {
      // Inspect <title> in head, otherwise ignore the whole subtree.
      if (node.tag === 'head') {
        const title = node.children.find(child=>element(child) && child.tag==='title');
        if (title) visit(title);
      }
      return;
    }
    if (node.tag === 'tr') {
      const cells = node.children.filter(child=>element(child) &&
        (child.tag==='td' || child.tag==='th') && !excluded(child));
      if (cells.length) append('table_row',cells.map(cell=>visibleText(cell)).join(' | '));
      return;
    }
    const kind: VisibleBlockKind | null =
      /^h[1-6]$/.test(node.tag) ? node.tag as VisibleBlockKind :
      node.tag==='p'||node.tag==='blockquote' ? 'paragraph' :
      node.tag==='li' ? 'list_item' :
      node.tag==='dt'||node.tag==='summary' ? 'faq_question' :
      node.tag==='dd' ? 'faq_answer' : null;
    if (kind) {
      const inlineText = node.children.map(child => visibleText(child,true)).join('');
      append(kind,inlineText);
      // Only descend into nested block structures to avoid duplication.
      for(const child of node.children) if(element(child) &&
        (blockTags.has(child.tag) || descendantsHaveBlocks(child))) visit(child,insideTable);
      return;
    }
    if ((node.tag==='div'||node.tag==='section'||node.tag==='article') &&
        !descendantsHaveBlocks(node)) {
      append('paragraph',visibleText(node));
      return;
    }
    for(const child of node.children) visit(child,insideTable || node.tag === 'table');
  };
  for(const child of parsed.root.children) visit(child);
  if (exceeded) return {ok:false,error:'html_evidence_limit'};
  if (pageTitle.length>300) return {ok:false,error:'html_title_limit'};
  return {ok:true,pageTitle,blocks};
}

export function prepareWebsiteEvidenceFromHtml(input: {
  verifiedSeedUrl: string;
  sourceUrl: string;
  fetchedAt: string;
  html: string;
}): WebsiteEvidenceResult {
  const extracted=extractVisibleWebsiteBlocks(input.html);
  if (!extracted.ok) return extracted;
  return prepareWebsiteEvidence({
    verifiedSeedUrl:input.verifiedSeedUrl,
    sourceUrl:input.sourceUrl,
    fetchedAt:input.fetchedAt,
    pageTitle:extracted.pageTitle,
    blocks:extracted.blocks,
  });
}


/**
 * Boundary between an already-authorized HTML fetch and KB-02 evidence.
 * The caller owns crawl authorization, consent, robots, and retention.
 * No content from a non-200 or non-HTML response becomes evidence.
 */
export function prepareWebsiteEvidenceFromFetch(input: {
  verifiedSeedUrl: string;
  fetchedAt: string;
  response: {
    url: string;
    status: number;
    contentType: string;
    body: string;
  };
}): WebsiteEvidenceResult {
  if (!input || !input.response || input.response.status !== 200) {
    return { ok:false,error:'html_response_not_successful' };
  }
  if (typeof input.response.contentType !== 'string' ||
      !/^(?:text\/html|application\/xhtml\+xml)(?:\s*;|$)/i.test(input.response.contentType)) {
    return { ok:false,error:'html_content_type_required' };
  }
  if (typeof input.response.body !== 'string') {
    return { ok:false,error:'invalid_html_body' };
  }
  return prepareWebsiteEvidenceFromHtml({
    verifiedSeedUrl:input.verifiedSeedUrl,
    sourceUrl:input.response.url,
    fetchedAt:input.fetchedAt,
    html:input.response.body,
  });
}
