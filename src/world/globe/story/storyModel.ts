import { education } from "../../../data/profile/core.ts";
import { experience } from "../../../data/profile/experience.ts";
import { openSource, recentGrowth } from "../../../data/profile/openSource.ts";
import { historyMonths } from "../../../data/history.ts";
import { fleetStats, storeApps, storeVerifiedAt } from "../../../data/store.ts";
import type { LayerId } from "../globeStore.ts";
import { GLOBE_RADIUS } from "../geoMath.ts";
import { STORY_GEO, storyArc, storyPlace } from "./storyGeo.ts";
import type { StoryArc, StoryPlace } from "./storyGeo.ts";

export type DatePrecision = "year" | "month" | "day";
export interface StoryEvent {
  id: string;
  date: string;
  precision: DatePrecision;
  dateNote: string;
  title: string;
  detail: string;
  source: `src/data/${string}`;
  place?: StoryPlace;
  metric?: { label: string; value: string | number; unit: string; source: `src/data/${string}` };
}
export interface StoryChapter {
  id: string;
  title: string;
  events: StoryEvent[];
  camera: {
    focus: StoryPlace | "height over Pune";
    anchor: StoryPlace;
    /** Artistic camera distance in globe world units, never a reach measurement. */
    distance: number;
    emphasise: LayerId[];
  };
  arcs: StoryArc[];
}

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

/** Explicit parsing retains the source's precision. Date.parse would supply an
 * invented day, accept ambiguous strings, and vary with the host timezone. */
export function storyDate(raw: string): { date: string; precision: DatePrecision } | undefined {
  let date = raw;
  const named = /^(\w+) (\d{4})$/.exec(raw);
  if (named) {
    const month = MONTHS.findIndex((m) => m === named[1] || m.slice(0, 3) === named[1]);
    if (month < 0) return undefined;
    date = `${named[2]}-${String(month + 1).padStart(2, "0")}`;
  }
  if (!/^\d{4}(?:-\d{2}(?:-\d{2})?)?$/.test(date)) return undefined;
  const [year, month = 1, day = 1] = date.split("-").map(Number);
  const check = new Date(`${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}T00:00:00Z`);
  if (!Number.isFinite(check.getTime()) || check.getUTCMonth() + 1 !== month || check.getUTCDate() !== day) return undefined;
  return { date, precision: date.length === 4 ? "year" : date.length === 7 ? "month" : "day" };
}

/** Typography is the only prose transformation; factual tokens stay intact. */
export function storyText(text: string): string { return text.replaceAll("—", ","); }

/** Chapters use their earliest event as ordering key. Partial dates sort before
 * more precise dates in the same period; this is presentation order, not a claim
 * that a year-only event occurred on January's first day. No wall clock is read. */
export function buildStory(): StoryChapter[] {
  const chapters: StoryChapter[] = [];
  function add(id: string, rawDate: string, title: string, detail: string, source: StoryEvent["source"], dateNote: string, place?: StoryPlace, metric?: StoryEvent["metric"]) {
    const parsed = storyDate(rawDate);
    // Unparseable ranges and Present have no invented point on the timeline.
    if (!parsed) return;
    const event: StoryEvent = { id, ...parsed, title: storyText(title), detail: storyText(detail), source, dateNote: `${dateNote}; ${parsed.precision} precision`, ...(place && { place }), ...(metric && { metric }) };
    chapters.push({ id, title: event.title, events: [event], camera: {
      focus: place ?? "height over Pune", anchor: place ?? STORY_GEO["Pune, India"],
      distance: GLOBE_RADIUS * 3, emphasise: place ? ["markers"] : ["reach"],
    }, arcs: [] });
  }
  // The school string itself names the city ("NIT Bhopal (MANIT)"), so the
  // chapter stands on Bhopal at city precision; see storyGeo.ts.
  add("education", education.period.split(" - ")[0], education.school, `${education.degree} · ${education.period}`, "src/data/profile/core.ts", "Period start", /Bhopal/.test(education.school) ? storyPlace("Bhopal, India") : undefined);
  experience.forEach((role) => add(`role:${role.company}`, role.period.split(" - ")[0], role.company, `${role.role} · ${role.period} · ${role.location}`, "src/data/profile/experience.ts", "Role period start", storyPlace(role.location)));
  recentGrowth.forEach((item, i) => add(`growth:${i}`, item.date, item.title, item.detail, "src/data/profile/openSource.ts", "Recorded milestone month"));
  // One earliest recorded merged entry per upstream is a bounded milestone list.
  // Its date field is not documented as mergedAt, so do not call it a merge date.
  const seen = new Set<string>();
  [...openSource].filter((pr) => pr.status === "merged").sort((a, b) => a.date.localeCompare(b.date)).forEach((pr) => {
    if (seen.has(pr.org)) return;
    seen.add(pr.org);
    add(`oss:${pr.org}`, pr.date, pr.title, `${pr.repo} · ${pr.status}`, "src/data/profile/openSource.ts", "Recorded contribution date, not a verified merge timestamp");
  });
  const first = historyMonths[0];
  if (first) add("portfolio", first.ym, first.subjects[0], first.subjects[0], "src/data/history.ts", "Earliest recorded portfolio month, not a launch date", undefined, { label: "commits", value: first.commits, unit: "commits", source: "src/data/history.ts" });
  // Install bands describe the verification snapshot. Neither Updated on nor
  // an archive's firstSeen tells when an app launched or crossed a threshold.
  storeApps.forEach((app) => add(`store:${app.id}`, storeVerifiedAt, app.name, `${app.installs} · ${app.role} · ${app.employer}`, "src/data/store.ts", "Listing verification snapshot, not a threshold crossing or launch", undefined, { label: "installs", value: app.installs, unit: "Play install band", source: "src/data/store.ts" }));
  add("install-floor", storeVerifiedAt, "Play Store listings", `install floor across ${fleetStats.live} live listings (Play's own install bands, summed as floors)`, "src/data/store.ts", "Listing verification snapshot, not a threshold crossing", undefined, { label: "install floor", value: fleetStats.installFloor, unit: "installs", source: "src/data/store.ts" });
  chapters.sort((a, b) => a.events[0].date.localeCompare(b.events[0].date));
  // The one journey the data can draw honestly: from the university city to
  // the first role in a known city. Both ends are registered STORY_GEO places,
  // and storyArc refuses anything else.
  const school = chapters.find((c) => c.id === "education")?.events[0].place;
  const firstRole = chapters.find((c) => c.id.startsWith("role:") && c.events[0].place && c.events[0].place.name !== school?.name);
  const arc = storyArc(school, firstRole?.events[0].place);
  if (firstRole && arc) firstRole.arcs = [arc];
  return chapters;
}
