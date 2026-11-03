import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const recoveryDir = path.join(root, 'supabase', 'recovery');
const migrationsDir = path.join(root, 'supabase', 'migrations');
const databaseTestsDir = path.join(root, 'tests', 'database');

const target = path.join(
  migrationsDir,
  '20261019154130_event_lifecycle_projection_v1.sql',
);

const prefixPath = path.join(
  recoveryDir,
  '20261019154130_event_lifecycle_projection_prefix.sql',
);
const suffixPath = path.join(
  recoveryDir,
  '20261019154130_event_lifecycle_projection_suffix.sql',
);

const processorFiles = [
  {
    name: 'payment',
    path: path.join(
      databaseTestsDir,
      'process-payment-raw-event-v1.production-baseline.sql',
    ),
    md5: '9a002d3693411bd548a58fbd7a937de0',
  },
  {
    name: 'enrollment',
    path: path.join(
      databaseTestsDir,
      'process-enrollment-raw-event-v1.production-baseline.sql',
    ),
    md5: '4ba0b10a80e0c205a3f6cc07bffa7c16',
  },
  {
    name: 'dispatcher',
    path: path.join(
      databaseTestsDir,
      'process-tracking-raw-event-v1.production-baseline.sql',
    ),
    md5: '6fa37e3bfe601ed724263c05d7678e39',
  },
];

function read(filePath) {
  return fs.readFileSync(filePath, 'utf8');
}

function md5(value) {
  return crypto.createHash('md5').update(value).digest('hex');
}

const verifiedProcessors = processorFiles.map((processor) => {
  const content = read(processor.path);
  const actualMd5 = md5(content);

  if (actualMd5 !== processor.md5) {
    throw new Error(
      `${processor.name} production baseline hash mismatch: expected ${processor.md5}, got ${actualMd5}`,
    );
  }

  return {
    ...processor,
    content,
    bytes: Buffer.byteLength(content),
  };
});

const prefix = read(prefixPath).trimEnd();
const suffix = read(suffixPath).trim();

const assembled = [
  prefix,
  ...verifiedProcessors.map((processor) => `${processor.content.trimEnd()};`),
  suffix,
  '',
].join('\n\n');

for (const marker of [
  'create table if not exists public.tracking_entity_references',
  'public.process_booking_raw_event_v1',
  'public.process_payment_raw_event_v1',
  'public.process_enrollment_raw_event_v1',
  'public.process_tracking_raw_event_v1',
  'commit;',
]) {
  if (!assembled.toLowerCase().includes(marker.toLowerCase())) {
    throw new Error(`Assembled lifecycle recovery is missing marker: ${marker}`);
  }
}

fs.writeFileSync(target, assembled);

console.error(JSON.stringify({
  staged: path.relative(root, target),
  bytes: Buffer.byteLength(assembled),
  processors: verifiedProcessors.map((processor) => ({
    name: processor.name,
    bytes: processor.bytes,
    md5: processor.md5,
  })),
}, null, 2));
