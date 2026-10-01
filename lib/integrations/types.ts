export type IntegrationProvider =
  | 'google'
  | 'meta'
  | 'whatsapp';

export type IntegrationAuthMode =
  | 'oauth_user'
  | 'service_account'
  | 'system_user'
  | 'embedded_signup'
  | 'manual_token';

export type IntegrationStatus =
  | 'pending'
  | 'connected'
  | 'expired'
  | 'error'
  | 'revoked'
  | 'disconnected';

export type IntegrationAssetType =
  | 'ga4_property'
  | 'search_console_site'
  | 'google_ads_customer'
  | 'meta_business'
  | 'meta_ad_account'
  | 'facebook_page'
  | 'instagram_account'
  | 'whatsapp_business_account'
  | 'whatsapp_phone_number';

export type IntegrationConnection = {
  id: string;
  provider: IntegrationProvider;
  auth_mode: IntegrationAuthMode;
  status: IntegrationStatus;
  parent_connection_id: string | null;
  external_account_id: string | null;
  account_name: string | null;
  account_email: string | null;
  scopes: string[];
  token_expires_at: string | null;
  token_type: string | null;
  provider_metadata: Record<string, unknown>;
  connected_by: string | null;
  connected_at: string | null;
  last_verified_at: string | null;
  last_error: string | null;
  created_at: string;
  updated_at: string;
};

export type IntegrationAsset = {
  id: string;
  connection_id: string;
  asset_type: IntegrationAssetType;
  external_id: string;
  name: string | null;
  status: 'available' | 'selected' | 'unavailable';
  is_selected: boolean;
  metadata: Record<string, unknown>;
  discovered_at: string;
  updated_at: string;
};

export type IntegrationWorkspace = {
  installed: boolean;
  error: string | null;
  connections: IntegrationConnection[];
  assets: IntegrationAsset[];
};
