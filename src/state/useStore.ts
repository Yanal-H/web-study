import { useSyncExternalStore } from 'react';
import { state, subscribe, getVersion } from './store';
import type { AppState } from './types';

/**
 * Subscribe a component to the live app state. Returns the (mutable) state object;
 * after mutating it, call `commit()` (or `update()`) from the store to persist and
 * trigger re-renders. The snapshot is a version counter, so any commit re-renders
 * every subscribed component.
 */
export function useStore(): AppState {
  useSyncExternalStore(subscribe, getVersion, getVersion);
  return state;
}

/**
 * The store's version counter. Because `state` is a mutated-in-place singleton,
 * its sub-objects keep the same reference across commits — so a `useMemo` keyed
 * on `state.notes` never re-runs. Key such memos on this instead: it changes on
 * every commit, which is exactly when derived data must be recomputed.
 */
export function useStoreVersion(): number {
  return useSyncExternalStore(subscribe, getVersion, getVersion);
}
