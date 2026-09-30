/** Relative fixtures, not a frozen browser clock. Fictional labels mark test data. */
export function briefingFixtures(now: number) {
  return {
    quakes: { features: [{ id: "brief-q", properties: { mag: 6.2, place: "Briefing quake fixture", time: now - 60000, url: "https://earthquake.usgs.gov/" }, geometry: { type: "Point", coordinates: [-120, 40, 12] } }] },
    eonet: { events: [{ id: "brief-e", title: "Briefing wildfire fixture", categories: [{ id: "wildfires" }], sources: [{ id: "NASA" }], geometry: [{ type: "Point", date: new Date(now - 120000).toISOString(), coordinates: [20, 10] }] }] },
    gvp: { volcanoes: [] },
    kp: [{ Kp: 3.33, time_tag: new Date(now - 3600000).toISOString() }],
    launches: { results: [{ id: "brief-l", name: "Briefing launch fixture", net: new Date(now + 3600000).toISOString(), launch_service_provider: { name: "Fixture provider" }, pad: { name: "Fixture pad", latitude: "28.5", longitude: "-80.6", location: { name: "Fixture location" } } }] },
  };
}
