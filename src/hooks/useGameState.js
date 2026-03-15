import { useSyncExternalStore } from 'react';
import { store } from '../game/state.js';

export function useGameState(selector) {
  return useSyncExternalStore(
    store.subscribe,
    () => selector(store),
  );
}
