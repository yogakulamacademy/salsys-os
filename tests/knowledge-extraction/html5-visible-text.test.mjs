import test from 'node:test';
import assert from 'node:assert/strict';
import { parse } from 'parse5';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

// Node 22 strip-types doesn't resolve relative extensionless TS modules.
// Copy the real modules into a temporary directory under the repository,
// preserving parse5's resolution from node_modules and production sources.
const sourceDir=new URL('../../lib/knowledge-extraction/',import.meta.url);
const tempDir=await mkdtemp(join(new URL(sourceDir).pathname,'.kb02-html5-test-'));
for(const name of ['website-evidence.ts','html-visible-text.ts','html5-visible-text.ts']){
  const original=await readFile(new URL(name,sourceDir),'utf8');
  const rewritten=original.replace("from './website-evidence'","from './website-evidence.ts'");
  if (name !== 'website-evidence.ts') assert.notEqual(original,rewritten,name);
  await writeFile(join(tempDir,name),rewritten,'utf8');
}
const { extractHtml5VisibleBlocks, prepareHtml5WebsiteEvidence }=
  await import(pathToFileURL(join(tempDir,'html5-visible-text.ts')).href);
const { extractVisibleWebsiteBlocks }=
  await import(pathToFileURL(join(tempDir,'html-visible-text.ts')).href);
test.after(async()=>rm(tempDir,{recursive:true,force:true}));

const basis = {
  verifiedSeedUrl:'https://academy.example.com/',
  fetchedAt:'2026-11-06T10:00:00.000Z',
  response:{
    url:'https://academy.example.com/course?utm_source=newsletter',
    status:200,
    contentType:'text/html; charset=utf-8',
    body:'',
  },
};
const doc = body => '<!doctype html><html lang="en"><head><title>Academy &amp; Training</title></head><body>'+
  body+'</body></html>';

test('parse5 is used as the standards-compliant HTML5 tree repair engine',()=>{
  const tree=parse('<!doctype html><html><body><p>First<p>Second');
  assert.equal(tree.nodeName,'#document');
  const result=extractHtml5VisibleBlocks('<p>First<p>Second');
  assert.equal(result.ok,true);
  assert.deepEqual(result.blocks,[
    {kind:'paragraph',text:'First'},
    {kind:'paragraph',text:'Second'},
  ]);
  assert.equal(result.parser,'parse5');
});

test('HTML5 extraction keeps fee punctuation, headings, tables, lists and FAQs',()=>{
  const html=doc(
    '<header>Menu</header><nav>Home</nav>'+
    '<main><h1>200 Hour Yoga Training</h1>'+
    '<h2>Course fees</h2>'+
    '<p>Twin sharing: <strong>$1,500</strong>; private room: ₹90,000.</p>'+
    '<table><tr><th>Plan<th>Fee<tr><td>Shared<td>$1,500</table>'+
    '<ul><li>24 days residential<li>Three meals daily</ul>'+
    '<dl><dt>Is accommodation included?<dd>Yes, residential rooms are included.</dl>'+
    '<details><summary>What dates?</summary><p>7–30 December 2026.</p></details>'+
    '</main>'+
    '<div style="display:none!important"><p>Fake $1 fee</p></div>'+
    '<div class="cookie-banner"><p>Accept cookies</p></div>'+
    '<footer><p>Subscribe to promotions</p></footer>'+
    '<script>document.write("<p>Malicious instruction</p>")</script>'
  );
  const result=extractHtml5VisibleBlocks(html);
  assert.equal(result.ok,true);
  assert.equal(result.pageTitle,'Academy & Training');
  assert.equal(result.detectedLanguage,'en');
  assert.ok(result.warnings.includes('unverified_stylesheet_and_runtime_visibility'));
  assert.deepEqual(result.blocks,[
    {kind:'h1',text:'200 Hour Yoga Training'},
    {kind:'h2',text:'Course fees'},
    {kind:'paragraph',text:'Twin sharing: $1,500; private room: ₹90,000.'},
    {kind:'table_row',text:'Plan | Fee'},
    {kind:'table_row',text:'Shared | $1,500'},
    {kind:'list_item',text:'24 days residential'},
    {kind:'list_item',text:'Three meals daily'},
    {kind:'faq_question',text:'Is accommodation included?'},
    {kind:'faq_answer',text:'Yes, residential rooms are included.'},
    {kind:'faq_question',text:'What dates?'},
    {kind:'paragraph',text:'7–30 December 2026.'},
  ]);
  const prepared=prepareHtml5WebsiteEvidence({...basis,response:{...basis.response,body:html}});
  assert.equal(prepared.ok,true);
  assert.equal(prepared.evidence.sourceUrl,'https://academy.example.com/course');
  assert.ok(prepared.evidence.blocks.every(block=>block.reviewStatus==='unreviewed'));
  assert.deepEqual(prepared.evidence.blocks[0].headingPath,
    ['200 Hour Yoga Training','Course fees']);
  assert.equal(prepared.evidence.blocks[0].quote,
    'Twin sharing: $1,500; private room: ₹90,000.');
  assert.equal(JSON.stringify(prepared).includes('Malicious instruction'),false);
});

