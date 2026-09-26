import { describe, expect, it } from 'vitest';
import {
  MAX_MACHINES, NAME_MAX, activeMachine, addMachine, defaultRig, nextMachineName, removeMachine, renameMachine,
  sanitizeFleet, selectMachine, updateMachine, type Fleet,
} from '../fleet';
import { defaultSettings } from '../settings';

const fresh = (): Fleet => sanitizeFleet(null);

describe('machine fleet', () => {
  it('starts with one factory-default machine', () => {
    const f = fresh();
    expect(f.machines).toHaveLength(1);
    expect(activeMachine(f).name).toBe('1號機');
    expect(activeMachine(f).settings).toEqual(defaultSettings());
    expect(activeMachine(f).rig).toEqual(defaultRig());
  });

  it('turns the single machine saved before fleets existed into 1號機', () => {
    const f = sanitizeFleet(null, {
      settings: { strongPower: 33, playTime: 45 },
      rig: { claw: 'two', stock: { categories: ['figure'], count: 20 } },
    });
    const m = activeMachine(f);
    expect(m.settings.strongPower).toBe(33);
    expect(m.settings.playTime).toBe(45);
    expect(m.rig.claw).toBe('two');
    expect(m.rig.stock.categories).toEqual(['figure']);
    expect(m.rig.stock.count).toBe(20);
  });

  it('keeps each machine’s settings, rig and books separate', () => {
    let f = fresh();
    f = addMachine(f);
    const second = activeMachine(f);
    expect(second.name).toBe('2號機');
    f = updateMachine(f, second.id, {
      settings: { ...second.settings, strongPower: 20 },
      rig: { ...second.rig, claw: 'kingkong' },
      books: { stats: { coins: 9, plays: 9, wins: 2, guarantees: 1 }, sinceGuarantee: 3 },
    });
    f = selectMachine(f, 'm1');
    expect(activeMachine(f).settings.strongPower).toBe(defaultSettings().strongPower);
    expect(activeMachine(f).rig.claw).toBe('standard');
    expect(activeMachine(f).books.stats.coins).toBe(0);
    // And it all survives a save/load round trip.
    const loaded = sanitizeFleet(JSON.parse(JSON.stringify(f)));
    const back = loaded.machines.find((m) => m.id === second.id)!;
    expect(back.settings.strongPower).toBe(20);
    expect(back.rig.claw).toBe('kingkong');
    expect(back.books.sinceGuarantee).toBe(3);
    expect(loaded.activeId).toBe('m1');
  });

  it('copies a machine’s settings and rig but starts its books at zero', () => {
    let f = fresh();
    f = updateMachine(f, 'm1', {
      settings: { ...defaultSettings(), weakPower: 3 },
      books: { stats: { coins: 5, plays: 5, wins: 1, guarantees: 0 }, sinceGuarantee: 4 },
    });
    f = addMachine(f, 'm1');
    const copy = activeMachine(f);
    expect(copy.id).not.toBe('m1');
    expect(copy.settings.weakPower).toBe(3);
    expect(copy.books.stats.coins).toBe(0);
    // A deep copy: editing the copy's stock leaves the original alone.
    copy.rig.stock.categories.push('ball');
    expect(f.machines[0].rig.stock.categories).toEqual(['plush']);
  });

  it('names new machines with the first free number', () => {
    expect(nextMachineName([{ name: '1號機' }, { name: '3號機' }])).toBe('2號機');
    expect(nextMachineName([{ name: '入口娃娃台' }])).toBe('1號機');
  });

  it('renames, trimming and capping the name, and ignores a blank one', () => {
    let f = fresh();
    f = renameMachine(f, 'm1', '  入口的巨無霸台  ');
    expect(activeMachine(f).name).toBe('入口的巨無霸台');
    f = renameMachine(f, 'm1', '   ');
    expect(activeMachine(f).name).toBe('入口的巨無霸台');
    f = renameMachine(f, 'm1', 'x'.repeat(40));
    expect(activeMachine(f).name).toHaveLength(NAME_MAX);
  });

  it('removes a machine and moves to its neighbour, but never the last one', () => {
    let f = addMachine(addMachine(fresh()));
    expect(f.machines.map((m) => m.name)).toEqual(['1號機', '2號機', '3號機']);
    f = selectMachine(f, 'm2');
    f = removeMachine(f, 'm2');
    expect(f.machines.map((m) => m.name)).toEqual(['1號機', '3號機']);
    expect(activeMachine(f).name).toBe('3號機');
    f = removeMachine(removeMachine(f, 'm3'), 'm1');
    expect(f.machines).toHaveLength(1);
  });

  it('sanitizes junk: duplicate ids, bad entries, an unknown active id, too many machines', () => {
    const f = sanitizeFleet({
      machines: [
        { id: 'a', name: 'A', settings: { strongPower: 999 } },
        { id: 'a', name: '' },
        'junk',
        ...Array.from({ length: 30 }, (_, i) => ({ id: `x${i}`, name: `X${i}` })),
      ],
      activeId: 'nope',
    });
    expect(f.machines.length).toBeLessThanOrEqual(MAX_MACHINES);
    expect(new Set(f.machines.map((m) => m.id)).size).toBe(f.machines.length);
    expect(f.machines[0].settings.strongPower).toBe(48);
    expect(f.machines[1].name).toBe('1號機');
    expect(f.activeId).toBe('a');
  });

  it('stops adding at the machine limit', () => {
    let f = fresh();
    for (let i = 0; i < MAX_MACHINES + 5; i++) f = addMachine(f);
    expect(f.machines).toHaveLength(MAX_MACHINES);
  });
});
