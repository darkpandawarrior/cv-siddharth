import { sangamBasin, districtAnchors } from "./valley.ts";
import { groundPosition, type HeightAt } from "./terrainHeight.ts";
type Vec3 = [number, number, number];

const DISTRICT_IDS = ["doori", "gaddi", "paymentslab-kmp", "candidai", "kmp-app-template", "portfolio", "stutter", "sinc-p"] as const;

export function landmarkPositions(heightAt?: HeightAt): Readonly<Record<string, Vec3>> {
  const basin = sangamBasin();
  const anchors = districtAnchors([...DISTRICT_IDS], basin);
  const byId: Record<string, Vec3> = { bridge: [basin.x, 0, basin.z - basin.r - 6] };
  for (const a of anchors) byId[a.id] = [a.x, a.y, a.z];
  if (heightAt) for (const [id, pos] of Object.entries(byId)) byId[id] = groundPosition([pos[0], 0, pos[2]], heightAt);
  return byId;
}

