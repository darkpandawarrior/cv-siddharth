/** Committed synthetic API fixtures, imported only by W11's e2e/visual QA. */
export const photonFixture = {
  type: "FeatureCollection",
  features: [{ type: "Feature", geometry: { type: "Point", coordinates: [2.3522, 48.8566] }, properties: { name: "Paris", country: "France", type: "city", osm_key: "place", osm_value: "city" } }],
};
export const reverseFixture = { city: "Paris", locality: "Paris", countryName: "France", countryCode: "FR" };
export const weatherFixture = { timezone: "Europe/Paris", current: { time: "2026-09-28T14:00", temperature_2m: 18, weather_code: 0, wind_speed_10m: 9 } };
