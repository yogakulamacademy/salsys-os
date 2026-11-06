import { parse } from 'parse5';
import {
  prepareWebsiteEvidence, type WebsiteEvidenceResult,
  type VisibleWebsiteBlock, type VisibleBlockKind,
} from './website-evidence';

/**
 * KB-02C: standards-based HTML5 document parsing using parse5.
 *
 * Only a conservative set of *visible, structured* text is retained. A correct
 * DOM tree does not guarantee that CSS- or JS-dependent content is visible.
 * This module does not fetch, persist, generate AI text, or approve knowledge.
 */

type HtmlNode = {
  nodeName: string;
  tagName?: string;
  value?: string;
  attrs?: { name: string; value: string }[];
  childNodes?: HtmlNode[];
};

type ExtractedHtml5 = {
  ok: true;
  pageTitle: string;
  blocks: VisibleWebsiteBlock[];
  detectedLanguage: string | null;
  parser: 'parse5';
  warnings: string[];
} | {ok: false; error: string};

export type Html5EvidenceResult = WebsiteEvidenceResult & {
  // HTML5 parser produces *unreviewed* evidence only.
};

const MAX_BYTES = 512 * 1024;
const MAX_NODES = 20000;
const MAX_DEPTH = 60;
const MAX_BLOCKS = 250;
const MAX_TEXT = 100000;
const MAX_BLOCK_TEXT = 6000;

const disallowedTags = new Set([
  'script','style','noscript','template','iframe','object','embed',
  'svg','math','canvas','picture','audio','video','input','select','option',
  'button','form','textarea','nav','header','footer','aside','dialog',
]);
const containerTags = new Set(['div','section','article','main']);
const textTags = new Set([
  'h1','h2','h3','h4','h5','h6','p','blockquote','li','dt','dd','summary',
]);
const layoutBlockTags = new Set([
  ...containerTags, ...textTags, 'table','tbody','thead','tfoot','tr',
  'ul','ol','dl','details',
]);

function attributes(node: HtmlNode): Record<string,string> {
  return Object.fromEntries((node.attrs ?? []).map(a=>[a.name.toLowerCase(),a.value]));
}

function isExcluded(node: HtmlNode): boolean {
  const tag = node.tagName ?? node.nodeName;
  if (disallowedTags.has(tag)) return true;
  const attrs = attributes(node);
  if (Object.hasOwn(attrs,'hidden') || Object.hasOwn(attrs,'inert') ||
      attrs['aria-hidden']?.toLowerCase() === 'true') return true;
  if (['navigation','banner','contentinfo','form','dialog','search'].includes(
    (attrs.role ?? '').toLowerCase())) return true;

  // Inline CSS only. Stylesheet/CSSOM/JS-driven visibility is a staging gate.
  if (/(?:^|;)\s*(?:display\s*:\s*none|visibility\s*:\s*hidden|content-visibility\s*:\s*hidden)\s*(?:!important)?\s*(?:;|$)/i
    .test(attrs.style ?? '')) return true;
  const labels=(attrs.class ?? '')+' '+(attrs.id ?? '');
  if (/(?:^|[\s_-])(?:cookie|consent|modal|popup|hidden)(?:[\s_-]|$)/i.test(labels)) return true;
  return false;
}

function children(node: HtmlNode): HtmlNode[] {
  return node.childNodes ?? [];
}

function rawInlineText(node: HtmlNode, excludeNestedBlocks = false): string {
  if (node.nodeName === '#text') return node.value ?? '';
  if (node.nodeName === '#comment' || node.nodeName === '#documentType') return '';
  if (isExcluded(node)) return '';
  if (node.tagName === 'br') return ' ';
  if (excludeNestedBlocks && node.tagName && layoutBlockTags.has(node.tagName)) return '';
  return children(node).map(child=>rawInlineText(child,excludeNestedBlocks)).join('');
}

function clean(text: string): string {
  return text.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g,'')
    .replace(/\s+/gu,' ').trim();
}

function hasNestedBlock(node: HtmlNode): boolean {
  for (const child of children(node)) {
    if (isExcluded(child)) continue;
    if (child.tagName && layoutBlockTags.has(child.tagName)) return true;
    if (hasNestedBlock(child)) return true;
  }
  return false;
}

/**
 * Parse HTML5 markup into a normalized set of reviewable text blocks.
 * HTML5 tree repair and entity handling are delegated to parse5.
 */
