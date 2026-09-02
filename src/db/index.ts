import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

const databaseUrl = process.env.DATABASE_URL;

const globalForDb = globalThis as typeof globalThis & {
  __arenaNextJsPostgresqlPool?: Pool;
};

// The planner is local-first (IndexedDB), so DATABASE_URL is optional.
// When it is not configured (for example on Vercel), keep DB initialization
// from failing at module-load/build time. The health endpoint already treats
// the database as an optional diagnostic and will report it as unavailable.
export const pool =
  databaseUrl
    ? globalForDb.__arenaNextJsPostgresqlPool ??
      new Pool({
        connectionString: databaseUrl,
      })
    : undefined;

if (databaseUrl && process.env.NODE_ENV !== "production" && pool) {
  globalForDb.__arenaNextJsPostgresqlPool = pool;
}

// Keep the existing `db` export/type for consumers while allowing the
// local-first app to build without a DATABASE_URL. Any actual DB operation
// without a configured database will fail at use-time and can be handled by
// the caller (such as /api/health).
export const db = pool
  ? drizzle(pool)
  : (undefined as unknown as ReturnType<typeof drizzle>);
