import type { FeedItem, FeedKind } from "../feed.ts";
import type { LayerHealth, LayerId, StatusKey } from "../globeStore.ts";

export type FeedGroup = "hazard" | "signal" | "satellite" | "explorer";
export const GROUP_OF: Record<FeedKind, FeedGroup> = {
  quake: "hazard", wildfire: "hazard", storm: "hazard", volcano: "hazard", gdacs: "hazard", launch: "hazard", aurora: "hazard", flare: "hazard",
  "ci-pass": "signal", "ci-fail": "signal", push: "signal", devto: "signal", lichess: "signal",
  satellite: "satellite", presence: "explorer", together: "explorer",
};
export const GROUP_LABEL: Record<FeedGroup, string> = { hazard: "Hazards", signal: "Signals", satellite: "Satellites", explorer: "Explorers" };
export const GROUPS = Object.keys(GROUP_LABEL) as FeedGroup[];
// SpaceWeather is always mounted and has no globeStore health entry.
// Its unknown health must never be inferred from HazardLayer's status.
const PRODUCERS: Record<FeedGroup, { id: LayerId | null; label: string; source: string }[]> = {
  hazard: [{ id: "hazards", label: "Earth events", source: "USGS, NASA EONET, GDACS, Launch Library 2, NOAA SWPC, Smithsonian GVP / USGS weekly report" }, { id: null, label: "Space weather", source: "NOAA SWPC X-ray flares" }],
  signal: [{ id: "pulses", label: "Live pulses", source: "GitHub, DEV.to, Lichess" }],
  satellite: [{ id: "satellites", label: "Satellites", source: "CelesTrak TLE" }],
  explorer: [{ id: "presence", label: "Visitors", source: "Live presence" }, { id: "together", label: "Explorers here now", source: "Together presence channel" }],
};

export function feedEmptyState(items: readonly Pick<FeedItem, "kind">[], group: FeedGroup | null, layers: Record<LayerId, boolean>, status: Partial<Record<StatusKey, LayerHealth>>): { text: string; action: "all" | "enable" | null; layers: LayerId[] } {
  if (items.length && group && !items.some((item) => GROUP_OF[item.kind] === group)) {
    return { text: `No ${GROUP_LABEL[group].toLowerCase()} items in this session yet`, action: "all", layers: [] };
  }
  const producers = (group ? [group] : GROUPS).flatMap((key) => PRODUCERS[key]);
  if (producers.every((producer) => producer.id !== null && !layers[producer.id])) {
    return { text: `Layers off: ${producers.map((producer) => producer.label).join(", ")}`, action: "enable", layers: producers.flatMap((producer) => producer.id === null ? [] : [producer.id]) };
  }
  const enabled = producers.filter((producer) => producer.id === null || layers[producer.id]);
  if (enabled.every((producer) => producer.id !== null && status[producer.id]?.state === "failed")) {
    return { text: `Unavailable: ${enabled.map((producer) => `${producer.source}${producer.id !== null && status[producer.id]?.detail ? ` (${status[producer.id]?.detail})` : ""}`).join("; ")}`, action: null, layers: [] };
  }
  return { text: "Nothing yet. The feed fills as things happen.", action: null, layers: [] };
}
