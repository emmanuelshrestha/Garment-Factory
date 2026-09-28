/**
 * @deprecated Use `src/db/tenantManager.ts`. Kept as a re-export so any
 * leftover import still hits the registry rather than auto-creating a file.
 */
export { getTenantDb, closeAllTenantDbs as closeAllTenantConnections } from './tenantManager.ts';
