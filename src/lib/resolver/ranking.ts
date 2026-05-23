import _ from 'lodash';
import { InternalState, UserRow } from './types';

export function rankUsers(
  state: InternalState,
  unofficialContestants: string[]
): UserRow[] {
  const rows = _.orderBy(
    _.values(state.users).map((user) => {
      const total = _.sum(_.values(user.points));
      return { ...user, total, rank: '' };
    }),
    ['total', 'penalty'],
    ['desc', 'asc']
  );

  let lastTotal = -1;
  let lastPenalty = -1;
  let rank = 0;
  let cnt = 0;
  for (let i = 0; i < rows.length; i++) {
    if (unofficialContestants.includes(rows[i].username)) {
      continue;
    }
    cnt += 1;
    if (rows[i].total !== lastTotal || rows[i].penalty !== lastPenalty) {
      rank = cnt;
      lastTotal = rows[i].total;
      lastPenalty = rows[i].penalty;
    }
    rows[i].rank = rank.toString();
  }

  return rows;
}
