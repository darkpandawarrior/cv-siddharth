/** One browser arrival shared by every mounted room provider. */
export function createArrivalStore<T>() {
  let claimed = false;
  let snapshot: { visit: T | null; settled: boolean } = { visit: null, settled: false };
  const listeners = new Set<(visit: T | null) => void>();
  return {
    get snapshot() { return snapshot; },
    claim() {
      if (claimed) return false;
      claimed = true;
      return true;
    },
    settle(visit: T | null) {
      snapshot = { visit, settled: true };
      for (const listener of listeners) listener(visit);
    },
    subscribe(listener: (visit: T | null) => void) {
      listeners.add(listener);
      if (snapshot.settled) listener(snapshot.visit);
      return () => { listeners.delete(listener); };
    },
  };
}
