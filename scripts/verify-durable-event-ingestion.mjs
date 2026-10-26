import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8');
}

function assert(condition, message) {
  if (!condition) {
    console.error(`FAIL: ${message}`);
    process.exitCode = 1;
  } else {
    console.log(`PASS: ${message}`);
  }
}

const durable = read('lib/tracking/durable-events.ts');
const route = read('app/api/events/v1/route.ts');
const consumer = read('app/api/tracking/durable-events/consume/route.ts');
const vercel = JSON.parse(read('vercel.json'));

assert(
  durable.includes('getVercelOidcToken') &&
    durable.includes('vercel-queue.com/api/v3/topic/'),
  'trusted events use the independent Vercel durable queue',
);

assert(
  durable.includes('Vqs-Retention-Seconds') &&
    durable.includes('7 * 24 * 60 * 60'),
  'queue retention is explicitly configured for seven days',
);

assert(
  durable.includes('Vqs-Idempotency-Key') &&
    durable.includes('envelope.event.eventId'),
  'queue publishing uses stable event identity for deduplication',
);

assert(
  durable.includes('secretHash: sha256(secret)') &&
    !durable.includes('secret: secret'),
  'queue envelope stores only a hash of the tracking secret',
);

assert(
  durable.includes('timingSafeEqual') &&
    durable.includes(".eq('status', 'active')"),
  'consumer re-validates active source credentials before persistence',
);

assert(
  !durable.includes('drainDurableTrustedEvents') &&
    !durable.includes('receiveQueuedEvents') &&
    !durable.includes('acknowledgeQueuedEvent') &&
    !durable.includes('QUEUE_CONSUMER'),
  'obsolete manual polling and lease acknowledgement code is absent',
);

const publishIndex = route.indexOf('publishDurableTrustedEvent(envelope)');
const directIndex = route.indexOf('processDurableTrustedEvent(envelope)');
assert(
  publishIndex >= 0 && directIndex > publishIndex,
  'API attempts durable queue persistence before direct Supabase fallback',
);

assert(
  route.includes("verification.kind === 'verified'") &&
    route.includes("verification: 'deferred'") === false &&
    route.includes("? 'verified' : 'deferred'"),
  'API can defer credential verification only when the dependency is unavailable',
);

assert(
  route.includes("error: 'Event durability is temporarily unavailable.'") &&
    route.includes('status: 503') === false &&
    route.includes('503,'),
  'API returns a retryable 503 when both durable queue and Supabase persistence fail',
);

assert(
  consumer.includes("eventType !== 'com.vercel.queue.v2beta'") &&
    consumer.includes('queueName !== DURABLE_EVENT_QUEUE_TOPIC'),
  'private queue consumer validates Vercel queue CloudEvent metadata',
);

assert(
  consumer.includes('DurableEventPermanentError') &&
    consumer.includes('status: 503'),
  'consumer acknowledges permanent failures and retries transient failures',
);

const functionConfig =
  vercel.functions?.['app/api/tracking/durable-events/consume/route.ts'];
const trigger = functionConfig?.experimentalTriggers?.[0];
assert(
  trigger?.type === 'queue/v2beta' &&
    trigger?.topic === 'salsys-trusted-events-v1',
  'Vercel config binds the private consumer to the durable event topic',
);

assert(
  trigger?.maxDeliveries === undefined &&
    Number(trigger?.retryAfterSeconds) >= 30,
  'transient failures keep retrying for the queue retention window instead of stopping after a short delivery cap',
);

assert(
  Number(trigger?.maxConcurrency) >= 1 &&
    Number(trigger?.maxConcurrency) <= 10,
  'queue recovery concurrency is bounded to protect Supabase from backlog stampedes',
);

if (process.exitCode) {
  console.error('\nDurable event ingestion contract verification failed.');
  process.exit(process.exitCode);
}

console.log('\nDurable event ingestion contracts verified.');
