import { InternalState, UserRow } from './types';
import { sortBy } from './util';

export function rankUsers(
  state: InternalState,
  unofficialContestants: string[]
): UserRow[] {
  // Pre-sort by userId so the {total, penalty} tie-break is deterministic
  // even on engines whose numeric-key iteration order differs.
  const sortedUsers = sortBy(Object.values(state.users), (u) => u.userId);
  const rows = sortedUsers
    .map((user) => {
      let total = 0;
      for (const v of Object.values(user.points)) total += v;
      return { ...user, total, rank: '' };
    })
    // Higher total first; ties broken by lower penalty. Array.sort is stable
    // so equal-(total,penalty) rows keep their userId-ordered position.
    .sort((a, b) => b.total - a.total || a.penalty - b.penalty);

  // O(1) lookup instead of O(U) Array.includes — called inside
  // precomputeFrom's hot loop, saves O(U·N) per build.
  const unofficialSet = new Set(unofficialContestants);

  let lastTotal = -1;
  let lastPenalty = -1;
  let rank = 0;
  let cnt = 0;
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]!;
    if (unofficialSet.has(row.username)) continue;
    cnt += 1;
    if (row.total !== lastTotal || row.penalty !== lastPenalty) {
      rank = cnt;
      lastTotal = row.total;
      lastPenalty = row.penalty;
    }
    row.rank = rank.toString();
  }

  return rows;
}
