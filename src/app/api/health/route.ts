import { sql } from 'drizzle-orm';
import { db } from '@/db';

export const dynamic = 'force-dynamic';

/**
 * Health endpoint. The planner itself is local-first (IndexedDB in the browser),
 * so the database is reported as an optional diagnostic rather than a hard
 * requirement for the app to work.
 */
export async function GET() {
  let database: 'connected' | 'unavailable' = 'unavailable';
  try {
    await db.execute(sql`select 1`);
    database = 'connected';
  } catch {
    database = 'unavailable';
  }

  return Response.json({
    ok: true,
    status: 'healthy',
    app: 'planner',
    storage: 'indexeddb (client-side, offline-first)',
    database,
    timestamp: new Date().toISOString(),
  });
}
