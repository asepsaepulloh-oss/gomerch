import pg from "pg";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const connectionString = process.env.DATABASE_URL || "postgresql://postgres.yhdampyqswtizzhrfvxm:Kuncimasuk2007@aws-0-ap-northeast-1.pooler.supabase.com:5432/postgres";

async function runMigration() {
  console.log("Connecting to PostgreSQL Supabase instance...");
  const pool = new pg.Pool({
    connectionString,
    ssl: { rejectUnauthorized: false },
  });

  try {
    const client = await pool.connect();
    console.log("Connected successfully!");

    const migrationPath = path.resolve(__dirname, "../supabase/migrations/20261025000000_init_schema.sql");
    const sql = fs.readFileSync(migrationPath, "utf-8");

    console.log("Applying migration SQL schema and RLS policies...");
    await client.query(sql);

    console.log("Verifying created tables in public schema...");
    const res = await client.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      ORDER BY table_name;
    `);

    console.log("Active tables in database:");
    res.rows.forEach(r => console.log(` - ${r.table_name}`));

    client.release();
    await pool.end();
    console.log("Migration completed successfully!");
  } catch (err) {
    console.error("Migration error:", err);
    process.exit(1);
  }
}

runMigration();
