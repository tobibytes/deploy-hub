import { Pool } from 'pg';

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  // eslint-disable-next-line no-console
  console.warn('DATABASE_URL not set. Database features will be disabled.');
}

export const pool = connectionString
  ? new Pool({
      connectionString,
      ssl: { rejectUnauthorized: false },
    })
  : (null as unknown as Pool);

export async function query<T = any>(text: string, params?: any[]): Promise<{ rows: T[] }>{
  if (!pool) throw new Error('Database not configured. Set DATABASE_URL.');
  return pool.query(text, params);
}

export async function getClient() {
  if (!pool) throw new Error('Database not configured. Set DATABASE_URL.');
  return pool.connect();
}
