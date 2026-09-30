/** Relative fixtures, not a frozen browser clock. Fictional labels mark test data. */
import tle from "../tle.json" with { type: "json" };
export function briefingFixtures(now: number) {
  const iss = tle.objects.find(object => object.norad === "25544")!;
  const epochAt = now - 2 * 86400000;
  const date = new Date(epochAt);
  const day = ((epochAt - Date.UTC(date.getUTCFullYear(), 0, 1)) / 86400000 + 1).toFixed(8).padStart(12, "0");
  const l1 = iss.l1.slice(0, 18) + String(date.getUTCFullYear() % 100).padStart(2, "0") + day + iss.l1.slice(32);
  return {
    tle: { connected: true, objects: [{ ...iss, l1 }], epochNewest: new Date(now - 3600000).toISOString() },
    issEpoch: new Date(Date.UTC(date.getUTCFullYear(), 0, 1) + (Number(day) - 1) * 86400000).toISOString(),
    quakes: { features: [{ id: "brief-q", properties: { mag: 6.2, place: "Briefing quake fixture", time: now - 60000, url: "https://earthquake.usgs.gov/" }, geometry: { type: "Point", coordinates: [-120, 40, 12] } }] },
    eonet: { events: [{ id: "brief-e", title: "Briefing wildfire fixture", categories: [{ id: "wildfires" }], sources: [{ id: "NASA" }], geometry: [{ type: "Point", date: new Date(now - 120000).toISOString(), coordinates: [20, 10] }] }] },
    gvp: { volcanoes: [] },
    kp: [{ Kp: 3.33, time_tag: new Date(now - 3600000).toISOString() }],
    launches: { results: [{ id: "brief-l", name: "Briefing launch fixture", net: new Date(now + 3600000).toISOString(), launch_service_provider: { name: "Fixture provider" }, pad: { name: "Fixture pad", latitude: "28.5", longitude: "-80.6", location: { name: "Fixture location" } } }] },
  };
}
