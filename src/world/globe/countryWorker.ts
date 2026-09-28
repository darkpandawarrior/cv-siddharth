import { parseCountries } from "./countryData.ts";

self.onmessage = async () => {
  try {
    const response = await fetch("/geo/countries-110m.json");
    if (!response.ok) throw new Error(`Boundaries: ${response.status}`);
    self.postMessage({ index: parseCountries(await response.text()) });
  } catch { self.postMessage({ error: "Country boundaries unavailable" }); }
};
