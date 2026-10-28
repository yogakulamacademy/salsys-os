export type BoundedJsonResult<T> =
  | {
      ok: true;
      value: T;
    }
  | {
      ok: false;
      status: 400 | 413;
      error: string;
    };

function declaredContentLength(request: Request) {
  const header = request.headers.get('content-length');
  if (!header) return null;

  const parsed = Number.parseInt(header, 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

export async function readBoundedJson<T>(
  request: Request,
  maxBytes: number,
): Promise<BoundedJsonResult<T>> {
  const declared = declaredContentLength(request);
  if (declared !== null && declared > maxBytes) {
    return {
      ok: false,
      status: 413,
      error: 'Payload too large.',
    };
  }

  if (!request.body) {
    return {
      ok: true,
      value: {} as T,
    };
  }

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;

      totalBytes += value.byteLength;
      if (totalBytes > maxBytes) {
        await reader.cancel().catch(() => undefined);
        return {
          ok: false,
          status: 413,
          error: 'Payload too large.',
        };
      }

      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  if (totalBytes === 0) {
    return {
      ok: true,
      value: {} as T,
    };
  }

  const bytes = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }

  const text = new TextDecoder().decode(bytes).trim();
  if (!text) {
    return {
      ok: true,
      value: {} as T,
    };
  }

  try {
    return {
      ok: true,
      value: JSON.parse(text) as T,
    };
  } catch {
    return {
      ok: false,
      status: 400,
      error: 'Invalid JSON payload.',
    };
  }
}
