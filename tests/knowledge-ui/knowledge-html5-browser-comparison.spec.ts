import { expect, test } from '@playwright/test';
import { extractHtml5VisibleBlocks } from '../../lib/knowledge-extraction/html5-visible-text';

/**
 * Independent browser DOM fixture checks. Only local setContent() markup is
 * used: no public website fetch and no connected customer/production data.
 */
test('HTML5 evidence agrees with browser on ordinary visible headings, fees and FAQ text',async({page})=>{
  const html='<!doctype html><html lang="en"><head><title>Training &amp; Certification</title></head>'+
    '<body><main><h1>Teacher Training</h1>'+
    '<h2>Accommodation and fees</h2>'+
    '<p id="fee">Private room: <strong>$1,750</strong>.</p>'+
    '<ul><li id="meals">Three vegetarian meals included</li></ul>'+
    '<dl><dt id="faq">Is accommodation included?</dt><dd id="answer">Yes, for residential participants.</dd></dl>'+
    '<table><tr><th>Plan</th><th>Fee</th></tr><tr><td>Shared</td><td>$1,500</td></tr></table>'+
    '</main><nav><p>Navigation</p></nav><footer>Footer text</footer></body></html>';
  await page.setContent(html);
  const parsed=extractHtml5VisibleBlocks(html);
  expect(parsed.ok).toBe(true);
  if(!parsed.ok)return;
  expect(parsed.pageTitle).toBe(await page.title());
  const browserTexts=await Promise.all(['h1','h2','#fee','#meals','#faq','#answer']
    .map(selector=>page.locator(selector).innerText()));
  const evidenceTexts=parsed.blocks.filter(b=>b.kind!=='table_row').map(b=>b.text);
  expect(evidenceTexts).toEqual(browserTexts);
  const browserCells=await page.locator('table tr').evaluateAll(rows=>rows.map(row=>
    Array.from(row.querySelectorAll('th,td')).map(cell=>(cell.textContent??'').trim()).join(' | ')));
  expect(parsed.blocks.filter(b=>b.kind==='table_row').map(b=>b.text)).toEqual(browserCells);
  expect(parsed.blocks.some(b=>b.text==='Navigation'||b.text==='Footer text')).toBe(false);
});

test('parse5 and Chromium repair omitted HTML closing tags consistently',async({page})=>{
  const html='<main><p>First paragraph<p>Second paragraph<ul><li>One<li>Two</ul></main>';
  await page.setContent(html);
  const parsed=extractHtml5VisibleBlocks(html);
  expect(parsed.ok).toBe(true);
  if(!parsed.ok)return;
  const browserParagraphs=await page.locator('main p').allInnerTexts();
  const browserList=await page.locator('main li').allInnerTexts();
  expect(parsed.blocks.filter(b=>b.kind==='paragraph').map(b=>b.text)).toEqual(browserParagraphs);
  expect(parsed.blocks.filter(b=>b.kind==='list_item').map(b=>b.text)).toEqual(browserList);
});

test('inline hidden elements are excluded from browser and unreviewed evidence',async({page})=>{
  const html='<main><p id="shown">Course dates 7–30 December.</p>'+
    '<p id="hidden" style="display:none!important">Fake fee $1</p>'+
    '<div hidden><p>Internal note</p></div></main>';
  await page.setContent(html);
  await expect(page.locator('#shown')).toBeVisible();
  await expect(page.locator('#hidden')).toBeHidden();
  const parsed=extractHtml5VisibleBlocks(html);
  expect(parsed.ok).toBe(true);
  if(!parsed.ok)return;
  expect(parsed.blocks).toEqual([{kind:'paragraph',text:'Course dates 7–30 December.'}]);
});

test('stylesheet-only visibility is explicitly NOT claimed by static parser',async({page})=>{
  const html='<style>.not-visible{display:none}</style><main><p class="not-visible">'+
    'Private fixture text</p><p>Published fee $500</p></main>';
  await page.setContent(html);
  await expect(page.locator('.not-visible')).toBeHidden();
  const parsed=extractHtml5VisibleBlocks(html);
  expect(parsed.ok).toBe(true);
  if(!parsed.ok)return;
  expect(parsed.warnings).toContain('unverified_stylesheet_and_runtime_visibility');
  // A browser-computed visibility pass is mandatory before any automated
  // content approval. This test documents a known difference, not success.
  expect(parsed.blocks.some(b=>b.text==='Private fixture text')).toBe(true);
});
