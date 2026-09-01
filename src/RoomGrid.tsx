import { Link } from "@tanstack/react-router";
import { Picture } from "./Picture.tsx";
import { ROOMS, type Room } from "./rooms.tsx";
import { WALL_GROUPS } from "./data/surfaces.ts";
import { usePulseUI } from "./play/pulseUI.ts";
// pulseEvents.ts and NOT pulse.ts: pulse.ts imports @playhtml/react, which
// reads `document` at module load, and this file is the visible /playground
// for anyone without WebGL — i.e. it has to server-render. pulseEvents.ts is
// the pure half that exists for exactly this (see pulseUI.ts's docstring for
// the SSR failure that split them).
import {
  PULSE_EVENTS,
  eventsInGroup,
  eventsInsideRoom,
  sumEvents,
  topEvents,
  type PulseEvent,
} from "./play/pulseEvents.ts";
import { countWord } from "./data/labs.ts";

/**
 * The card grid — extracted verbatim from Playground.tsx (see that file's
 * history) so it can serve two roles at once: the always-reachable "List
 * view" a visitor can flip to from the 3D world, and the no-WebGL /
 * reduced-motion / print fallback the world never gets a chance to break.
 * Because it's the fallback, it must never degrade — same rooms, same links,
 * same pulse counters, same stagger as what shipped before the world existed.
 *
 * What changed: eight identical boxes in one flat grid made a visitor read
 * eight lucide icons and guess. The rooms are now grouped by the `group` the
 * registry has always carried and nothing on this page read, so the grid
 * answers "what kind of thing is this" before it answers "what is it called";
 * and each card leads with a real capture of the room, so it answers "what is
 * behind this door" without being opened.
 */

/**
 * The room's own screenshot. capture-site.mjs already shoots one per route at
 * 1440x900 and gen-images.mjs writes the AVIF/WebP siblings <Picture> needs;
 * they were sitting in public/ used by nothing on this page.
 *
 * A missing capture does NOT degrade: <picture> picks its <source> on `type`
 * alone and never falls back to the <img> when that source 404s (the trap
 * lib/rasterSources.ts documents), so a room with no shot would render as a
 * broken image rather than as no image. surfaces.test.ts asserts the file
 * exists for every room, which is the only place that can actually check it.
 */
const shotFor = (room: Room) => `/projects/portfolio/screenshots/site_${room.to.slice(1)}.png`;

/**
 * The one room the hub nominates.
 *
 * NOT derived from the visit counter. That counter is bumped in exactly two
 * places — a click on a card here (below) and driving into a pavilion door in
 * the 3D world (World.tsx) — so ranking by it would be this page grading its
 * own homework with single digits of evidence from its own visitors.
 *
 * /compose because it is the room closest to the job the rest of the site
 * describes, and because it is the one a stranger can be *inside* in two
 * seconds without installing anything. /blueprint is the more spectacular
 * capture and the harder engineering; this is a bet on relevance over
 * spectacle. Changing the nomination is this one line and the sentence in
 * LeadCard below.
 */
const LEAD = "/compose";

/**
 * The three rooms the site already demoted, finally saying so on the page.
 *
 * `wall: false` in surfaces.ts is an editorial judgement with a defended
 * paragraph of reasoning next to it, and until now it was visible only to
 * someone reading the registry: the homepage quietly dropped the tile and this
 * page listed all eight rooms as equals. The chip is that judgement, compressed
 * to two words, with the registry's own reason in the title.
 *
 * Keyed by route and read only where `wall === false`, so this map cannot
 * promote or demote anything — surfaces.test.ts pins the demoted set by path
 * (["/forge", "/terminal", "/weeb"]), and a room that lost its `wall: false`
 * would simply stop showing a chip rather than show a stale one.
 */
const WALL_NOTE: Record<string, { chip: string; why: string }> = {
  "/forge": {
    chip: "lovely once",
    why: "Off the homepage wall on purpose: it is a screensaver, and nobody navigates to it twice.",
  },
  "/terminal": {
    chip: "easter egg",
    why: "Off the wall on purpose: an easter egg advertised on the homepage is not an easter egg. The backtick key works from anywhere on the site.",
  },
  "/weeb": {
    chip: "read once",
    why: "Off the wall on purpose: a one-time-read curiosity rather than a demo. Still in the footer, the palette and this list.",
  },
};

