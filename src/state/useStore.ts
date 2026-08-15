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
