import { describe, it, expect } from 'vitest';
import { WantedSystem, MAX_STARS } from '../wanted';

/** Run `seconds` of simulated time at 60fps. */
function advance(w: WantedSystem, seconds: number, seen: boolean, chased = seen) {
  const dt = 1 / 60;
  let units = 0;
  for (let i = 0; i < Math.round(seconds * 60); i++) {
    units = w.update(dt, seen, chased && w.stars > 0);
  }
  return units;
}

describe('crimes', () => {
  it('adds one star for ordinary crimes and two for stealing a police car', () => {
    const w = new WantedSystem();
    w.addCrime('hitPed');
    expect(w.stars).toBe(1);
    w.addCrime('carjack');
    expect(w.stars).toBe(2);
    w.addCrime('hitPolice');
    expect(w.stars).toBe(3);

    const w2 = new WantedSystem();
    w2.addCrime('carjackPolice');
    expect(w2.stars).toBe(2);
  });

  it('never exceeds the maximum', () => {
    const w = new WantedSystem();
    for (let i = 0; i < 20; i++) w.addCrime('carjackPolice');
    expect(w.stars).toBe(MAX_STARS);
  });

  it('notifies on every change, with the previous value', () => {
    const seen: Array<[number, number]> = [];
    const w = new WantedSystem({ onStarsChanged: (s, p) => seen.push([s, p]) });
    w.addCrime('hitPed');
    w.addCrime('hitPed');
    w.clear();
    expect(seen).toEqual([[1, 0], [2, 1], [0, 2]]);
  });
});

describe('evading', () => {
  it('drops a star only after staying out of sight long enough', () => {
    const w = new WantedSystem();
    w.addCrime('hitPed');            // 1 star, threshold = 20 + 2.5 = 22.5s

    advance(w, 20, false);
    expect(w.stars).toBe(1);

    advance(w, 4, false);
    expect(w.stars).toBe(0);
  });

  it('resets the hiding clock whenever the player is spotted', () => {
    const w = new WantedSystem();
    w.addCrime('hitPed');

    advance(w, 20, false);
    expect(w.evadeTimer).toBeGreaterThan(19);

    advance(w, 0.5, true);           // spotted
    expect(w.evadeTimer).toBe(0);

    advance(w, 10, false);
    expect(w.stars).toBe(1);         // nowhere near the threshold again
  });

  it('reports evading only after the grace period', () => {
    const w = new WantedSystem();
    w.addCrime('hitPed');
    expect(w.evading).toBe(false);
    advance(w, 1, false);
    expect(w.evading).toBe(false);   // still inside the 2s grace
    advance(w, 3, false);
    expect(w.evading).toBe(true);
  });

  it('takes longer to shake off a higher wanted level', () => {
    const low = new WantedSystem();
    low.addCrime('hitPed');
    const lowThreshold = low.evadeRemaining;

    const high = new WantedSystem();
    high.set(4);
    const highThreshold = high.evadeRemaining;

    expect(highThreshold).toBeGreaterThan(lowThreshold);
  });

  it('does nothing at zero stars', () => {
    const w = new WantedSystem();
    expect(advance(w, 60, false)).toBe(0);
    expect(w.stars).toBe(0);
    expect(w.evading).toBe(false);
  });
});

describe('escalation', () => {
  it('adds a star after a long pursuit', () => {
    const w = new WantedSystem();
    w.addCrime('hitPed');
    advance(w, 39, true);
    expect(w.stars).toBe(1);
    advance(w, 3, true);
    expect(w.stars).toBe(2);
  });

  it('resets the pursuit clock once the player breaks line of sight', () => {
    const w = new WantedSystem();
    w.addCrime('hitPed');
    advance(w, 30, true);
    advance(w, 1, false);
    expect(w.chaseTimer).toBe(0);
    advance(w, 15, true);
    expect(w.stars).toBe(1);
  });
});

describe('police dispatch', () => {
  it('scales the unit count with the star level', () => {
    const w = new WantedSystem();
    expect(w.targetUnits()).toBe(0);
    for (let stars = 1; stars <= MAX_STARS; stars++) {
      w.set(stars);
      expect(w.targetUnits()).toBe(stars);
    }
  });

  it('stands the police down when the level is cleared', () => {
    const w = new WantedSystem();
    w.set(3);
    expect(w.targetUnits()).toBe(3);
    w.clear();
    expect(w.targetUnits()).toBe(0);
    expect(w.evadeTimer).toBe(0);
    expect(w.chaseTimer).toBe(0);
  });
});
