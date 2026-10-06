export interface SupabasePublicConfig {
  url: string;
  publishableKey: string;
}

function value(name: string): string | undefined {
  const configured = process.env[name]?.trim();
  return configured || undefined;
}

export function getSupabasePublicConfig(): SupabasePublicConfig | null {
  const url = value('NEXT_PUBLIC_SUPABASE_URL') ?? value('SUPABASE_URL');
  const publishableKey = value('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY') ?? value('SUPABASE_PUBLISHABLE_KEY');
  return url && publishableKey ? { url, publishableKey } : null;
}

export function getSupabaseSecretKey(): string | null {
  const secretKey = value('SUPABASE_SECRET_KEY') ?? value('SUPABASE_SERVICE_ROLE_KEY');
  if (!secretKey) return null;
  const publicKey = getSupabasePublicConfig()?.publishableKey;
  if (publicKey && secretKey === publicKey) throw new Error('The Supabase backend key must not be the publishable key.');
  return secretKey;
}
