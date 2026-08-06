import { interactionGroups } from "@react-three/rapier";

/**
 * Who can trigger a room's approach sensor, and who must not.
 *
 * Its own module because BOTH Props and Stunts need it and neither should own
 * it — exporting it from a component file costs fast refresh (the lint rule is
 * right) and, more importantly, made it look like a Props detail when it is a
 * world-wide rule.
 *
 * The rule: dynamic debris is a member of group 0 ONLY, which excludes the
 * group the pavilion sensors listen on. Without it, a bowling pin rolling into
 * a room's approach volume raises the "enter this room" prompt and the dwell
 * timer then NAVIGATES — the world threw visitors into /lab about four seconds
 * after load, untouched. The craft keeps Rapier's default (member of every
 * group), so it still triggers sensors with no extra wiring.
 */
export const PROP_COLLISION_GROUPS = interactionGroups([0]);

/** The group pavilion sensors both belong to and filter on. */
export const PAVILION_SENSOR_GROUP: number = 15;
