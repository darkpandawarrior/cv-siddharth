import { useState } from "react";
import { ArrowRight, Target } from "lucide-react";
import { Reveal } from "./Reveal.tsx";
import { openJdFit } from "./FloatingChat.tsx";
import { JD_MAX_CHARS, isJdNearCap } from "./lib/chatClient.ts";

/**
 * Fit check — the recruiter's moment, on the page instead of behind a command.
 *
 * The JD analyzer already existed as `/jd` inside the console, which means it
 * existed for nobody: a recruiter who never opens the chat never finds it. So
 * the paste box moves out here, one scroll below the numbers that make someone
 * want to check fit in the first place.
 *
 * This component owns the textarea and NOTHING else. `openJdFit()` hands the
 * text to the console (src/FloatingChat.tsx), which runs the exact same path
 * `/jd` runs — same cap, same request, same streamed scorecard. There is no
 * second copy of the analysis anywhere.
 */

// What comes back, stated up front. It's the honest part that sells it: a fit
// read with no gaps in it is marketing, and recruiters can smell marketing.
const CONTRACT = [
  { label: "score", detail: "0–100, with the band" },
  { label: "matches", detail: "each with the evidence behind it" },
  { label: "gaps", detail: "named — never an empty list" },
];

export function FitCheck() {
  const [jd, setJd] = useState("");

  function run() {
    const text = jd.trim();
    if (text) openJdFit(text);
  }

  return (
    <section id="fit" className="section-y mx-auto max-w-5xl px-6">
      <Reveal>
        <p className="section-eyebrow mb-2">// fit check</p>
        <h2 className="font-display mb-2 text-h2 font-bold tracking-tight">Hiring? Paste the job description.</h2>
        <p className="mb-6 max-w-2xl text-zinc-400">
          My AI assistant reads it against what I've actually shipped and answers the only question that matters:
          where I fit, and where I don't. No score inflation — the gaps come with the strengths.
        </p>
        <div className="mb-8 flex flex-wrap gap-2">
          {CONTRACT.map((c) => (
            <span
              key={c.label}
              className="rounded-full border border-line bg-card px-3 py-1.5 font-mono text-[11px] text-muted"
            >
              <span className="text-accent2">{c.label}</span> · {c.detail}
            </span>
          ))}
        </div>
      </Reveal>

      <Reveal delay={100}>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            run();
          }}
          className="panel card-elevated overflow-hidden"
        >
          <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 border-b border-line bg-surface px-4 py-2.5 font-mono text-[10px] uppercase tracking-widest">
            {/* The strip header IS the field's label — visible, not sr-only.
                Deliberately NOT the console composer's wording ("job
                description → fit analysis"): both textareas can be on screen at
                once, and two controls sharing an accessible name is a maze for
                anyone navigating by form field. */}
            <label htmlFor="fit-jd" className="flex items-center gap-2 text-accent2">
              <span className="status-pulse h-1.5 w-1.5 rounded-full bg-accent2" aria-hidden />
              paste a job description
            </label>
            <span className="text-muted">answers in the console, streaming</span>
          </div>

          <div className="p-4 sm:p-5">
            <textarea
              id="fit-jd"
              value={jd}
              onChange={(e) => setJd(e.target.value)}
              onKeyDown={(e) => {
                if (e.nativeEvent.isComposing) return;
                // ⌘/Ctrl + Enter sends; plain Enter stays a newline, same
                // contract as the console's JD composer.
                if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                  e.preventDefault();
                  run();
                }
              }}
              maxLength={JD_MAX_CHARS}
              rows={6}
              placeholder="Paste the whole thing — responsibilities, requirements, the years-of-experience line. The more of it I get, the less I have to guess."
              aria-describedby="fit-jd-hint"
              className="w-full resize-y rounded-xl border border-line bg-ink px-3.5 py-3 text-sm leading-relaxed text-zinc-100 placeholder-muted outline-none focus:border-accent"
            />
            <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2">
              <span className={`font-mono text-[11px] ${isJdNearCap(jd.length) ? "text-accent" : "text-muted"}`}>
                {jd.length.toLocaleString()} / {JD_MAX_CHARS.toLocaleString()}
              </span>
              {/* sr-only on phones (no ⌘ to press) but never hidden from
                  assistive tech — aria-describedby can't read display:none.
                  No "nothing is stored" claim here: the console keeps the last
                  turns in localStorage, so that would be a lie on the one
                  section whose whole pitch is not overselling. */}
              <span id="fit-jd-hint" className="sr-only text-[11px] text-muted sm:not-sr-only">
                ⌘/Ctrl + Enter analyses
              </span>
              <button
                type="submit"
                disabled={!jd.trim()}
                className="ml-auto flex items-center gap-2 rounded-full bg-accent px-5 py-2.5 font-semibold text-ink transition hover:bg-accent-dim disabled:opacity-40 disabled:hover:bg-accent"
              >
                <Target size={16} /> Analyse fit <ArrowRight size={15} />
              </button>
            </div>
          </div>
        </form>
      </Reveal>
    </section>
  );
}
