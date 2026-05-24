// Public surface. Tests reach into internal modules (build, util) directly
// for implementation details. Keep this list narrow.
export * from './types';
export { getProblemCodeFromIndex } from './codes';
export { getScoreClass } from './scoring';
export { calculatePenalty } from './penalty';
export { buildInitialState } from './build';
export {
  applyEvent,
  computeNextEvent,
  type ResolverEvent,
  type ApplyCtx,
  type NextEventCtx
} from './events';
export { rankUsers } from './ranking';
export { parseInputData } from './parse';
export {
  initSimState,
  makeReducer,
  precomputeFrom,
  type SimAction,
  type SimState,
  type SimulationCtx
} from './simulation';
// keyBy / mapValues are dictionary helpers, not really part of the public
// domain — re-exported because useResolver builds runtime lookups outside
// this folder.
export { keyBy, mapValues } from './util';
