# Temporary access without sign-in

Ophanim currently defaults to one shared workspace with owner permissions. The operations overview, imports, shipment and rescue workflows, intelligence, knowledge, configuration, and provider tools use the same central actor, so they require no session cookie or user account. Anyone who can reach this deployment can read and edit this shared workspace, including administration and configured paid provider operations. Existing request limits, validation, same-origin checks, scan target restrictions, and credit confirmations continue to apply.

No new Vercel environment variable is necessary to enable this mode. Deploy this code to use it. Provider credentials and database configuration are still required for their respective features.

The shared identity uses organization ID `b89e9c10-6e65-4f11-92ec-0ce23f117001` and user ID `b89e9c10-6e65-4f11-92ec-0ce23f117002`. On first use with `DATABASE_URL`, the application creates these records and an owner membership in a transaction. Apply the existing database migrations first. Without `DATABASE_URL`, public tools still receive the shared identity, but persisted workspace operations report the existing database requirement. This mode never adopts another organization's identity, imports its private records, or changes database RLS policies. Existing SDK organization bindings remain enforced; an SDK intended for this workspace must target its organization ID.

The top bar identifies shared access and hides sign-out. `/login` redirects to the workspace (or a safe local return path). Supabase session refresh is skipped in shared mode. `/api/auth/me` returns the shared owner with `signInRequired: false` and no-store caching. Login, bootstrap, and logout endpoints do not create accounts or sessions in this mode.

To restore normal organization sign-in, set the server-only variable `OPHANIM_REQUIRE_SIGN_IN=true` and restart or redeploy. The original Supabase/legacy session verification and membership checks then apply again. Shared records remain in their own workspace; existing private organizations are unchanged.
