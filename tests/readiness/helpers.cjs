const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
exports.load = (relative, dependencies = {}) => {
  const file = path.resolve(__dirname, '../..', relative);
  const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const result = {};
  new Function('require', 'exports', code)(name => { if (Object.hasOwn(dependencies, name)) return dependencies[name]; throw Error(`Unexpected dependency: ${name}`); }, result);
  return result;
};
