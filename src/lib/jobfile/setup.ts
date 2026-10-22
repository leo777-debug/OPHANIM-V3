// Setup status for job files: which integrations are configured. Presence only;
// values are never read back or shown. Every integration has a stub mode.
export type SetupItem = { id: string; name: string; variables: string[]; optional?: string[]; unlocks: string; withoutKey: string };

export const JOBFILE_INTEGRATIONS: SetupItem[] = [
  { id: 'database', name: 'Database', variables: ['DATABASE_URL'], unlocks: 'Real job files per organization (migrations 026 and 20261022090000 after 025)', withoutKey: 'SYNTHETIC DEMO data in memory, labelled on every page' },
  { id: 'storage', name: 'Private document storage', variables: [], optional: ['JOBFILE_STORAGE_DIR', 'SUPABASE_SERVICE_ROLE_KEY'], unlocks: 'Photos and documents in the private Supabase bucket or a private folder', withoutKey: 'Uploads refused outside demo mode' },
  { id: 'signing', name: 'Signed private-file links', variables: ['JOBFILE_URL_SIGNING_SECRET'], unlocks: 'Expiring links to private files stored on disk', withoutKey: 'Supabase signed URLs only' },
  { id: 'cron', name: 'Scheduled jobs', variables: ['JOBFILE_CRON_SECRET'], unlocks: 'IMAP polling, watched-folder imports, daily digest', withoutKey: 'Cron routes refuse requests' },
  { id: 'inbound-email', name: 'Inbound email webhook', variables: ['INBOUND_EMAIL_SECRET', 'INBOUND_EMAIL_DOMAIN'], unlocks: 'One signed inbound address per organization', withoutKey: 'Stub: forward or upload in the app' },
  { id: 'imap', name: 'IMAP mailbox', variables: ['IMAP_HOST', 'IMAP_USER', 'IMAP_PASSWORD', 'IMAP_ORGANIZATION_ID'], optional: ['IMAP_PORT', 'IMAP_TLS', 'IMAP_MAILBOX'], unlocks: 'Polls one dedicated mailbox', withoutKey: 'Stub' },
  { id: 'whatsapp', name: 'WhatsApp Business (Cloud API)', variables: ['WHATSAPP_ACCESS_TOKEN', 'WHATSAPP_APP_SECRET', 'WHATSAPP_VERIFY_TOKEN', 'WHATSAPP_ORGANIZATION_ID'], optional: ['WHATSAPP_PHONE_NUMBER_ID', 'JOBFILE_DIGEST_WHATSAPP_TO'], unlocks: 'Photos and messages to the business number become intake items', withoutKey: 'Stub: phone capture page' },
  { id: 'vision', name: 'AI document reading', variables: ['AI_BASE_URL', 'AI_MODEL', 'JOBFILE_AI_READING'], optional: ['AI_API_KEY', 'JOBFILE_VISION_MODEL', 'JOBFILE_AI_EMAIL_MILESTONES'], unlocks: 'Vision model reads photographed papers (and, optionally, email milestones)', withoutKey: 'Tesseract OCR or typed values' },
  { id: 'tesseract', name: 'Local OCR (Tesseract, eng+ara)', variables: ['TESSERACT_PATH'], optional: ['TESSERACT_LANGUAGES'], unlocks: 'Offline OCR with word boxes, lower confidence', withoutKey: 'Typed values' },
  { id: 'email-out', name: 'Digest email (Resend)', variables: ['RESEND_API_KEY', 'RESEND_FROM'], unlocks: 'Daily Today-list email', withoutKey: 'Digest preview only' },
  { id: 'einvoice', name: 'E-invoice ASP adapter', variables: ['EINVOICE_ASP_URL', 'EINVOICE_ASP_TOKEN', 'EINVOICE_ASP_VALIDATED'], optional: ['EINVOICE_SELLER_NAME', 'EINVOICE_SELLER_TRN'], unlocks: 'PINT AE submission through an accredited provider after validation', withoutKey: 'Stub: unvalidated PINT AE-shaped XML, nothing sent' },
  { id: 'watch', name: 'Watched upload folder', variables: ['JOBFILE_WATCH_DIR', 'JOBFILE_WATCH_ORGANIZATION_ID'], unlocks: 'Scheduled tracking-sheet imports', withoutKey: 'Upload in the app or email from a remembered sender' },
];

export function setupStatus(env: NodeJS.ProcessEnv = process.env) {
  return JOBFILE_INTEGRATIONS.map(item => {
    const missing = item.variables.filter(name => !env[name]?.trim());
    const configured = item.id === 'storage' ? Boolean(env.JOBFILE_STORAGE_DIR || env.KNOWLEDGE_STORAGE_DIR || env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SECRET_KEY) : !missing.length && (item.id !== 'vision' || env.JOBFILE_AI_READING === 'true');
    return { ...item, configured, missing: configured ? [] : missing, mode: configured ? 'configured' : 'stub' };
  });
}
