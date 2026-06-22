import { Pool, type PoolClient } from 'pg';
import type { Request } from 'express';

// The API + worker connect as the `dataflow_app` role so RLS applies.
// DATABASE_URL points at the superuser only for migrations / init scripts;
// APP_DATABASE_URL is the lower-privilege role used at runtime.
export const pool = new Pool({
  connectionString: process.env.APP_DATABASE_URL ?? process.env.DATABASE_URL,
});
// Prevent idle-client errors from crashing the process.
pool.on('error', (err) => console.error('pg pool idle-client error:', err.message));

// Run `fn` inside a tenant-scoped transaction. The SET LOCAL binds
// `app.tenant_id` to the request's tenant for the duration of the tx,
// which is what the RLS policies in 003_rls.sql read.
export async function withTenant<T>(
  tenantId: string,
  fn: (client: PoolClient) => Promise<T>,
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(`SET LOCAL app.tenant_id = '${tenantId.replace(/'/g, "''")}'`);
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    throw e;
  } finally {
    client.release();
  }
}

export function withTenantTx<T>(req: Request, fn: (client: PoolClient) => Promise<T>) {
  return withTenant(req.tenant.tenantId, fn);
}
