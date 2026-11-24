import { useSyncExternalStore } from "react";

const subscribe = () => () => {};

/** False during server rendering and hydration, true once the component is interactive. */
export function useHydrated(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  );
}
