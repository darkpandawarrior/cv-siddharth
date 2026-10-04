import { readFileSync } from "node:fs";
import { test, expect } from "./lib/test.ts";
import { forceDeviceTier } from "./lib/deviceTier.ts";

type AudioProbe = { contexts: AudioContext[]; masters: GainNode[]; resumes: boolean[] };
type ProbeWindow = Window & { __worldAudio: AudioProbe };
const weather = JSON.parse(readFileSync(new URL("./fixtures/weather-wet-2026-09-24.json", import.meta.url), "utf8"));

// Inspect the real context without waiting for rendered frames or screenshots.
test("sound waits for a gesture and mute survives a reload", async ({ page }) => {
  await forceDeviceTier(page, 2);
  await page.clock.setFixedTime(new Date("2026-09-24T12:27:00+05:30"));
  await page.route("**/api/**", (route) => route.fulfill({ json: route.request().url().includes("/api/weather") ? weather : { connected: false } }));
  await page.addInitScript(() => {
    try { localStorage.setItem("playground:v2:onboarded", "1"); } catch { /* storage can be denied */ }
    const probe: AudioProbe = { contexts: [], masters: [], resumes: [] };
    (window as ProbeWindow).__worldAudio = probe;
    const NativeContext = window.AudioContext;
    window.AudioContext = class extends NativeContext {
      constructor(options?: AudioContextOptions) {
        super(options);
        probe.contexts.push(this);
        const createGain = this.createGain.bind(this);
        let first = true;
        this.createGain = () => {
          const gain = createGain();
          if (first) { probe.masters.push(gain); first = false; }
          return gain;
        };
      }
      resume() {
        probe.resumes.push(navigator.userActivation.hasBeenActive);
        return super.resume();
      }
    };
  });
  await page.goto("/playground?world=v2");
  await page.waitForFunction(() => document.querySelector("canvas[data-ambient-audio='mounted']") !== null);
  expect(await page.evaluate(() => {
    const probe = (window as ProbeWindow).__worldAudio;
    return { states: probe.contexts.map((ctx) => ctx.state), resumes: probe.resumes, activated: navigator.userActivation.hasBeenActive };
  })).toEqual({ states: [], resumes: [], activated: false });

  await page.keyboard.press("m");
  await page.waitForFunction(() => (window as ProbeWindow).__worldAudio.contexts.some((ctx) => ctx.state === "running"));
  expect(await page.evaluate(() => (window as ProbeWindow).__worldAudio.resumes)).toEqual([true]);
  expect(await page.evaluate(() => {
    const button = document.querySelector<HTMLButtonElement>("button[aria-label='Mute world sound']");
    if (!button) throw Error("Missing sound control");
    button.click();
    return { stored: localStorage.getItem("playground:muted"), gain: (window as ProbeWindow).__worldAudio.masters[0].gain.value };
  })).toEqual({ stored: "1", gain: 0 });

  await page.reload();
  await page.waitForFunction(() => document.querySelector("canvas[data-ambient-audio='mounted']") !== null);
  expect(await page.evaluate(() => ({
    stored: localStorage.getItem("playground:muted"),
    mutedButton: document.querySelector("button[aria-label='Unmute world sound'][aria-pressed='true']") !== null,
    states: (window as ProbeWindow).__worldAudio.contexts.map((ctx) => ctx.state),
    resumes: (window as ProbeWindow).__worldAudio.resumes,
  }))).toEqual({ stored: "1", mutedButton: true, states: [], resumes: [] });
  await page.keyboard.press("m");
  await page.waitForFunction(() => (window as ProbeWindow).__worldAudio.contexts.some((ctx) => ctx.state === "running"));
  expect(await page.evaluate(() => (window as ProbeWindow).__worldAudio.masters[0].gain.value)).toBe(0);
});
