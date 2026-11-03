import type {
  ResolvedSalesAsset,
  SalesAssetDispatchContext,
} from '@/lib/sales-asset-dispatch';

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
    throw new Error(`Human sales asset dispatch returned an invalid ${key}.`);
  }
  return value;
}

export type HumanResolvedSalesAsset = ResolvedSalesAsset & {
  autoSendAllowed: boolean;
};

/**
 * Server-only current-state resolver for a human-selected Sales Asset.
 *
 * Manual use does not require auto_send_allowed, but every other dispatch
 * boundary is rechecked from the database. The private bucket/path reference
 * returned here must remain server-side.
 */
export async function resolveSalesAssetForHumanDispatch(
  supabase: SalesAssetRpcClient,
  context: SalesAssetDispatchContext,
): Promise<HumanResolvedSalesAsset> {
  const { data, error } = await supabase.rpc(
    'resolve_sales_asset_for_human_dispatch_v1',
    {
      p_organization_id: context.organizationId,
      p_asset_id: context.assetId,
      p_channel: context.channel,
      p_language: context.language ?? null,
      p_course: context.course ?? null,
      p_location: context.location ?? null,
    },
  );

  if (error) {
    throw new Error(
      error.message || 'Sales asset is not eligible for human dispatch.',
    );
  }

  const row = asRecord(data);
  if (!row) {
    throw new Error('Human sales asset dispatch returned an invalid response.');
  }

  const reference = asRecord(row.safe_reference);
  if (!reference) {
    throw new Error(
      'Human sales asset dispatch returned no safe storage reference.',
    );
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
    throw new Error(
      'Human sales asset dispatch rejected a non-private storage bucket.',
    );
  }

  if (organizationId !== context.organizationId || assetId !== context.assetId) {
    throw new Error(
      'Human sales asset dispatch rejected a tenant or asset mismatch.',
    );
  }

  if (!path.startsWith(`${context.organizationId}/`) || path.includes('://')) {
    throw new Error('Human sales asset dispatch rejected an unsafe storage path.');
  }

  if (!Number.isInteger(version) || Number(version) <= 0) {
    throw new Error('Human sales asset dispatch returned an invalid version.');
  }

  if (!Number.isInteger(sizeBytes) || Number(sizeBytes) <= 0) {
    throw new Error('Human sales asset dispatch returned an invalid size.');
  }

  if (!['image', 'video', 'pdf', 'audio', 'document', 'other'].includes(assetKind)) {
    throw new Error('Human sales asset dispatch returned an invalid asset kind.');
  }

  return {
    assetId,
    organizationId,
    version: Number(version),
    title,
    assetKind: assetKind as ResolvedSalesAsset['assetKind'],
    mimeType,
    sizeBytes: Number(sizeBytes),
    autoSendAllowed: row.auto_send_allowed === true,
    accessibilityAltText:
      typeof row.accessibility_alt_text === 'string'
        ? row.accessibility_alt_text
        : null,
    accessibilityCaption:
      typeof row.accessibility_caption === 'string'
        ? row.accessibility_caption
        : null,
    safeReference: {
      bucket: 'sales-assets-private',
      path,
    },
  };
}