/**
 * The keys a room counts once you are INSIDE it.
 *
 * Derived from the registry, not listed by hand. An earlier version was a
 * two-entry map keyed by route onto the registry's prose group strings ("In the
 * Chess Room" against a room labelled "The Board"), defended by a comment
 * saying there was nothing to derive them from. There is, and /pulse was
 * already doing it: the route slug is the key prefix, so `/blueprint` owns
 * `blueprint:*` and `/chess` owns `chess:*`. Two things the hand map got wrong:
 * wiring `lab:calibrate` tomorrow left the footnote below asserting only two
 * rooms count anything, with no test red; and renaming a group label made
 * `eventsInGroup` return [] while the map stayed truthy, so the chess card
 * would have read "0 things done inside" forever.
 *
 * Verified equal to the old map on today's registry: blueprint 5 keys, chess 2,
 * every other room 0.
 */
/* The derivation itself lives in pulseEvents.ts, because /pulse had already
   written it (Pulse.tsx's ROOMS) and two copies of "which keys belong to this
   room" is the shape of drift this whole page is about. */

/**
 * Why the pair is two magnitudes and not a ratio.
 *
 * An earlier draft of this line read "{n} of {m} went further", which asserts a
 * subset relation the two counters do not have: the in-room counters fire
 * however a visitor arrived (BlueprintRoom bumps on every mode switch, tour
 * step and reset; the chess rooms on a guess or a puzzle), while the entry
 * counter only fires when a room is picked from this page or driven into in the
 * 3D world. The right-hand number can and does exceed the left, and "63 of 41"
 * is what that phrasing renders.
 */
/**
 * What the plain visit chip actually counts.
 *
 * "Opened, across everyone" is what shipped, and this file says sixty lines up
 * that the counter fires in exactly two places — a click on a card here and
 * driving into a pavilion door in the 3D world. LiveLine's visible copy already
 * says "counted only when someone picks a room here"; a tooltip on the same
 * page contradicting it is the drift, not the wording.
 */
const VISIT_TITLE =
  "How many times this room was picked from the Playground — from this list, or by driving into its door in the 3D world. Across everyone.";

const DEPTH_TITLE =
  "Not a rate, and not a subset: the inside counter fires however you arrived, the entry counter only when someone picks the room from this page. One visitor who switches the render and takes the tour adds two inside against one entry. Read it as 'people do more than walk in'.";

/**
 * The bands, in this page's order.
 *
 * The order departs from WALL_GROUPS' own (which leads with proof): the
 * homepage wall is arguing evidence, this page is arguing that the thing runs.
 * Labels and notes are still READ from WALL_GROUPS rather than retyped — the
 * registry already authored both, and surfaces.test.ts guards that every
 * surface's group is one the wall renders.
 *
 * A group this list does not name still gets its own band, at the end, rather
 * than dropping its rooms on the floor: a room that silently disappears from
 * the only page that lists every room is a worse failure than an out-of-order
 * heading.
 */
const BAND_ORDER = ["runs", "proof", "corpus"];
const bandRank = (group: string) => {
  const i = BAND_ORDER.indexOf(group);
  return i === -1 ? BAND_ORDER.length : i;
};

function bands(rooms: Room[]) {
  return WALL_GROUPS.map((g) => ({ ...g, rooms: rooms.filter((r) => r.group === g.group) }))
    .filter((b) => b.rooms.length > 0)
    .sort((a, b) => bandRank(a.group) - bandRank(b.group));
}

/** "room:blueprint" for "/blueprint" — the registry keys are named off the
 *  routes so a new room needs one entry in PULSE_EVENTS and nothing here. */
const roomEvent = (r: Room) => `room:${r.to.slice(1)}` as PulseEvent;

