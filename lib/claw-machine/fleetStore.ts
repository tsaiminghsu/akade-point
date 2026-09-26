// Which store the claw machines' settings go to (see fleetRepository.ts).

import type { FleetRepository } from './fleetRepository';
import { createSqliteFleetRepository } from './sqliteFleetRepository';

/**
 * Whether the store is switched on. In development it always is; a
 * production build keeps the endpoint off unless CLAW_MACHINE_STORE is set,
 * since the SQLite file is a stopgap and the endpoint has no login yet.
 */
export function storeEnabled() {
  return process.env.NODE_ENV !== 'production' || process.env.CLAW_MACHINE_STORE === 'sqlite';
}

/** The repository in use: SQLite for now; the production database's goes here once it's planned. */
export function getFleetRepository(): FleetRepository {
  return createSqliteFleetRepository();
}
