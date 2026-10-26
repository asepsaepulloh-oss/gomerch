import pg from "pg";

const connectionString = process.env.DATABASE_URL;

let pool: pg.Pool | null = null;

export function getPgPool(): pg.Pool | null {
  if (!connectionString) {
    return null;
  }
  if (!pool) {
    pool = new pg.Pool({
      connectionString,
      ssl: { rejectUnauthorized: false },
      max: 10,
      idleTimeoutMillis: 30000,
    });
  }
  return pool;
}
