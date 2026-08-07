import { Pool, QueryResultRow } from "pg";

// Singleton pool — reused across hot-reloads in development
const globalForPg = globalThis as unknown as { pgPool?: Pool };

if (!globalForPg.pgPool) {
  globalForPg.pgPool = new Pool({
    connectionString:
      process.env.DATABASE_URL ??
      "postgresql://postgres:postgres@localhost:5432/clarity",
    ssl: { rejectUnauthorized: false },
    max: 10,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 5_000,
  });
}

export const pool = globalForPg.pgPool;

/**
 * Execute a parameterized SQL query.
 * Usage: query('SELECT * FROM invoices WHERE id = $1', [42])
 */
export async function query<T extends QueryResultRow = QueryResultRow>(
  text: string,
  params?: unknown[]
) {
  const start = Date.now();
  const result = await pool.query<T>(text, params);
  const duration = Date.now() - start;

  if (process.env.NODE_ENV === "development") {
    console.log("[DB]", { text: text.slice(0, 80), duration, rows: result.rowCount });
  }

  return result;
}
