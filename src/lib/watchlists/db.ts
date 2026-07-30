import { Pool } from 'pg';
let pool: Pool | undefined;
export function db() { if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required for persisted watchlists.'); return pool ||= new Pool({ connectionString: process.env.DATABASE_URL, ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : undefined }); }
