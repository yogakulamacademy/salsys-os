import 'server-only';

import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from 'node:crypto';

const VERSION = 'v1';
const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;

function encryptionKey() {
  const encoded =
    process.env.INTEGRATION_ENCRYPTION_KEY?.trim();

  if (!encoded) {
    throw new Error(
      'INTEGRATION_ENCRYPTION_KEY is not configured.',
    );
  }

  let key: Buffer;

  try {
    key = Buffer.from(encoded, 'base64');
  } catch {
    throw new Error(
      'INTEGRATION_ENCRYPTION_KEY must be a base64-encoded 32-byte key.',
    );
  }

  if (key.length !== 32) {
    throw new Error(
      'INTEGRATION_ENCRYPTION_KEY must decode to exactly 32 bytes.',
    );
  }

  return key;
}

export function encryptIntegrationSecret(
  plaintext: string,
) {
  if (!plaintext) {
    throw new Error(
      'Cannot encrypt an empty integration secret.',
    );
  }

  const iv =
    randomBytes(IV_LENGTH);

  const cipher =
    createCipheriv(
      ALGORITHM,
      encryptionKey(),
      iv,
    );

  const encrypted =
    Buffer.concat([
      cipher.update(
        plaintext,
        'utf8',
      ),
      cipher.final(),
    ]);

  const tag =
    cipher.getAuthTag();

  return [
    VERSION,
    iv.toString('base64url'),
    tag.toString('base64url'),
    encrypted.toString('base64url'),
  ].join(':');
}

export function decryptIntegrationSecret(
  ciphertext: string,
) {
  const [
    version,
    ivRaw,
    tagRaw,
    bodyRaw,
  ] =
    ciphertext.split(':');

  if (
    version !== VERSION ||
    !ivRaw ||
    !tagRaw ||
    !bodyRaw
  ) {
    throw new Error(
      'Unsupported integration secret format.',
    );
  }

  const decipher =
    createDecipheriv(
      ALGORITHM,
      encryptionKey(),
      Buffer.from(
        ivRaw,
        'base64url',
      ),
    );

  decipher.setAuthTag(
    Buffer.from(
      tagRaw,
      'base64url',
    ),
  );

  const decrypted =
    Buffer.concat([
      decipher.update(
        Buffer.from(
          bodyRaw,
          'base64url',
        ),
      ),
      decipher.final(),
    ]);

  return decrypted.toString('utf8');
}

export function createOAuthState() {
  return randomBytes(32).toString(
    'base64url',
  );
}

export function hashOAuthState(
  state: string,
) {
  return createHash('sha256')
    .update(
      state,
      'utf8',
    )
    .digest('hex');
}
