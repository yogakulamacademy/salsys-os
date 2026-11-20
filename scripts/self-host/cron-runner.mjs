#!/usr/bin/env node
// Self-hosted replacement for Vercel Cron.
//
// Reads the same "crons" list from vercel.json (one source of truth for both
// hosts) and, every minute, calls each due path on the app with
// "Authorization: Bearer $CRON_SECRET" — the exact request Vercel Cron makes,
// so no route changes are needed. A job that is still running is not started
// again. Logs one JSON line per run.
//
// Env:
//   CRON_BASE_URL   where the app listens, e.g. http://app:3000 (required)
//   CRON_SECRET     same value the app has (required)
//   CRON_TIMEOUT_MS per-call limit, default 300000 (Vercel's longest maxDuration)
//   CRON_CONFIG     path to vercel.json, default ./vercel.json
//   CRON_DRY_RUN=1  print what would run, call nothing

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { cronMatches, parseCron } from './cron-lib.mjs';

const baseUrl = (process.env.CRON_BASE_URL || '').replace(/\/+$/, '');
const secret = process.env.CRON_SECRET || '';
const timeoutMs = Number(process.env.CRON_TIMEOUT_MS || 300_000);
const dryRun = process.env.CRON_DRY_RUN === '1';
const configPath = resolve(process.env.CRON_CONFIG || 'vercel.json');

if (!baseUrl || (!secret && !dryRun)) {
  console.error(JSON.stringify({ level: 'error', msg: 'CRON_BASE_URL and CRON_SECRET are required' }));
  process.exit(1);
}

const jobs = JSON.parse(readFileSync(configPath, 'utf8')).crons.map((c) => ({ path: c.path, cron: parseCron(c.schedule) }));
const running = new Set();

function log(entry) {
  console.log(JSON.stringify({ at: new Date().toISOString(), ...entry }));
}

async function run(job) {
  if (running.has(job.path)) {
    log({ level: 'warn', path: job.path, msg: 'still running from last time, skipped' });
    return;
  }
  if (dryRun) {
    log({ level: 'info', path: job.path, msg: 'would run (dry run)' });
    return;
  }
  running.add(job.path);
  const started = Date.now();
  try {
    const response = await fetch(`${baseUrl}${job.path}`, {
      method: 'GET',
      headers: { Authorization: `Bearer ${secret}`, 'User-Agent': 'salsys-cron-runner/1' },
      signal: AbortSignal.timeout(timeoutMs),
    });
    await response.arrayBuffer().catch(() => undefined);
    log({ level: response.ok ? 'info' : 'error', path: job.path, status: response.status, ms: Date.now() - started });
  } catch (error) {
    log({ level: 'error', path: job.path, error: error instanceof Error ? error.message : String(error), ms: Date.now() - started });
  } finally {
    running.delete(job.path);
  }
}

function tick() {
  const now = new Date();
  for (const job of jobs) if (cronMatches(job.cron, now)) void run(job);
  // Wake at the start of the next minute.
  setTimeout(tick, 60_000 - (Date.now() % 60_000) + 50);
}

log({ level: 'info', msg: 'cron runner started', jobs: jobs.length, baseUrl, dryRun });
setTimeout(tick, 60_000 - (Date.now() % 60_000) + 50);
for (const signal of ['SIGTERM', 'SIGINT']) process.on(signal, () => process.exit(0));