/**
 * The demoted-from-the-wall chip, and the counter chip, as components rather
 * than as JSX two cards each keep their own copy of.
 *
 * LeadCard was written as a copy of RoomCard's internals and dropped both:
 * pointing LEAD at /blueprint silently lost the depth line while the footnote
 * below went on naming Blueprint as a room that counts things inside, and
 * pointing it at /forge, /terminal or /weeb lost the wall chip. LEAD is one
 * line and the comment on it invites changing — so the two cards have to
 * render the same facts for any room, not for /compose.
 */
function WallChip({ r }: { r: Room }) {
  if (r.wall !== false || !WALL_NOTE[r.to]) return null;
  return (
    // Words, not just a dashed border: the chip has to carry its meaning to
    // someone who cannot see that it is drawn differently.
    <span
      className="rounded-full border border-dashed border-line px-2 py-0.5 font-mono text-[10px] text-muted"
      title={WALL_NOTE[r.to].why}
    >
      {WALL_NOTE[r.to].chip}
    </span>
  );
}

function CountChip({ r }: { r: Room }) {
  // Through context, not an import: RoomGrid is the page a no-WebGL visitor
  // actually reads on /playground, so it has to survive being rendered on the
  // server, and pulse.ts cannot be.
  const { counts } = usePulseUI();
  const visits = counts[roomEvent(r)] ?? 0;
  const insideKeys = eventsInsideRoom(r.to.slice(1));
  if (insideKeys.length === 0) {
    return visits > 0 ? (
      <span className="font-normal text-muted" title={VISIT_TITLE}>
        {visits.toLocaleString()} {visits === 1 ? "visit" : "visits"}
      </span>
    ) : null;
  }
  const inside = sumEvents(counts, insideKeys);
  if (visits === 0 && inside === 0) return null;
  return (
    // Both magnitudes, including a zero on either side: "0 opened it · 12
    // things done inside" is a true and interesting sentence (everyone reached
    // that room some other way), and hiding it until both are positive would
    // only hide it while it is saying the most.
    <span className="font-normal text-muted" title={DEPTH_TITLE}>
      {visits.toLocaleString()} opened it · {inside.toLocaleString()} things done inside
    </span>
  );
}

function RoomCard({ r, i, previews }: { r: Room; i: number; previews: boolean }) {
  const Icon = r.icon;
  const { bump } = usePulseUI();
  const event = roomEvent(r);
  return (
    <Link
      to={r.to}
      onClick={() => bump(event)}
      className="panel playground-card group flex h-full flex-col overflow-hidden transition hover:-translate-y-1"
      style={{ animationDelay: `${i * 60}ms` }}
      onMouseEnter={(e) => (e.currentTarget.style.borderColor = `${r.tint}66`)}
      onMouseLeave={(e) => (e.currentTarget.style.borderColor = "")}
    >
      {previews && <RoomShot r={r} />}
      <div className="flex grow flex-col p-5">
      {/* `ml-auto` on the tag rather than justify-between: this row now holds
          up to three things (badge, wall chip, tag) in two configurations, and
          flex-wrap keeps the pair from running off a 342px card. */}
      <div className="flex flex-wrap items-center gap-2">
        {/* Without a preview the badge is the only thing identifying the room
            at a glance, so it keeps its full size here and shrinks onto the
            image only when there is an image to sit on. */}
        {!previews && (
          <span
            className="flex h-11 w-11 items-center justify-center rounded-xl border transition"
            style={{ borderColor: `${r.tint}40`, background: `${r.tint}12`, color: r.tint }}
          >
            <Icon size={20} />
          </span>
        )}
        <WallChip r={r} />
        <span className="kicker ml-auto">{r.tag}</span>
      </div>
      {/* h3, and it has to be h3 in the same change that added the band
          headings above it. This was an h2 for as long as the cards sat
          directly under the page's h1 with no grouping heading between them —
          h3 there would have skipped a level. Now there IS a grouping heading
          directly above, so h3 is the level that follows it and h2 would be
          the card claiming to rank alongside its own band.

          Not cosmetic: heading-order is scored `moderate`, and e2e/a11y.spec.ts
          fails on `impact !== "minor"` (see expectClean, and the comment above
          it naming the three moderate defects that widened the filter). The
          older note here said that suite "fails only on serious and critical";
          that stopped being true when the filter was widened, so both halves
          of this change are mechanically enforced, not just a Lighthouse
          score. Size is set by the class, so nothing moves. */}
      <h3 className="font-display mt-4 text-lg font-bold transition group-hover:text-accent">{r.label}</h3>
      <p className="mt-2 grow text-sm leading-relaxed text-zinc-400">{r.blurb}</p>
      <span
        className="mt-4 flex flex-wrap items-center justify-between gap-2 font-mono text-[11px] font-semibold"
        style={{ color: r.tint }}
      >
        enter →
        <CountChip r={r} />
      </span>
      </div>
    </Link>
  );
}

