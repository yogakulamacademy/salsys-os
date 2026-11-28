// Tiny cron matcher for the self-hosted scheduler (no dependencies).
// Supports the forms vercel.json uses: *, */n, a, a-b, a-b/n and lists.
// Times are UTC, exactly like Vercel Cron.

const RANGES = [
  [0, 59], // minute
  [0, 23], // hour
  [1, 31], // day of month
  [1, 12], // month
  [0, 6], // day of week (0 = Sunday; 7 also means Sunday)
];

function expandField(field, [min, max]) {
  const values = new Set();
  for (const part of field.split(',')) {
    const [rangePart, stepPart] = part.split('/');
    const step = stepPart === undefined ? 1 : Number(stepPart);
    if (!Number.isInteger(step) || step < 1) throw new Error(`Bad step in "${field}"`);
    let lo;
    let hi;
    if (rangePart === '*') {
      lo = min;
      hi = max;
    } else if (rangePart.includes('-')) {
      [lo, hi] = rangePart.split('-').map(Number);
    } else {
      lo = Number(rangePart);
      hi = stepPart === undefined ? lo : max;
    }
    if (!Number.isInteger(lo) || !Number.isInteger(hi)) throw new Error(`Bad value in "${field}"`);
    for (let v = lo; v <= hi; v += step) values.add(v === 7 && max === 6 ? 0 : v);
  }
  for (const v of values) if (v < min || v > max) throw new Error(`"${field}" is out of range`);
  return values;
}

export function parseCron(expression) {
  const fields = expression.trim().split(/\s+/);
  if (fields.length !== 5) throw new Error(`Cron "${expression}" needs 5 fields`);
  const sets = fields.map((f, i) => expandField(f, RANGES[i]));
  return { expression, sets, domStar: fields[2] === '*', dowStar: fields[4] === '*' };
}

/** True when the schedule fires in the UTC minute of `date`. */
export function cronMatches(parsed, date) {
  const [minute, hour, dom, month, dow] = parsed.sets;
  if (!minute.has(date.getUTCMinutes()) || !hour.has(date.getUTCHours()) || !month.has(date.getUTCMonth() + 1)) {
    return false;
  }
  const domOk = dom.has(date.getUTCDate());
  const dowOk = dow.has(date.getUTCDay());
  // Standard cron: when both day fields are restricted, either may match.
  if (!parsed.domStar && !parsed.dowStar) return domOk || dowOk;
  return domOk && dowOk;
}

export function knowledgeImportCronJob(env) {
  if (env.KNOWLEDGE_IMPORT_ENABLED !== '1') return null;

  const secret = env.KNOWLEDGE_IMPORT_WORKER_SECRET?.trim();
  if (!secret || secret.length < 32 || secret === env.CRON_SECRET?.trim()) {
    throw new Error('Knowledge import requires a dedicated worker scheduler secret');
  }
  return { path: '/api/knowledge-import-worker', cron: parseCron('* * * * *'), method: 'POST', secret };
}
