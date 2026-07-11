// Public surface. Tests reach into internal modules (build, util) directly
// for implementation details. Keep this list narrow.
export * from './types';
export { getProblemCodeFromIndex } from './codes';
export { calculatePenalty } from './penalty';
export { buildInitialState } from './build';
export { applyEvent, computeNextEvent, type ResolverEvent } from './events';
export { rankUsers } from './ranking';
export { parseInputData, parseAwardImageMap } from './parse';
export {
  initSimState,
  makeReducer,
  HOLD_MS,
  type HoldClass,
  type SimAction,
  type SimState
} from './simulation';
// keyBy / mapValues are dictionary helpers, not really part of the public
// domain — re-exported because useResolver builds runtime lookups outside
// this folder.
export { keyBy, mapValues } from './util';
