/** Offline bulk-import preflight. No upload, storage, database or approval authority. */
export const BULK_IMPORT_MAX_BYTES = 50 * 1024 * 1024;
export const BULK_IMPORT_MAX_ENTRIES = 10_000;
export const BULK_IMPORT_BATCH_ENTRIES = 50;
export const BULK_IMPORT_BATCH_BYTES = 512 * 1024;
const types = new Set(['manual','website','pdf','drive','faq','policy','course','crm_reply','other']);
const keys = new Set(['title','category','content','source_type','source_name','source_uri','review_flag']);
/** Exact TextEncoder-compatible UTF-8 length, without allocating the encoded bytes.
 * Unpaired UTF-16 surrogates count as the three-byte replacement character. */
export function knowledgeImportUtf8Length(value: string): number {
  let n=0;
  for(let i=0;i<value.length;i++){
    const c=value.charCodeAt(i);
    if(c<=0x7f)n++;
    else if(c<=0x7ff)n+=2;
    else if(c>=0xd800&&c<=0xdbff&&i+1<value.length){
      const next=value.charCodeAt(i+1);
      if(next>=0xdc00&&next<=0xdfff){n+=4;i++;}
      else n+=3;
    }else n+=3;
  }
  return n;
}
const bytes=knowledgeImportUtf8Length;
type Draft = { title: string; category: string; content: string; source_type: string; source_name: string; source_uri: string | null; review_flag: string };
type Entry = { index: number; draft: Draft };
type Issue = { index: number; reason: 'invalid_entry' | 'duplicate_in_file' };
type Plan = { ok: false; reason: 'invalid_input' | 'file_too_large' | 'invalid_json' | 'invalid_format' | 'too_many_entries' } | { ok: true; total: number; accepted: number; issues: Issue[]; batches: Entry[][] };
function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
function normalized(value: unknown): Draft | null {
  if (!record(value) || Object.keys(value).some(k => !keys.has(k))) return null;
  const get = (key: string, fallback = '') => value[key] === undefined ? fallback : typeof value[key] === 'string' ? value[key].trim() : null;
  const title = get('title'), content = get('content'), source_name = get('source_name');
  const category = get('category', 'general'), source_type = get('source_type', 'other');
  const source_uri = get('source_uri'), review_flag = get('review_flag');
  if (!title || !content || !source_name || !category || !source_type || source_uri === null || review_flag === null) return null;
  // Preserve existing import limits; do not silently truncate or expand content.
  if (title.length + (review_flag ? 2 : 0) > 180 || content.length < 10 || content.length > 8000 ||
      source_name.length + (review_flag ? 11 + review_flag.length : 0) > 240 ||
      category.length > 60 || !types.has(source_type) || source_uri.length > 2048) return null;
  if ([title,content,source_name,category,review_flag,source_uri].some(s => s.includes('\u0000'))) return null;
  if (source_uri) {
    try { const u = new URL(source_uri); if (!/^https?:$/.test(u.protocol) || !/^https?:\/\/\S+$/i.test(source_uri) || u.username || u.password) return null; } catch { return null; }
  }
  return {title, category, content, source_type, source_name, source_uri: source_uri || null, review_flag};
}
/** Accepts only JSON text. The future upload boundary must independently enforce the raw byte limit before decoding. */
export function planKnowledgeDraftImport(raw: unknown): Plan {
  if (typeof raw !== 'string') return {ok:false, reason:'invalid_input'};
  if (raw.length > BULK_IMPORT_MAX_BYTES || bytes(raw) > BULK_IMPORT_MAX_BYTES) return {ok:false, reason:'file_too_large'};
  let parsed: unknown;
  try { parsed = JSON.parse(raw); } catch { return {ok:false, reason:'invalid_json'}; }
  if (!record(parsed) || parsed.version !== 1 || !Array.isArray(parsed.drafts) || Object.keys(parsed).some(k => k !== 'version' && k !== 'drafts') || parsed.drafts.length === 0) return {ok:false, reason:'invalid_format'};
  if (parsed.drafts.length > BULK_IMPORT_MAX_ENTRIES) return {ok:false, reason:'too_many_entries'};
  const seen = new Set<string>(), issues: Issue[] = [], batches: Entry[][] = [];
  let batch: Entry[] = [], batchBytes = 2, accepted = 0;
  for (const [index, item] of parsed.drafts.entries()) {
    const draft = normalized(item);
    if (!draft) { issues.push({index, reason:'invalid_entry'}); continue; }
    const key = JSON.stringify(draft);
    if (seen.has(key)) { issues.push({index, reason:'duplicate_in_file'}); continue; }
    const entry = {index, draft};
    const size = bytes(JSON.stringify(entry));
    if (size + 2 > BULK_IMPORT_BATCH_BYTES) { issues.push({index, reason:'invalid_entry'}); continue; }
    if (batch.length && (batch.length >= BULK_IMPORT_BATCH_ENTRIES || batchBytes + 1 + size > BULK_IMPORT_BATCH_BYTES)) {
      batches.push(batch); batch = []; batchBytes = 2;
    }
    batchBytes += size + (batch.length ? 1 : 0);
    batch.push(entry); seen.add(key); accepted++;
  }
  if (batch.length) batches.push(batch);
  return {ok:true, total:parsed.drafts.length, accepted, issues, batches};
}
