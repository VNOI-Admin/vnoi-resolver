import { describe, expect, it } from 'vitest';
import { getProblemCodeFromIndex } from '../codes';

describe('getProblemCodeFromIndex', () => {
  it('returns A for index 0', () => {
    expect(getProblemCodeFromIndex(0)).toBe('A');
  });

  it('returns Z for index 25', () => {
    expect(getProblemCodeFromIndex(25)).toBe('Z');
  });

  it('returns AA for index 26', () => {
    expect(getProblemCodeFromIndex(26)).toBe('AA');
  });

  it('returns AB for index 27', () => {
    expect(getProblemCodeFromIndex(27)).toBe('AB');
  });

  it('returns AZ for index 51', () => {
    expect(getProblemCodeFromIndex(51)).toBe('AZ');
  });

  it('returns BA for index 52', () => {
    expect(getProblemCodeFromIndex(52)).toBe('BA');
  });

  it('returns ZZ for index 701', () => {
    expect(getProblemCodeFromIndex(701)).toBe('ZZ');
  });

  it('returns AAA for index 702', () => {
    expect(getProblemCodeFromIndex(702)).toBe('AAA');
  });
});