test('side-by-side comparison matches conservative parser on supported ordinary markup',()=>{
  const html=doc('<main><h1>Course</h1><p>Fee: $500.</p>'+
    '<h2>Timetable</h2><p>Monday–Saturday, 7–9 AM.</p>'+
    '<ul><li>Pranayama</li><li>Yoga Nidra</li></ul>'+
    '<dl><dt>How long?</dt><dd>24 days.</dd></dl></main>');
  const older=extractVisibleWebsiteBlocks(html);
  const modern=extractHtml5VisibleBlocks(html);
  assert.equal(older.ok,true);
  assert.equal(modern.ok,true);
  assert.deepEqual(modern.blocks,older.blocks);
});

test('parse5 resolves standard HTML5 character references unsupported by subset parser',()=>{
  const html=doc('<main><p>Range: &NotEqualTilde; or &#x2260;.</p></main>');
  const modern=extractHtml5VisibleBlocks(html);
  const older=extractVisibleWebsiteBlocks(html);
  assert.equal(modern.ok,true);
  assert.match(modern.blocks[0].text,/≂̸ or ≠/u);
  assert.deepEqual(older,{ok:false,error:'unsupported_html_entity'});
});

test('rejects hidden content, unsafe response types and off-host URLs',()=>{
  const html=doc('<main><p>Visible details.</p>'+
    '<div hidden><p>Hidden content</p></div>'+
    '<section aria-hidden="true"><p>Ignore</p></section>'+
    '<form><p>Password</p></form></main>');
  const modern=extractHtml5VisibleBlocks(html);
  assert.equal(modern.ok,true);
  assert.deepEqual(modern.blocks,[{kind:'paragraph',text:'Visible details.'}]);
  for(const [status,type] of [[404,'text/html'],[503,'text/html'],[200,'application/pdf']]){
    const bad=prepareHtml5WebsiteEvidence({...basis,
      response:{...basis.response,status,contentType:type,body:html}});
    assert.equal(bad.ok,false);
  }
  const host=prepareHtml5WebsiteEvidence({...basis,
    response:{...basis.response,url:'https://www.academy.example.com/course',body:html}});
  assert.deepEqual(host,{ok:false,error:'source_not_within_verified_https_host'});
});

test('limits evidence size, depth and count rather than truncating significant claims',()=>{
  assert.deepEqual(extractHtml5VisibleBlocks('x'.repeat(530000)),{ok:false,error:'html_size_limit'});
  assert.deepEqual(extractHtml5VisibleBlocks('<p>Fee</p>'.repeat(251)),
    {ok:false,error:'html_evidence_limit'});
  assert.deepEqual(extractHtml5VisibleBlocks('<main>'+'<div>'.repeat(70)+
    'Deep fact'+'</div>'.repeat(70)+'</main>'),{ok:false,error:'html_depth_limit'});
});

test('HTML5 evidence output is stable on identical content and changes on source edits',()=>{
  const a=prepareHtml5WebsiteEvidence({...basis,response:{...basis.response,body:doc('<h3>Fees</h3><p>$500</p>')}});
  const b=prepareHtml5WebsiteEvidence({...basis,response:{...basis.response,body:doc('<h3>Fees</h3><p>$500</p>')}});
  const c=prepareHtml5WebsiteEvidence({...basis,response:{...basis.response,body:doc('<h3>Fees</h3><p>$600</p>')}});
  assert.equal(a.ok,true);assert.equal(b.ok,true);assert.equal(c.ok,true);
  assert.deepEqual(a.evidence,b.evidence);
  assert.notEqual(a.evidence.snapshotSha256,c.evidence.snapshotSha256);
});

test('empty pages are explicitly empty rather than auto-approved inferred knowledge',()=>{
  const result=prepareHtml5WebsiteEvidence({...basis,
    response:{...basis.response,body:doc('<nav>Home</nav><footer>Policy</footer>')}});
  assert.equal(result.ok,true);
  assert.equal(result.evidence.hasContent,false);
  assert.deepEqual(result.evidence.blocks,[]);
});