export function extractHtml5VisibleBlocks(input: string): ExtractedHtml5 {
  if (typeof input !== 'string' || Buffer.byteLength(input,'utf8') > MAX_BYTES) {
    return {ok:false,error:'html_size_limit'};
  }
  let root: HtmlNode;
  try {
    root=parse(input,{scriptingEnabled:false}) as unknown as HtmlNode;
  } catch {
    return {ok:false,error:'html_parse_failed'};
  }

  let nodes=0;
  const check=(node: HtmlNode,depth: number): string | null => {
    if (depth > MAX_DEPTH) return 'html_depth_limit';
    if (++nodes > MAX_NODES) return 'html_node_limit';
    for(const child of children(node)) {
      const failure=check(child,depth+1);
      if(failure) return failure;
    }
    return null;
  };
  const bad=check(root,0);
  if (bad) return {ok:false,error:bad};

  let pageTitle='';
  let detectedLanguage: string | null=null;
  const warnings:string[]=[];
  const blocks:VisibleWebsiteBlock[]=[];
  let textLength=0;
  let failed=false;
  let bodySeen=false;

  const append=(kind:VisibleBlockKind,text:string) => {
    const normalized=clean(text);
    if(!normalized) return;
    textLength+=normalized.length;
    if(blocks.length>=MAX_BLOCKS || textLength>MAX_TEXT ||
       normalized.length>MAX_BLOCK_TEXT) {failed=true;return;}
    blocks.push({kind,text:normalized});
  };
  const visit=(node: HtmlNode,inHead=false) => {
    if(failed) return;
    const tag=node.tagName ?? node.nodeName;
    if(tag==='html'){
      const lang=attributes(node).lang?.trim();
      if(lang) detectedLanguage=lang.slice(0,48);
    }
    if(tag==='head') {
      for(const child of children(node)) visit(child,true);
      return;
    }
    if(inHead){
      if(tag==='title'&&!pageTitle)pageTitle=clean(rawInlineText(node));
      return;
    }
    if(tag==='body')bodySeen=true;
    if(isExcluded(node))return;
    if(tag==='tr') {
      const cells=children(node).filter(child=>
        ['td','th'].includes(child.tagName??'')&&!isExcluded(child));
      if(cells.length)append('table_row',
        cells.map(cell=>clean(rawInlineText(cell))).join(' | '));
      return;
    }
    let kind:VisibleBlockKind|null=null;
    if(/^h[1-6]$/.test(tag))kind=tag as VisibleBlockKind;
    else if(['p','blockquote'].includes(tag))kind='paragraph';
    else if(tag==='li')kind='list_item';
    else if(tag==='dt'||tag==='summary')kind='faq_question';
    else if(tag==='dd')kind='faq_answer';
    if(kind){
      // Exclude nested block CHILDREN, not the current paragraph/heading
      // itself. Otherwise every supported semantic block is accidentally
      // skipped, while table rows still appear.
      append(kind,children(node).map(child=>rawInlineText(child,true)).join(''));
      // Descend only when malformed HTML contains nested block nodes.
      for(const child of children(node)){
        if(child.tagName&&layoutBlockTags.has(child.tagName))visit(child);
      }
      return;
    }
    if(containerTags.has(tag)&&!hasNestedBlock(node)){
      append('paragraph',rawInlineText(node));
      return;
    }
    for(const child of children(node))visit(child);
  };
  visit(root);

  if(failed)return {ok:false,error:'html_evidence_limit'};
  if(pageTitle.length>300)return {ok:false,error:'html_title_limit'};
  if(!bodySeen)warnings.push('missing_body');
  if(!pageTitle)warnings.push('missing_title');
  // Do not claim CSS-computed or JavaScript-rendered visibility.
  warnings.push('unverified_stylesheet_and_runtime_visibility');
  return {ok:true,pageTitle,blocks,detectedLanguage,parser:'parse5',warnings};
}

export function prepareHtml5WebsiteEvidence(input: {
  verifiedSeedUrl:string;
  fetchedAt:string;
  response:{url:string;status:number;contentType:string;body:string};
}): WebsiteEvidenceResult {
  if(!input?.response || input.response.status!==200) {
    return {ok:false,error:'html_response_not_successful'};
  }
  if(typeof input.response.contentType!=='string' ||
     !/^(?:text\/html|application\/xhtml\+xml)(?:\s*;|$)/i.test(input.response.contentType)) {
    return {ok:false,error:'html_content_type_required'};
  }
  if(typeof input.response.body!=='string')return {ok:false,error:'invalid_html_body'};
  const result=extractHtml5VisibleBlocks(input.response.body);
  if(!result.ok)return result;
  return prepareWebsiteEvidence({
    verifiedSeedUrl:input.verifiedSeedUrl,
    sourceUrl:input.response.url,
    fetchedAt:input.fetchedAt,
    pageTitle:result.pageTitle,
    blocks:result.blocks,
  });
}
