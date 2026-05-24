import { describe, expect, it } from 'vitest';
import type { InputData } from '../lib/resolver';
import { applyHideUnofficials } from '../resolver';

const baseData: InputData = {
  users: [
    { userId: 1, username: 'alice', fullName: 'Alice' },
    { userId: 2, username: 'bob', fullName: 'Bob' },
    { userId: 3, username: 'carol', fullName: 'Carol' }
  ],
  problems: [],
  submissions: []
};

describe('applyHideUnofficials', () => {
  it('returns input identity when hide=false (avoids unnecessary clone)', () => {
    const r = applyHideUnofficials(baseData, ['alice'], false);
    expect(r).toBe(baseData);
  });

  it('filters out matching usernames when hide=true', () => {
    const r = applyHideUnofficials(baseData, ['alice', 'carol'], true);
    expect(r.users.map((u) => u.username)).toEqual(['bob']);
  });

  it('keeps everyone when unofficial list is empty', () => {
    const r = applyHideUnofficials(baseData, [], true);
    expect(r.users.map((u) => u.username)).toEqual(['alice', 'bob', 'carol']);
  });

  it('ignores unknown usernames in the unofficial list', () => {
    const r = applyHideUnofficials(baseData, ['ghost'], true);
    expect(r.users.map((u) => u.username)).toEqual(['alice', 'bob', 'carol']);
  });

  it('preserves the rest of the InputData shape', () => {
    const r = applyHideUnofficials(baseData, ['alice'], true);
    expect(r.problems).toBe(baseData.problems);
    expect(r.submissions).toBe(baseData.submissions);
  });

  it('does NOT mutate the input', () => {
    applyHideUnofficials(baseData, ['alice'], true);
    expect(baseData.users.map((u) => u.username)).toEqual([
      'alice',
      'bob',
      'carol'
    ]);
  });
});
