// Re-export from db.ts so the import path used by other phases stays stable.
export { withTenantTx, withTenant } from '../db';
