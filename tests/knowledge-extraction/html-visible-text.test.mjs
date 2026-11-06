import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

// Node 22's TypeScript strip-types does not resolve extensionless relative
// TS imports. Keep the production bundler import unchanged; use a disposable
// test copy that points to the explicit .ts file.
const tempDir=await mkdtemp(join(tmpdir(),'salsys-kb02-html-'));
const evidenceSource=await readFile(
  new URL('../../lib/knowledge-extraction/website-evidence.ts',import.meta.url),'utf8');
await writeFile(join(tempDir,'website-evidence.ts'),evidenceSource,'utf8');
const parserSource=await readFile(
  new URL('../../lib/knowledge-extraction/html-visible-text.ts',import.meta.url),'utf8');
const rewritten=parserSource.replace("from './website-evidence'","from './website-evidence.ts'");
assert.notEqual(rewritten,parserSource,'Test must exercise the real TS source import');
await writeFile(join(tempDir,'html-visible-text.ts'),rewritten,'utf8');
const { extractVisibleWebsiteBlocks, prepareWebsiteEvidenceFromHtml }=
  await import(pathToFileURL(join(tempDir,'html-visible-text.ts')).href);
test.after(async()=>rm(tempDir,{recursive:true,force:true}));

const source = () => ({
  verifiedSeedUrl:'https://academy.example.com/',
  sourceUrl:'https://academy.example.com/courses?campaign=email',
  fetchedAt:'2026-11-06T10:00:00Z',
});

test('extracts headings, literal fee text, list items, table rows and FAQs with provenance',()=>{
  const html = '<!doctype html><html><head><title>Teacher Training &amp; Courses</title>' +
    '<style>.hidden{display:none}</style></head><body>' +
    '<header>Enroll quickly</header><nav>Courses and bookings</nav>' +
    '<main><h1>Teacher Training</h1>' +
    '<p>Shared room <strong>$1,500</strong>; private room <b>$1,750</b>.</p>' +
    '<h2>Includes</h2><ul><li>Three vegetarian meals</li><li>Course manual</li></ul>' +
    '<table><tr><th>Room</th><th>Fee</th></tr>' +
    '<tr><td>Private</td><td>€1,750</td></tr></table>' +
    '<dl><dt>Is accommodation included?</dt>' +
    '<dd>Yes, for residential students.</dd></dl>' +
    '<details><summary>Can I join online?</summary><p>Online batches are available.</p></details>' +
    '</main><footer>Join newsletter</footer>' +
    '<script>let bad = "<h2>FAKE HEADING</h2>";</script>' +
    '<section aria-hidden="true"><h2>Hidden policy</h2></section>' +
    '<section style="display: none"><p>Hidden price $1</p></section>' +
    '<div class="cookie-consent"><p>Accept tracking</p></div>' +
    '</body></html>';
  const parsed=extractVisibleWebsiteBlocks(html);
  assert.equal(parsed.ok,true);
  assert.equal(parsed.pageTitle,'Teacher Training & Courses');
  assert.deepEqual(parsed.blocks,[
    {kind:'h1',text:'Teacher Training'},
    {kind:'paragraph',text:'Shared room $1,500; private room $1,750.'},
    {kind:'h2',text:'Includes'},
    {kind:'list_item',text:'Three vegetarian meals'},
    {kind:'list_item',text:'Course manual'},
    {kind:'table_row',text:'Room | Fee'},
    {kind:'table_row',text:'Private | €1,750'},
    {kind:'faq_question',text:'Is accommodation included?'},
    {kind:'faq_answer',text:'Yes, for residential students.'},
    {kind:'faq_question',text:'Can I join online?'},
    {kind:'paragraph',text:'Online batches are available.'},
  ]);
  const result=prepareWebsiteEvidenceFromHtml({...source(),html});
  assert.equal(result.ok,true);
  const evidence=result.evidence;
  assert.equal(evidence.blocks.length,9);
  assert.equal(evidence.pageTitle,'Teacher Training & Courses');
  assert.equal(evidence.blocks[0].quote,'Shared room $1,500; private room $1,750.');
  assert.deepEqual(evidence.blocks[0].headingPath,['Teacher Training']);
  assert.equal(evidence.blocks[4].blockKind,'table_row');
  assert.equal(evidence.blocks[4].quote,'Private | €1,750');
  assert.ok(evidence.blocks.every(b=>b.reviewStatus==='unreviewed'));
  assert.equal(evidence.sourceUrl,'https://academy.example.com/courses');
  assert.ok(!JSON.stringify(result).includes('FAKE HEADING'));
});

