import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const nextConfig = readFileSync('next.config.ts', 'utf8');

for (const [needle, label] of [
  ["key: 'X-Content-Type-Options'", 'X-Content-Type-Options header'],
  ["value: 'nosniff'", 'nosniff value'],
  ["key: 'X-Frame-Options'", 'X-Frame-Options header'],
  ["value: 'DENY'", 'DENY frame policy'],
  ["key: 'Referrer-Policy'", 'Referrer-Policy header'],
  ["value: 'strict-origin-when-cross-origin'", 'strict referrer policy'],
  ["key: 'Permissions-Policy'", 'Permissions-Policy header'],
  ["value: 'camera=(), microphone=(), geolocation=()'", 'restricted browser capabilities'],
  ["source: '/:path*'", 'global header scope'],
]) {
  assert(nextConfig.includes(needle), `Missing ${label}`);
}

console.log('Baseline browser security-header contracts verified.');
