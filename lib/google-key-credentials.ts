import { JWT } from 'google-auth-library';

// Google access without Vercel (self-hosting, Nov 2026). On Vercel, GA4,
// Search Console and Google Ads sign in through Vercel's OIDC token and
// workload identity federation. A plain server has no OIDC issuer, so when
// GOOGLE_SERVICE_ACCOUNT_KEY_JSON is set (the key file of the same service
// account, as raw JSON or base64) these syncs use that key instead. When it is
// not set nothing changes and the Vercel path is used as before.

type ServiceAccountKey = { client_email: string; private_key: string };

export function googleServiceAccountKey(): ServiceAccountKey | null {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_KEY_JSON?.trim();
  if (!raw) return null;
  const text = raw.startsWith('{') ? raw : Buffer.from(raw, 'base64').toString('utf8');
  let parsed: Partial<ServiceAccountKey>;
  try {
    parsed = JSON.parse(text) as Partial<ServiceAccountKey>;
  } catch {
    throw new Error('GOOGLE_SERVICE_ACCOUNT_KEY_JSON is not valid JSON (raw or base64).');
  }
  if (!parsed.client_email || !parsed.private_key) {
    throw new Error('GOOGLE_SERVICE_ACCOUNT_KEY_JSON needs client_email and private_key.');
  }
  return { client_email: parsed.client_email, private_key: parsed.private_key };
}

export function googleKeyClient(scopes: string[]): JWT | null {
  const key = googleServiceAccountKey();
  if (!key) return null;
  return new JWT({ email: key.client_email, key: key.private_key, scopes });
}

/** An access token from the key, or null when no key is configured. */
export async function googleKeyAccessToken(scope: string): Promise<string | null> {
  const client = googleKeyClient([scope]);
  if (!client) return null;
  const { token } = await client.getAccessToken();
  if (!token) throw new Error('Google access token was not returned for the service account key.');
  return token;
}
