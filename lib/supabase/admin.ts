import {
  createClient,
  type SupabaseClient,
} from '@supabase/supabase-js';


export function createAdminClient():
SupabaseClient {
  const url =
    process.env
      .NEXT_PUBLIC_SUPABASE_URL
      ?.trim() ||
    process.env
      .SUPABASE_URL
      ?.trim();

  const key =
    process.env
      .SUPABASE_SECRET_KEY
      ?.trim() ||
    process.env
      .SUPABASE_SERVICE_ROLE_KEY
      ?.trim();

  if (!url || !key) {
    throw new Error(
      'Supabase admin environment variables are not configured.'
    );
  }

  return createClient(
    url,
    key,
    {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    }
  );
}
