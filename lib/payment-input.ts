export type PaymentAmountInput = { state: 'missing' } | { state: 'invalid' } | { state: 'valid'; value: number };

/** INR/USD form input: positive decimal, at most two fractional digits, no lossy JS-number conversion. */
export function parsePaymentAmount(raw: unknown): PaymentAmountInput {
  if (raw === null || raw === undefined || (typeof raw === 'string' && !raw.trim())) return { state: 'missing' };
  if (typeof raw !== 'string') return { state: 'invalid' };
  const text = raw.trim();
  if (text.length > 32 || !/^\d+(?:\.\d{1,2})?$/.test(text)) return { state: 'invalid' };
  const [whole, fraction = ''] = text.split('.');
  const minor = BigInt(whole) * BigInt(100) + BigInt(fraction.padEnd(2, '0'));
  if (minor <= BigInt(0) || minor > BigInt(Number.MAX_SAFE_INTEGER)) return { state: 'invalid' };
  const canonical = `${BigInt(whole)}.${fraction.padEnd(2, '0')}`;
  const value = Number(text);
  if (!Number.isFinite(value)) return { state: 'invalid' };
  const serialized = JSON.stringify(value);
  if (!/^\d+(?:\.\d{1,2})?$/.test(serialized)) return { state: 'invalid' };
  const [sentWhole, sentFraction = ''] = serialized.split('.');
  if (`${BigInt(sentWhole)}.${sentFraction.padEnd(2, '0')}` !== canonical) return { state: 'invalid' };
  return { state: 'valid', value };
}
