import { describe, expect, it } from 'vitest';
import { pickStart } from '../fleetSync';

describe('which copy of the machines to start from', () => {
  it('the store’s, unless the browser’s was changed since; the browser’s alone with no store', () => {
    const server = { fleet: {}, savedAt: 1000 };
    expect(pickStart(500, server)).toEqual({ use: 'server', online: true, upload: false });
    expect(pickStart(1000, server)).toEqual({ use: 'server', online: true, upload: false });
    // Changed here after the last save reached the store (say the page closed first): it goes up.
    expect(pickStart(2000, server)).toEqual({ use: 'local', online: true, upload: true });
    // Nothing in the store yet: this browser's machines are the first copy.
    expect(pickStart(0, 'empty')).toEqual({ use: 'local', online: true, upload: true });
    expect(pickStart(2000, 'unavailable')).toEqual({ use: 'local', online: false, upload: false });
  });
});
