// SQLite storage for the claw machines' settings: the stopgap until the
// production database is planned (see fleetRepository.ts).
//
// Uses Node's built-in `node:sqlite` (Node 22.5+; no native package to
// build). It's fetched with process.getBuiltinModule so the bundler never
// tries to resolve it. On an older Node the repository throws
// StoreUnavailableError and the game keeps its settings in the browser.
//
// Tables:
//   claw_fleets   (shop PK, active_id, saved_at)
//   claw_machines (shop, id, position, name, config JSON, saved_at; PK shop + id)
//
// The file is data/claw-machine.sqlite (git-ignored), or CLAW_MACHINE_DB.

import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { StoreUnavailableError, type FleetRepository, type StoredFleet } from './fleetRepository';

/** The bits of node:sqlite used here (@types/node 20 has no typings for it). */
interface Statement {
  run(...params: unknown[]): unknown;
  get(...params: unknown[]): unknown;
  all(...params: unknown[]): unknown[];
}
interface Database {
  exec(sql: string): void;
  prepare(sql: string): Statement;
  close(): void;
}
type DatabaseCtor = new (file: string) => Database;

const SCHEMA = `
  PRAGMA journal_mode = WAL;
  CREATE TABLE IF NOT EXISTS claw_fleets (
    shop TEXT PRIMARY KEY,
    active_id TEXT NOT NULL,
    saved_at INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS claw_machines (
    shop TEXT NOT NULL,
    id TEXT NOT NULL,
    position INTEGER NOT NULL,
    name TEXT NOT NULL,
    config TEXT NOT NULL,
    saved_at INTEGER NOT NULL,
    PRIMARY KEY (shop, id)
  );
`;

export function defaultDbPath() {
  return process.env.CLAW_MACHINE_DB ?? path.join(process.cwd(), 'data', 'claw-machine.sqlite');
}

function openDatabase(file: string): Database {
  const getBuiltin = (process as unknown as { getBuiltinModule?: (id: string) => unknown }).getBuiltinModule;
  const sqlite = getBuiltin?.('node:sqlite') as { DatabaseSync?: DatabaseCtor } | undefined;
  if (!sqlite?.DatabaseSync) throw new StoreUnavailableError('SQLite needs Node 22.5 or later (node:sqlite)');
  mkdirSync(path.dirname(file), { recursive: true });
  const db = new sqlite.DatabaseSync(file);
  db.exec(SCHEMA);
  return db;
}

// One connection per file per server process; kept on globalThis so dev
// hot reloads don't pile up open handles.
const cache = ((globalThis as { __clawFleetDbs?: Map<string, Database> }).__clawFleetDbs ??= new Map());

function databaseAt(file: string) {
  let db = cache.get(file);
  if (!db) {
    db = openDatabase(file);
    cache.set(file, db);
  }
  return db;
}

/** Close a cached connection (tests use their own files). */
export function closeSqliteFleetDb(file: string = defaultDbPath()) {
  cache.get(file)?.close();
  cache.delete(file);
}

interface FleetRow { active_id: string; saved_at: number }
interface MachineRow { id: string; name: string; config: string }

export function createSqliteFleetRepository(file: string = defaultDbPath()): FleetRepository {
  return {
    async load(shop) {
      const db = databaseAt(file);
      const fleet = db.prepare('SELECT active_id, saved_at FROM claw_fleets WHERE shop = ?').get(shop) as FleetRow | undefined;
      if (!fleet) return null;
      const rows = db.prepare('SELECT id, name, config FROM claw_machines WHERE shop = ? ORDER BY position').all(shop) as MachineRow[];
      if (rows.length === 0) return null;
      return {
        activeId: fleet.active_id,
        savedAt: Number(fleet.saved_at),
        machines: rows.map((r) => ({ id: r.id, name: r.name, config: JSON.parse(r.config) as Record<string, unknown> })),
      };
    },

    async save(shop, fleet: StoredFleet) {
      const db = databaseAt(file);
      db.exec('BEGIN');
      try {
        db.prepare(`INSERT INTO claw_fleets (shop, active_id, saved_at) VALUES (?, ?, ?)
          ON CONFLICT(shop) DO UPDATE SET active_id = excluded.active_id, saved_at = excluded.saved_at`)
          .run(shop, fleet.activeId, fleet.savedAt);
        db.prepare('DELETE FROM claw_machines WHERE shop = ?').run(shop);
        const insert = db.prepare(
          'INSERT INTO claw_machines (shop, id, position, name, config, saved_at) VALUES (?, ?, ?, ?, ?, ?)',
        );
        fleet.machines.forEach((m, i) => insert.run(shop, m.id, i, m.name, JSON.stringify(m.config), fleet.savedAt));
        db.exec('COMMIT');
      } catch (e) {
        db.exec('ROLLBACK');
        throw e;
      }
    },

    async remove(shop) {
      const db = databaseAt(file);
      db.prepare('DELETE FROM claw_machines WHERE shop = ?').run(shop);
      db.prepare('DELETE FROM claw_fleets WHERE shop = ?').run(shop);
    },
  };
}
