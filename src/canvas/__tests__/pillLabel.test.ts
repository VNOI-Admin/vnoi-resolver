import { describe, expect, it } from 'vitest';
import { ProblemAttemptStatus } from '../../lib/resolver';
import { pillLabel } from '../pillLabel';

const S = ProblemAttemptStatus;

describe('pillLabel', () => {
  it('untried: ghost problem letter, never a count', () => {
    expect(pillLabel(0, S.UNATTEMPTED, 0, 'F')).toBe('F');
  });

  it('solved / partial / failed: score with total submission count', () => {
    expect(pillLabel(1500, S.ACCEPTED, 7, 'C')).toBe('1500 (7)');
    expect(pillLabel(750, S.PARTIAL, 5, 'F')).toBe('750 (5)');
    expect(pillLabel(0, S.INCORRECT, 3, 'D')).toBe('0 (3)');
  });

  it('pending: question mark keeps the pre-freeze score and the count', () => {
    expect(pillLabel(750, S.PARTIAL | S.PENDING, 5, 'F')).toBe('750? (5)');
    expect(pillLabel(0, S.UNATTEMPTED | S.PENDING, 4, 'D')).toBe('? (4)');
    expect(pillLabel(0, S.INCORRECT | S.PENDING, 2, 'E')).toBe('? (2)');
  });

  it('defensive: attempted with a zero count still renders the score alone', () => {
    expect(pillLabel(1500, S.ACCEPTED, 0, 'C')).toBe('1500');
  });
});
