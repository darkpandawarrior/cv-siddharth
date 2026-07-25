import { describe, it, expect } from "vitest";
import { condenseJd } from "./jd-condense";

/**
 * A JD shaped like the real ones — and sized like them. The ModalX description
 * that surfaced the empty-bubble bug was 4,616 characters, of which the part
 * that decides a fit was a small minority; the rest was company narrative,
 * perks and legal text. A fixture materially shorter than that wouldn't
 * exercise this at all, since short JDs are passed through untouched.
 */
const REAL_SHAPED_JD = `
About Us

We are a fast-growing startup founded in 2019 by a team of ex-FAANG engineers who
believed that the world deserved better tooling. Since then we have grown to over
200 people across four offices, raised a Series B, and been named one of the best
places to work three years running. Our culture is built on transparency,
ownership and a genuine love of the craft. We ship every day and we mean it.

We started because we were frustrated. Every one of us had spent years at large
companies watching good ideas die in process, and we wanted to find out what a
team looked like when it trusted its engineers by default. That principle still
runs through everything: there are no tickets written by people who will never
touch the code, no architecture handed down from a committee, and no quarterly
roadmap that survives contact with a customer conversation unchanged. Engineers
here talk to users in their first week and ship to production in their first two.

Our investors include several of the funds you would expect, but we care rather
more that our customers renew than that our logo slide impresses anyone. We are
profitable on a unit basis, which means we get to make decisions on a timescale
that suits the product rather than the next raise.

Responsibilities

- Own the Android application end to end, from architecture through release
- Lead the migration of legacy Views to Jetpack Compose
- Mentor two junior engineers and run the Android chapter's design reviews
- Partner with backend on offline-first sync and conflict resolution

Requirements

- 5+ years of professional Android development in Kotlin
- Deep Jetpack Compose experience, including performance work
- Strong grasp of coroutines, Flow, and structured concurrency
- Experience with Room, WorkManager and dependency injection (Hilt or Dagger)

Nice to have

- Kotlin Multiplatform exposure
- Published libraries or conference talks

Benefits

- Competitive salary and meaningful equity in a Series B company
- Unlimited PTO that we actually encourage you to take, plus a company-wide
  winter shutdown between Christmas and New Year every single year
- Top-tier private health, dental and vision cover for you and your dependents
- An annual learning budget of $2,500 and a dedicated conference allowance
- Fully stocked kitchen, catered lunches on Tuesdays and Thursdays, and a games room

Why Join Us

You will be joining at an inflection point. The product is loved, the market is
enormous, and the engineering team is small enough that your work will be visible
to everyone including the founders. We have a genuine bias toward action.

Equal Opportunity

We are an equal opportunity employer and value diversity at our company. We do not
discriminate on the basis of race, religion, color, national origin, gender, sexual
orientation, age, marital status, veteran status, or disability status. All
qualified applicants will receive consideration for employment.

How to Apply

Send your CV and a short note to jobs@example.com. We aim to respond within five
business days and our process is four stages including a take-home exercise.
`.trim();

describe("condenseJd", () => {
  it("drops boilerplate sections", () => {
    const out = condenseJd(REAL_SHAPED_JD);
    expect(out).not.toContain("Unlimited PTO");
    expect(out).not.toContain("equal opportunity employer");
    expect(out).not.toContain("jobs@example.com");
    expect(out).not.toContain("ex-FAANG");
  });

  it("keeps every line that decides the fit", () => {
    const out = condenseJd(REAL_SHAPED_JD);
    expect(out).toContain("5+ years of professional Android development in Kotlin");
    expect(out).toContain("Deep Jetpack Compose experience");
    expect(out).toContain("coroutines, Flow, and structured concurrency");
    expect(out).toContain("Room, WorkManager");
    expect(out).toContain("Kotlin Multiplatform exposure"); // nice-to-haves are signal
    expect(out).toContain("Own the Android application end to end");
    expect(out).toContain("Mentor two junior engineers");
  });

  it("actually shortens a real-shaped JD", () => {
    const out = condenseJd(REAL_SHAPED_JD);
    expect(out.length).toBeLessThan(REAL_SHAPED_JD.length * 0.6);
  });

  it("keeps 'About the role' while dropping 'About us'", () => {
    // The one genuinely ambiguous heading: same first word, opposite value.
    const jd =
      "About Us\n" +
      "x".repeat(1500) +
      "\n\nAbout the role\nYou will own the Android app and lead Compose adoption.\n" +
      "\n\nRequirements\n- 5 years Kotlin\n" +
      "y".repeat(1500);
    const out = condenseJd(jd);
    expect(out).toContain("You will own the Android app");
    expect(out).not.toContain("x".repeat(100));
  });

  it("leaves a short JD completely untouched", () => {
    const short = "Senior Android Engineer. Requirements: 5 years Kotlin, Compose.";
    expect(condenseJd(short)).toBe(short);
  });

  it("returns the original rather than a husk when headings read as all-boilerplate", () => {
    // Safety property: a JD whose every heading looks like noise is far more
    // likely to be an unusual layout than a JD with no requirements in it.
    const jd = "Benefits\n" + "Real requirements hide in here. ".repeat(120);
    expect(condenseJd(jd)).toBe(jd);
  });

  it("passes through a heading-less wall of text", () => {
    const jd = "We need a senior Android engineer with Kotlin and Compose. ".repeat(60);
    expect(condenseJd(jd)).toBe(jd);
  });

  it("never treats a bullet as a heading", () => {
    // "- Benefits administration experience" is a requirement, not a section.
    const jd =
      "Requirements\n- Benefits administration experience with Kotlin\n" +
      "- 5 years Android\n" +
      "z".repeat(2600);
    expect(condenseJd(jd)).toContain("Benefits administration experience");
  });
});