/**
 * The capture, its icon chip and the bleed into the card body.
 *
 * The <img> carries `absolute inset-0` as well as `h-full w-full`, and the
 * absolute half is the load-bearing one: <Picture> puts the class on the <img>
 * and wraps it in a bare <picture>, which is an inline box of auto height, so
 * a percentage height alone would resolve against nothing. Out of flow, the
 * percentages resolve against this box instead.
 *
 * `aspect-[16/10]` here AND width/height through <Picture>: /playground is an
 * audited URL with cumulative-layout-shift asserted at error severity, and
 * eight images that size themselves on decode is exactly the shift that budget
 * is for. The box is the right size before a byte arrives.
 */
function RoomShot({ r, eager = false, className = "" }: { r: Room; eager?: boolean; className?: string }) {
  const Icon = r.icon;
  return (
    <div className={`relative aspect-[16/10] overflow-hidden ${className}`}>
      {/* alt="", deliberately. The image sits inside the card's <Link>, so any
          words here become the first thing said when that link is announced —
          a screen-reader visitor would hear "Compose Playground, a screenshot
          of the room itself" before the blurb that actually describes it. It
          is decorative to the only person it cannot serve. */}
      <Picture
        src={shotFor(r)}
        alt=""
        loading={eager ? "eager" : "lazy"}
        width={1440}
        height={900}
        /* object-top earns its place on the LEAD card only, and measurably.
           In the grid the box is aspect-[16/10] against a 1440x900 capture —
           measured 1.600 at every width — so object-cover has nothing to crop
           and object-position is inert there. The lead card drops the ratio at
           `sm` and takes the row height from its text column instead, which
           measures 2.14 at 1440, 1.751 at 1024 and 0.743 at 660: it crops
           vertically at wide sizes and horizontally at narrow ones. Anchoring
           to the top keeps the part of a screenshot that identifies the room. */
        className="playground-shot absolute inset-0 h-full w-full object-cover object-top"
      />
      {/* The capture ends on a hard horizontal edge against the card. Fading it
          into --color-card (a solid, not a transparent black) means the chip
          below sits on a real ground rather than on whatever pixels the
          screenshot happens to end with. */}
      <span
        aria-hidden
        className="absolute inset-0"
        style={{ background: "linear-gradient(to top, var(--color-card), transparent 55%)" }}
      />
      <span
        className="absolute bottom-2 left-2 flex h-7 w-7 items-center justify-center rounded-lg border"
        style={{ borderColor: `${r.tint}40`, background: `${r.tint}12`, color: r.tint }}
      >
        <Icon size={14} />
      </span>
    </div>
  );
}

/**
 * `previews={false}` for the world view's sr-only copy.
 *
 * Playground.tsx mounts this grid TWICE in the world branch sense: once as the
 * visible list, and once inside `.sr-only print:not-sr-only` beside the 3D
 * canvas, which is the entire accessible room list a screen-reader user gets
 * there. sr-only is a 1px clip, not `display:none` and not offscreen, so
 * `loading="lazy"` does not reliably defer anything inside it — the world view
 * would fetch every capture on top of three.js, for images that are alt="" and
 * therefore serve nobody in that branch by construction.
 */
/** The rooms that count something once you are inside — the footnote's subject,
 *  from the same derivation the cards read. */
const deepRooms = ROOMS.filter((r) => eventsInsideRoom(r.to.slice(1)).length > 0);

