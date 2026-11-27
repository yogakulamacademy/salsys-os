const { test } = require('node:test');
const assert = require('node:assert/strict');
const { load } = require('./helpers.cjs');
const api = load('lib/knowledge-bulk-import-preflight.ts');
const plan = drafts => api.planKnowledgeDraftImport(JSON.stringify({version:1,drafts}));
const draft = (n=0) => ({title:'Policy '+n, content:'A valid policy example '+n, source_name:'Synthetic handbook'});
test('accepts 10,000 valid entries, preserves indexes and bounds batches', () => {
  const r = plan(Array.from({length:10000}, (_,i)=>draft(i)));
  assert.equal(r.ok,true); assert.equal(r.accepted,10000); assert.equal(r.issues.length,0);
  const entries = r.batches.flat();
  assert.deepEqual(entries.map(e=>e.index),Array.from({length:10000},(_,i)=>i));
  for(const b of r.batches){assert.ok(b.length<=50); assert.ok(Buffer.byteLength(JSON.stringify(b))<=api.BULK_IMPORT_BATCH_BYTES);}
});
test('rejects excess counts and bytes, including multi-byte input', () => {
  assert.equal(plan(Array.from({length:10001},()=>draft())).reason,'too_many_entries');
  assert.equal(api.planKnowledgeDraftImport('x'.repeat(api.BULK_IMPORT_MAX_BYTES+1)).reason,'file_too_large');
  assert.equal(api.planKnowledgeDraftImport('é'.repeat(api.BULK_IMPORT_MAX_BYTES/2+1)).reason,'file_too_large');
});
test('rejects malformed envelope and non-text input', () => {
  assert.equal(api.planKnowledgeDraftImport(null).reason,'invalid_input');
  assert.equal(api.planKnowledgeDraftImport('{').reason,'invalid_json');
  for(const value of [{version:2,drafts:[draft()]},{version:1,drafts:[]},{version:1,drafts:[draft()],organization_id:'other'}]) assert.equal(api.planKnowledgeDraftImport(JSON.stringify(value)).reason,'invalid_format');
});
test('reports invalid entries and normalized exact duplicates without granting approval', () => {
  const r = plan([draft(),{...draft(),title:' Policy 0 '},null,{...draft(2),p_approve:true},{...draft(3),organization_id:'other'},{...draft(4),content:'x'.repeat(8001)},{...draft(5),source_uri:'file:///secret'},{...draft(6),review_flag:'check'}]);
  assert.equal(r.ok,true); assert.equal(r.accepted,2);
  assert.deepEqual(r.issues.map(e=>[e.index,e.reason]),[[1,'duplicate_in_file'],[2,'invalid_entry'],[3,'invalid_entry'],[4,'invalid_entry'],[5,'invalid_entry'],[6,'invalid_entry']]);
  assert.equal(r.batches[0][1].draft.review_flag,'check');
  assert.equal(Object.hasOwn(r.batches[0][0].draft,'p_approve'),false);
});
test('byte limit also applies to large multi-byte entries', () => {
  const r = plan(Array.from({length:60},(_,i)=>({...draft(i),content:'界'.repeat(8000)})));
  assert.equal(r.accepted,60); assert.ok(r.batches.length>2);
  for(const b of r.batches) assert.ok(Buffer.byteLength(JSON.stringify(b))<=api.BULK_IMPORT_BATCH_BYTES);
});

test('allocation-free UTF-8 count matches native encoding for all code units and mixed surrogate sequences',()=>{
 const values=['','ASCII','é','हिन्दी','日本語','😀','\u0000','\ud800','\udfff','\ud800A','\ud800\ud800\udc00','\udc00\ud800','\udbff\udfff'];
 for(const v of values)assert.equal(api.knowledgeImportUtf8Length(v),Buffer.byteLength(v));
 // Exhaustively cover all individual UTF-16 units, including isolated surrogates.
 for(let i=0;i<65536;i++){const v=String.fromCharCode(i);assert.equal(api.knowledgeImportUtf8Length(v),Buffer.byteLength(v));}
 let seed=0x12345678;
 for(let i=0;i<512;i++){
  let v='';for(let j=0;j<128;j++){seed=(Math.imul(seed,1664525)+1013904223)>>>0;v+=String.fromCharCode(seed>>>16);}
  assert.equal(api.knowledgeImportUtf8Length(v),Buffer.byteLength(v));
 }
 assert.equal(api.knowledgeImportUtf8Length('😀'.repeat(16384)+'\ud800'),65539);
});
test('mixed Unicode capacity and JSON escaping preserve exact preflight limits',()=>{
 const v={...draft(),content:'😀é界"\\\n'.repeat(100)};
 const r=plan([v,{...v,title:' Policy 0 '}]);assert.equal(r.ok,true);assert.equal(r.accepted,1);assert.equal(r.issues[0].reason,'duplicate_in_file');
 const base=JSON.stringify({version:1,drafts:[v]}),padding=api.BULK_IMPORT_MAX_BYTES-Buffer.byteLength(base);
 assert.ok(padding>0);
 assert.equal(api.planKnowledgeDraftImport(base+' '.repeat(padding)).ok,true);
 assert.equal(api.planKnowledgeDraftImport(base+' '.repeat(padding+1)).reason,'file_too_large');
});
