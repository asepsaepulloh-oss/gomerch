import pg from "pg";

const connectionString =
  process.env.DATABASE_URL ||
  "postgresql://postgres.yhdampyqswtizzhrfvxm:Kuncimasuk2007@aws-0-ap-northeast-1.pooler.supabase.com:5432/postgres";

let pool: pg.Pool | null = null;

export function getPgPool(): pg.Pool {
  if (!pool) {
    pool = new pg.Pool({
      connectionString,
      ssl: { rejectUnauthorized: false },
      max: 10,
      idleTimeoutMillis: 30000,
    });

    pool.on("error", (err) => {
      console.error("Unexpected error on idle pg client:", err);
    });
  }
  return pool;
}

export async function query<T = any>(text: string, params?: any[]): Promise<T[]> {
  const p = getPgPool();
  const res = await p.query(text, params);
  return res.rows;
}

export async function queryOne<T = any>(text: string, params?: any[]): Promise<T | null> {
  const rows = await query<T>(text, params);
  return rows[0] || null;
}
