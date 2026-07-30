# Render deployment

Create the PostgreSQL database from `render.yaml`, then run `db/migrations/001_ophanim_watchlists.sql` once in Render's database shell. Set `APP_URL`, `RESEND_API_KEY`, `RESEND_FROM`, `RESEND_WEBHOOK_SECRET`, and give the cron service the same `WATCHLIST_CRON_SECRET` as the web service. Register `https://YOUR_APP/api/webhooks/resend` in Resend for sent, delivered, delayed, failed, bounced, complained, and suppressed events.
