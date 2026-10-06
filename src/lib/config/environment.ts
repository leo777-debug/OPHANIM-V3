export interface EnvironmentCheck {
  name: string;
  configured: boolean;
  required: boolean;
}

export function environmentChecks(): EnvironmentCheck[] {
  const production = process.env.NODE_ENV === 'production';
  return [
    { name: 'DATABASE_URL', configured: Boolean(process.env.DATABASE_URL), required: production },
    { name: 'APP_URL', configured: Boolean(process.env.APP_URL), required: production },
    { name: 'RESEND_API_KEY', configured: Boolean(process.env.RESEND_API_KEY), required: false },
    { name: 'RESEND_FROM', configured: Boolean(process.env.RESEND_FROM), required: false },
    { name: 'WATCHLIST_CRON_SECRET', configured: Boolean(process.env.WATCHLIST_CRON_SECRET), required: production },
    { name: 'IMPORT_CRON_SECRET', configured: Boolean(process.env.IMPORT_CRON_SECRET), required: production },
  ];
}

export function criticalEnvironmentIssue(): string | null {
  const missing = environmentChecks().filter((check) => check.required && !check.configured).map((check) => check.name);
  return missing.length ? `Missing required environment configuration: ${missing.join(', ')}` : null;
}
