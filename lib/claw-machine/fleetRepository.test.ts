import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { FLEET_LIMITS, isShopCode, parseFleetBody, toGameFleet } from './fleetRepository';
import { closeSqliteFleetDb, createSqliteFleetRepository } from './sqliteFleetRepository';

const dir = mkdtempSync(path.join(tmpdir(), 'claw-fleet-'));
const file = path.join(dir, 'fleet.sqlite');

afterAll(() => {
  closeSqliteFleetDb(file);
  rmSync(dir, { recursive: true, force: true });
});

function machine(id: string, name: string, field = 'flat') {
  return { id, name, settings: { playTime: 30 }, rig: { field, claw: 'magnet' }, books: { stats: { coins: 3 }, sinceGuarantee: 1 } };
}

describe('claw machine fleet store', () => {
  it('takes only a well-formed fleet', () => {
    const good = parseFleetBody({ fleet: { machines: [machine('m1', '1號機'), machine('m2', '大怒神')], activeId: 'm2' }, savedAt: 123 });
    expect(good).toEqual({
      activeId: 'm2',
      savedAt: 123,
      machines: [
        { id: 'm1', name: '1號機', config: { settings: { playTime: 30 }, rig: { field: 'flat', claw: 'magnet' }, books: { stats: { coins: 3 }, sinceGuarantee: 1 } } },
        { id: 'm2', name: '大怒神', config: { settings: { playTime: 30 }, rig: { field: 'flat', claw: 'magnet' }, books: { stats: { coins: 3 }, sinceGuarantee: 1 } } },
      ],
    });
    // An unknown active machine falls back to the first.
    expect(parseFleetBody({ fleet: { machines: [machine('m1', 'a')], activeId: 'zz' } })?.activeId).toBe('m1');
    expect(parseFleetBody(null)).toBeNull();
    expect(parseFleetBody({ fleet: { machines: [] } })).toBeNull();
    expect(parseFleetBody({ fleet: { machines: [machine('m1', 'a'), machine('m1', 'b')] } })).toBeNull(); // same id twice
    expect(parseFleetBody({ fleet: { machines: [{ ...machine('m1', 'a'), rig: 'x' }] } })).toBeNull();
    expect(parseFleetBody({ fleet: { machines: [machine('../x', 'a')] } })).toBeNull();
    const many = Array.from({ length: FLEET_LIMITS.machines + 1 }, (_, i) => machine(`m${i}`, `${i}`));
    expect(parseFleetBody({ fleet: { machines: many } })).toBeNull();
    expect(isShopCode('default')).toBe(true);
    expect(isShopCode('e2e-123_abc')).toBe(true);
    expect(isShopCode('a b')).toBe(false);
    expect(isShopCode('')).toBe(false);
  });

  it('saves a shop’s machines in SQLite and loads them back in order, apart from other shops', async () => {
    const repo = createSqliteFleetRepository(file);
    expect(await repo.load('shop-a')).toBeNull();
    const fleet = parseFleetBody({ fleet: { machines: [machine('m2', '二號'), machine('m1', '一號', 'tower')], activeId: 'm1' }, savedAt: 1000 })!;
    await repo.save('shop-a', fleet);
    await repo.save('shop-b', parseFleetBody({ fleet: { machines: [machine('x', 'X')] }, savedAt: 5 })!);
    const back = await repo.load('shop-a');
    expect(back).toEqual(fleet);
    expect(toGameFleet(back!).machines.map((m) => m.id)).toEqual(['m2', 'm1']);
    expect(toGameFleet(back!).machines[1]).toMatchObject({ id: 'm1', name: '一號', rig: { field: 'tower' } });

    // Saving again replaces the shop's machines (one taken out, one renamed).
    await repo.save('shop-a', parseFleetBody({ fleet: { machines: [machine('m1', '改名')], activeId: 'm1' }, savedAt: 2000 })!);
    const again = await repo.load('shop-a');
    expect(again?.machines.map((m) => [m.id, m.name])).toEqual([['m1', '改名']]);
    expect(again?.savedAt).toBe(2000);
    expect((await repo.load('shop-b'))?.machines).toHaveLength(1);

    // A fresh connection to the same file sees it too.
    closeSqliteFleetDb(file);
    expect((await createSqliteFleetRepository(file).load('shop-a'))?.machines[0].name).toBe('改名');

    await repo.remove('shop-a');
    expect(await repo.load('shop-a')).toBeNull();
    expect(await repo.load('shop-b')).not.toBeNull();
  });
});
