import type { CountryIndex } from "./countryData.ts";
let pending: Promise<CountryIndex> | null = null;
/** One parsed index per page; a failed load can be retried with the toggle. */
export function loadCountries(): Promise<CountryIndex> {
  if (!pending) pending = new Promise<CountryIndex>((resolve, reject) => {
    const worker = new Worker(new URL("./countryWorker.ts", import.meta.url), { type: "module" });
    const timeout = setTimeout(() => { worker.terminate(); reject(new Error("Country load timed out")); }, 15_000);
    const stop = () => { clearTimeout(timeout); worker.terminate(); };
    worker.onmessage = (event: MessageEvent<{ index?: CountryIndex; error?: string }>) => {
      stop();
      if (event.data.index) resolve(event.data.index);
      else reject(new Error(event.data.error));
    };
    worker.onerror = () => { stop(); reject(new Error("Country worker failed")); };
    worker.postMessage(null);
  }).catch(error => { pending = null; throw error; });
  return pending;
}