export function RoomGrid({ previews = true }: { previews?: boolean } = {}) {
  const lead = ROOMS.find((r) => r.to === LEAD);
  return (
    <>
      {lead && <LeadCard r={lead} previews={previews} />}
      {bands(ROOMS.filter((r) => r.to !== LEAD)).map((band) => (
        <section key={band.group} aria-labelledby={`rooms-${band.group}-h`} className="mt-10">
          <h2 id={`rooms-${band.group}-h`} className="font-display text-lg font-bold tracking-tight">
            {band.label}
          </h2>
          <p className="kicker mt-1">{band.note}</p>
          {/* Two columns is the floor: a band of two in a three-column grid is
              two-thirds of a row of nothing. Three columns only where there are
              at least three cards to fill them. */}
          <div
            className={`mt-4 grid gap-4 ${band.rooms.length >= 3 ? "sm:grid-cols-2 lg:grid-cols-3" : "sm:grid-cols-2"}`}
          >
            {band.rooms.map((r, i) => (
              <RoomCard key={r.to} r={r} i={i} previews={previews} />
            ))}
          </div>
        </section>
      ))}
      <div className="mt-8 space-y-2 font-mono text-[11px] leading-relaxed text-muted">
        {/* Says out loud why six cards show one number and two show two, so the
            odd pair reads as "these rooms have more to count" rather than as an
            inconsistency. Both halves are derived: which rooms, from the same
            eventsInsideRoom the cards use — so wiring a counter into a third
            room updates this sentence instead of making it false — and the
            names off the registry, because "Chess" is what the route is called
            and "The Board" is what the card says. */}
        <p>
          Only {deepRooms.map((r) => r.label).join(" and ")} {deepRooms.length === 1 ? "has" : "have"} a second thing
          to count once you are inside. The rest can only tell you the door opened.
        </p>
        <LiveLine />
      </div>
    </>
  );
}

/**
 * The live tally, as one sentence.
 *
 * DELIBERATELY NOT A CHART. Both designs for this page led with a ranked bar
 * strip of the eight rooms; at the counts this thing actually holds — a busy
 * room is six — a ranking is two clicks of noise wearing a chart, and the site
 * draws nothing that implies more rigour than its data has. A tie therefore
 * says "tied" instead of picking the first key in registry order.
 * ponytail: revisit a ranked strip only if the top room clears 25 and doubles
 * the median. Below that there is nothing to rank.
 *
 * EVERY ROOM, WHICH IS WHAT MAKES THE SUPERLATIVE SAYABLE. `topEvents` runs
 * over the "Rooms entered" group of PULSE_EVENTS, and that group now holds one
 * key per room. It held seven of eight for as long as `room:weeb` went
 * unregistered: roomEvent's cast accepted the key, /playground and the 3D world
 * both wrote it, and nothing read it — /pulse drew no row, and a "most-opened"
 * line here was ranking over a set with a hole in it, so the sentence had to
 * disclose the hole instead of claiming a winner. Registering it closed both.
 * pulse.test.ts asserts the group against surfaces.ts room-for-room, so a ninth
 * room that ships without a key is red rather than silently outside the count.
 */
function LiveLine() {
  const { counts } = usePulseUI();
  const { events, count } = topEvents(counts, eventsInGroup("Rooms entered"));
  return (
    <p>
      {count === 0 ? (
        /* The state the page is in most days, and the branch that used to
           early-return before the explanation below — so on the one state a
           visitor is most likely to see, the counter was never explained at
           all. */
        "Nobody has picked a room from this page yet."
      ) : events.length > 1 ? (
        // countWord is capitalised by contract ("callers lowercase it where a
        // sentence needs that"); mid-sentence this shipped "the top Three".
        `Nothing has pulled ahead yet — the top ${countWord(events.length).toLowerCase()} are tied at ${count}.`
      ) : (
        <>
          Most-opened from this page so far:{" "}
          <strong className="font-semibold text-zinc-300">{PULSE_EVENTS[events[0]].label}</strong> ({count}).
        </>
      )}{" "}
      Counted only when someone picks a room here — from this list, or by driving into a door in the 3D world — on a
      shared tally anyone can write to. Not analytics; a sign of life. Every room on this page is in it.
    </p>
  );
}

