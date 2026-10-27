import { readFile, writeFile } from 'node:fs/promises';

const path = 'app/actions/auth.ts';
let source = await readFile(path, 'utf8');

const confirmPattern = /export async function confirmPasswordRecoveryAction\(formData: FormData\) \{[\s\S]*?\n\}\n\nexport async function updateRecoveredPasswordAction/;
const updatePattern = /export async function updateRecoveredPasswordAction\(formData: FormData\) \{[\s\S]*?\n\}\n\nexport async function signOutAction/;

if (!confirmPattern.test(source)) {
  throw new Error('Legacy confirmPasswordRecoveryAction block was not found exactly once.');
}

source = source.replace(
  confirmPattern,
  `export async function confirmPasswordRecoveryAction(_formData: FormData) {\n  redirect(\n    authUrl(\n      '/forgot-password',\n      'error',\n      'Password recovery security was upgraded. Request a new reset link.',\n    ),\n  );\n}\n\nexport async function updateRecoveredPasswordAction`,
);

if (!updatePattern.test(source)) {
  throw new Error('Legacy updateRecoveredPasswordAction block was not found exactly once.');
}

source = source.replace(
  updatePattern,
  `export async function updateRecoveredPasswordAction(_formData: FormData) {\n  redirect(\n    authUrl(\n      '/forgot-password',\n      'error',\n      'Password recovery security was upgraded. Request a new reset link.',\n    ),\n  );\n}\n\nexport async function signOutAction`,
);

await writeFile(path, source, 'utf8');
console.log('Legacy recovery actions neutralized.');
