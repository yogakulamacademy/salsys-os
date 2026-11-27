const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const test = require('node:test');
const assert = require('node:assert/strict');

function load(file, imports = {}) {
  const module = {exports:{}};
  const js = ts.transpileModule(fs.readFileSync(path.join(__dirname,'../..',file),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
  new Function('require','module','exports',js)(name=>imports[name]??require(name),module,module.exports);
  return module.exports;
}
test('early action feedback is delivered after the host mounts, with correct tones', () => {
  const previous = global.window;
  global.window = new EventTarget();
  const lib = load('lib/toast.ts');
  const delivered=[];
  window.addEventListener(lib.TOAST_EVENT,event=>delivered.push(event.detail));
  lib.toast.error('Save failed'); lib.toast.success('Saved'); lib.toast.warning('Some rows were skipped');
  assert.equal(delivered.length,0);
  const unregister=lib.registerToastHost();
  assert.deepEqual(delivered.map(x=>x.tone),['error','success','warning']);
  lib.toast.info('Loading'); assert.equal(delivered.at(-1).tone,'info');
  unregister(); global.window=previous;
});
test('server rendering cannot emit client toast events', () => {
  const previous=global.window; delete global.window;
  const lib=load('lib/toast.ts');
  assert.doesNotThrow(()=>lib.toast.error('Ignored during server rendering'));
  global.window=previous;
});
test('notice codes preserve sample labels and plain descriptions', () => {
  const inbox=load('lib/inbox-notices.ts');
  const {feedbackNotice}=load('lib/feedback-notices.ts',{'@/lib/inbox-notices':inbox});
  assert.equal(feedbackNotice('course-created'),'Course created.');
  assert.equal(feedbackNotice('mock-payment-verified'),'Sample: Payment verified.');
  assert.equal(feedbackNotice('whatsapp-sent'),'WhatsApp message sent.');
  assert.equal(feedbackNotice('Approval recorded. Nothing was sent.'),'Approval recorded. Nothing was sent.');
});