/**
 * The nominated room, promoted out of the grid.
 *
 * This is the page's answer to "eight boxes and nothing says which one is
 * worth your time", and it is deliberately an editorial claim rather than a
 * derived one: a sentence somebody has to defend, sitting next to a picture of
 * the thing. Unlike a leaderboard it also reads identically on the day nobody
 * has clicked anything, which is most days.
 *
 * It is a RoomCard at a larger size, not a new kind of object — same <Link>,
 * same bump, same tint handlers, same visit chip. Two columns from `sm` up
 * with the capture leading; stacked below it, where a 16:10 image at full
 * width is already the loudest thing on the screen.
 */
function LeadCard({ r, previews }: { r: Room; previews: boolean }) {
  const { bump } = usePulseUI();
  const event = roomEvent(r);
  return (
    <Link
      to={r.to}
      onClick={() => bump(event)}
      className="panel playground-card group mt-10 grid overflow-hidden transition hover:-translate-y-1 sm:grid-cols-[55%_45%]"
      onMouseEnter={(e) => (e.currentTarget.style.borderColor = `${r.tint}66`)}
      onMouseLeave={(e) => (e.currentTarget.style.borderColor = "")}
    >
      {/* loading="eager" only here: this is the one capture that is above the
          fold on every viewport, so deferring it just moves the pop-in later.
          The other seven stay lazy. */}
      {/* `sm:aspect-auto sm:h-full` from the breakpoint the card becomes two
          columns. `aspect-[16/10]` on a grid item suppresses the implicit
          `align-self: stretch`, so the image kept its ratio while the text
          column set the row height — measured 232px of empty card below the
          shot at 768px and 354px at 641px, on the page's centerpiece.

          BOTH classes, and `sm:h-full` alone is a bug: with an aspect ratio and
          a definite height, CSS derives the WIDTH from the height, so the box
          came out 747.8px inside a 660px viewport and tripped the overflow
          check. Dropping the ratio at the same breakpoint lets the width be the
          grid track again. Nothing is lost from the CLS budget: above `sm` the
          row height comes from the text column, so this box never sized itself
          from a decoded image. Below `sm` the card stacks, the ratio is back,
          and it is the reservation again. */}
      {previews && <RoomShot r={r} eager className="sm:aspect-auto sm:h-full" />}
      <div className="flex min-w-0 flex-col p-6">
        {/* .brief-label IS this: the accent kicker at 11px mono, 0.1em, upper.
            Hand-rolling its four values is the exact thing the kicker sweep
            existed to undo ninety times over. */}
        <span className="brief-label">// start here</span>
        <h2 className="font-display mt-2 text-2xl font-bold tracking-tight transition group-hover:text-accent">
          {r.label}
        </h2>
        <div className="mt-1 flex flex-wrap items-center gap-2">
          <span className="kicker">{r.tag}</span>
          <WallChip r={r} />
        </div>
        {/* The nomination, and it is written to survive being read by someone
            who then opens the room. An earlier draft said this room proves the
            job because Compose "recompiles live in the browser"; it does not,
            and composeInterpreter.ts's own docstring is explicit that real
            Compose compiles Kotlin to Android and cannot run here. What is
            actually true is better copy anyway: an interpreter honest about
            being one, with real state behind it. */}
        {/* The registry blurb is deliberately NOT rendered above this. For
            /compose the two open on near-identical clauses ("watch it recompose
            live in a phone frame" against "watch it render in a phone frame"),
            back to back, on the one element the whole redesign exists for. The
            nomination is the superset — it carries the interpreter caveat and
            the "no install" — so it is the one that stays. */}
        <p className="mt-3 text-sm leading-relaxed text-zinc-300">
          The closest thing here to the day job: type Jetpack Compose and watch it render in a phone frame, with no
          install and no Android Studio. It is an interpreter for a curated slice of the language rather than a Kotlin
          compiler — that cannot run in a browser — but the state is real, so the counter everyone writes first
          actually counts.
        </p>
        <span
          className="mt-4 flex items-center justify-between gap-2 font-mono text-[11px] font-semibold"
          style={{ color: r.tint }}
        >
          open the editor →
          <CountChip r={r} />
        </span>
      </div>
    </Link>
  );
}
