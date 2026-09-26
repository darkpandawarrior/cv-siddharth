/**
 * The accessible landmark list (this lane's own task list): every landmark
 * in the world model, as a visually hidden list of native `<button>`s that
 * call the SAME handler a click/dwell on the in-world landmark would
 * (`onEnter`) — `react-three-a11y` stays out (rejected dependency,
 * master-plan.md's own list), because a real, always-in-the-DOM button
 * reachable by Tab is a smaller, more honest fix than instrumenting the
 * WebGL scene graph for focus.
 *
 * "Landmark" here is G14 `landmark-facet` (living-ledger-spec §3.3): the
 * one GRAMMAR rule that names a fixed set of physical landmarks (the
 * keystone bridge, Doori's ghat, Gaddi's ghat, PaymentsLab-KMP's toran, his
 * employers' flights of steps) rather than a growing list of stones or
 * kites — `landmarksFromFeatures` groups its features by that landmark
 * name, parsed from each feature's own id (`landmark-facet:<name>:<field>`,
 * grammar.ts's own `placementSeed`).
 */
import type { Feature } from "../worldModel.ts";

export interface Landmark {
  name: string;
  facets: Feature[];
}

const LANDMARK_RULE = "landmark-facet";

export function landmarksFromFeatures(features: readonly Feature[]): Landmark[] {
  const byName = new Map<string, Feature[]>();
  for (const f of features) {
    if (f.rule !== LANDMARK_RULE) continue;
    const name = f.id.slice(`${LANDMARK_RULE}:`.length).split(":")[0] || f.id;
    const arr = byName.get(name);
    if (arr) arr.push(f);
    else byName.set(name, [f]);
  }
  return [...byName.entries()].map(([name, facets]) => ({ name, facets }));
}

/** Title-cases a landmark's own slug/company name for the button label —
 *  plain-English display only, never fed back into any id/comparison. */
function displayName(name: string): string {
  return name.replace(/[-_]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export function LandmarkList({ landmarks, onEnter }: { landmarks: readonly Landmark[]; onEnter: (name: string) => void }) {
  return (
    <ul className="sr-only" aria-label="Landmarks in this world">
      {landmarks.map((l) => (
        <li key={l.name}>
          <button type="button" onClick={() => onEnter(l.name)}>
            {displayName(l.name)}
          </button>
        </li>
      ))}
    </ul>
  );
}
