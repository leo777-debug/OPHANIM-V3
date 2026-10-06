import 'server-only';

import { createClient } from '@supabase/supabase-js';
import { getSupabasePublicConfig, getSupabaseSecretKey } from './config';

export function createSupabaseAdminClient() {
  const config = getSupabasePublicConfig();
  const secretKey = getSupabaseSecretKey();
  if (!config || !secretKey) return null;

  return createClient(config.url, secretKey, {
    auth: { autoRefreshToken: false, detectSessionInUrl: false, persistSession: false },
  });
}
