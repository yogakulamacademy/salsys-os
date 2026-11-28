const ts = require('typescript');

module.exports = function compile(source) {
  if (this.resourcePath.endsWith('.css')) {
    const names = Array.from(source.matchAll(/\.([a-zA-Z_]+)\b/g), (match) => match[1]);
    return 'export default ' + JSON.stringify(Object.fromEntries(names.map((name) => [name, name])));
  }
  return ts.transpileModule(source, { compilerOptions: {
    module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX,
  }, fileName: this.resourcePath }).outputText;
};