test('preserves literal punctuation across inline tags and safely decodes supported entities',()=>{
  const result=extractVisibleWebsiteBlocks(
    '<html><body><p>Fee: <strong>€</strong>1,750 &amp; ₹20,000' +
    '<br>Dates: 7th–30th November &#x2022; Sunday off</p></body></html>');
  assert.equal(result.ok,true);
  assert.deepEqual(result.blocks,[{
    kind:'paragraph',text:'Fee: €1,750 & ₹20,000 Dates: 7th–30th November • Sunday off',
  }]);
});

test('navigation-like containers, scripts and hidden elements never become evidence',()=>{
  const result=extractVisibleWebsiteBlocks(
    '<html><body><nav><p>Menu</p></nav>' +
    '<div role="navigation"><p>Sidebar</p></div>' +
    '<div hidden><p>Private</p></div>' +
    '<div class="cookie-modal"><p>Accept now</p></div>' +
    '<form><p>Enter password</p></form>' +
    '<script>document.write("<p>Fake course dates</p>")</script>' +
    '<main><p>Visible course overview.</p></main></body></html>');
  assert.equal(result.ok,true);
  assert.deepEqual(result.blocks,[{kind:'paragraph',text:'Visible course overview.'}]);
});

test('handles quoted greater-than signs, standalone div text and multiple nested inline tags',()=>{
  const result=extractVisibleWebsiteBlocks(
    '<div data-description="a > b"><div><span>Learn</span> <b>Yoga</b></div>' +
    '<p>Schedule <a href="/dates?a=1&amp;b=2">here</a>.</p></div>');
  assert.equal(result.ok,true);
  assert.deepEqual(result.blocks,[
    {kind:'paragraph',text:'Learn Yoga'},
    {kind:'paragraph',text:'Schedule here.'},
  ]);
});

test('unknown entities and malformed tags fail closed rather than silently changing claims',()=>{
  const cases=[
    ['<p>€150 &invented; extra</p>','unsupported_html_entity'],
    ['<p>Bad numeric &#xD800; fee</p>','unsupported_html_entity'],
    ['<p title="unfinished>fee</p>','malformed_html'],
    ['<!-- never closed','malformed_html'],
    ['<script>unterminated','malformed_raw_text'],
    ['<x:record>non HTML namespace</x:record>','unsupported_html_namespace'],
    ['<p a="one" a="two">duplicate attribute</p>','malformed_html_attributes'],
  ];
  for(const [html,error] of cases) {
    assert.deepEqual(extractVisibleWebsiteBlocks(html),{ok:false,error},html);
  }
});

test('hard caps on HTML bytes, nesting, number of nodes and evidence blocks',()=>{
  assert.deepEqual(extractVisibleWebsiteBlocks('<p>'+'x'.repeat(530_000)+'</p>'),
    {ok:false,error:'html_size_limit'});
  assert.deepEqual(extractVisibleWebsiteBlocks('<div>'.repeat(70)+'Deep</div>'.repeat(70)),
    {ok:false,error:'html_depth_limit'});
  assert.deepEqual(extractVisibleWebsiteBlocks('<span></span>'.repeat(10_100)),
    {ok:false,error:'html_node_limit'});
  assert.deepEqual(extractVisibleWebsiteBlocks('<p>Evidence</p>'.repeat(251)),
    {ok:false,error:'html_evidence_limit'});
  assert.deepEqual(extractVisibleWebsiteBlocks('<p>'+'x'.repeat(6_001)+'</p>'),
    {ok:false,error:'html_evidence_limit'});
});

test('no meaningful source content yields honest empty evidence, not inferred FAQs',()=>{
  const result=prepareWebsiteEvidenceFromHtml({
    ...source(),html:'<html><head><title>No content</title></head><body>' +
    '<nav>Home</nav><footer>© 2026</footer><div hidden>Price</div></body></html>',
  });
  assert.equal(result.ok,true);
  assert.equal(result.evidence.hasContent,false);
  assert.equal(result.evidence.blocks.length,0);
});

test('never crosses verified HTTPS hostname and has deterministic source hashes',()=>{
  const html='<h2>Fees</h2><p>Course fee: $500.</p>';
  const a=prepareWebsiteEvidenceFromHtml({...source(),html});
  const b=prepareWebsiteEvidenceFromHtml({...source(),html});
  assert.equal(a.ok,true);
  assert.equal(b.ok,true);
  assert.deepEqual(a.evidence,b.evidence);
  const out=prepareWebsiteEvidenceFromHtml({...source(),
    sourceUrl:'https://www.academy.example.com/courses',html});
  assert.deepEqual(out,{ok:false,error:'source_not_within_verified_https_host'});
});
