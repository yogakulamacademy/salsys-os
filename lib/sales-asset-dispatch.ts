export type SalesAssetDispatchContext = {
  organizationId: string;
  assetId: string;
  channel: string;
  language?: string | null;
  course?: string | null;
  location?: string | null;
};

export type ResolvedSalesAsset = {
  assetId: string;
  organizationId: string;
  version: number;
  title: string;
  assetKind: 'image' | 'video' | 'pdf' | 'audio' | 'document' | 'other';
  mimeType: string;
  sizeBytes: number;
  accessibilityAltText: string | null;
  accessibilityCaption: string | null;
  safeReference: {
    bucket: 'sales-assets-private';
    path: string;
  };
};

type RpcError = { message?: string } | null;
type RpcResult = { data: unknown; error: RpcError };

type SalesAssetRpcClient = {
  rpc(
    name: string,
    args: Record<string, unknown>,
  ): PromiseLike<RpcResult>;
};

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function requiredString(record: Record<string, unknown>, key: string) {
  const value = record[key];
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(`Sales asset dispatch returned an invalid ${key}.`);
  }
  return value;
}

/**
 * Server-owned pre-delivery guard for a queued sales asset ID.
 *
 * Call this immediately before any provider send. It deliberately resolves the
 * current database state instead of trusting approval/scope metadata copied
 * into a queue item. The RPC is service-role-only and returns a private
 * bucket/path reference, never an arbitrary or public URL.
 */
export async function resolveSalesAssetForDispatch(
  supabase: SalesAssetRpcClient,
  context: SalesAssetDispatchContext,
): Promise<ResolvedSalesAsset> {
  const { data, error } = await supabase.rpc('resolve_sales_asset_for_dispatch_v1', {
    p_organization_id: context.organizationId,
    p_asset_id: context.assetId,
    p_channel: context.channel,
    p_language: context.language ?? null,
    p_course: context.course ?? null,
    p_location: context.location ?? null,
  });

  if (error) {
    throw new Error(error.message || 'Sales asset is not eligible for dispatch.');
  }

  const row = asRecord(data);
  if (!row) {
    throw new Error('Sales asset dispatch returned an invalid response.');
  }

  const reference = asRecord(row.safe_reference);
  if (!reference) {
    throw new Error('Sales asset dispatch returned no safe storage reference.');
  }

  const bucket = requiredString(reference, 'bucket');
  const path = requiredString(reference, 'path');
  const organizationId = requiredString(row, 'organization_id');
  const assetId = requiredString(row, 'asset_id');
  const title = requiredString(row, 'title');
  const assetKind = requiredString(row, 'asset_kind');
  const mimeType = requiredString(row, 'mime_type');
  const version = row.version;
  const sizeBytes = row.size_bytes;

  if (bucket !== 'sales-assets-private') {
    throw new Error('Sales asset dispatch rejected a non-private storage bucket.');
  }

  if (organizationId !== context.organizationId || assetId !== context.assetId) {
    throw new Error('Sales asset dispatch rejected a tenant or asset mismatch.');
  }

  if (!path.startsWith(`${context.organizationId}/`) || path.includes('://')) {
    throw new Error('Sales asset dispatch rejected an unsafe storage path.');
  }

  if (!Number.isInteger(version) || Number(version) <= 0) {
    throw new Error('Sales asset dispatch returned an invalid version.');
  }

  if (!Number.isInteger(sizeBytes) || Number(sizeBytes) <= 0) {
    throw new Error('Sales asset dispatch returned an invalid size.');
  }

  if (!['image', 'video', 'pdf', 'audio', 'document', 'other'].includes(assetKind)) {
    throw new Error('Sales asset dispatch returned an invalid asset kind.');
  }

  return {
    assetId,
    organizationId,
    version: Number(version),
    title,
    assetKind: assetKind as ResolvedSalesAsset['assetKind'],
    mimeType,
    sizeBytes: Number(sizeBytes),
    accessibilityAltText:
      typeof row.accessibility_alt_text === 'string' ? row.accessibility_alt_text : null,
    accessibilityCaption:
      typeof row.accessibility_caption === 'string' ? row.accessibility_caption : null,
    safeReference: {
      bucket: 'sales-assets-private',
      path,
    },
  };
}
