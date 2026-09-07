import { Component, useEffect, useState, type ReactNode } from "react";

/* Bits shared between the 2D tldraw sketch board (BlueprintRoom.tsx) and the
 * 3D fly-through scene (Blueprint3D.tsx): the WebGL probe, the count-up
 * number animation, and a small crash boundary. Kept in their own module so
 * neither view has to import from the other.
 *
 * No `three`/`@react-three/fiber` import here on purpose: BlueprintRoom.tsx
 * imports this module (for hasWebGL/hasTldrawLicense alone) and is reached
 * from /blueprint's SSR build, and importProtection denies both from the
 * server bundle. The hologram mesh that needs them (HoloCore) lives in
 * blueprintHologram.tsx, imported only by the already-client-only
 * Blueprint3D.tsx and SketchBoard.tsx. */

/* Cheap one-shot WebGL capability probe. Three.js content only mounts a
 * <Canvas> when this passes — otherwise callers show a static fallback, so a
 * machine without WebGL (or one that's exhausted its context budget after
 * repeated visits) never blanks the whole page. */
let webglOK: boolean | null = null;
export function hasWebGL(): boolean {
  if (webglOK !== null) return webglOK;
  try {
    const c = document.createElement("canvas");
    webglOK = !!(c.getContext("webgl2") || c.getContext("webgl"));
  } catch {
    webglOK = false;
  }
  return webglOK;
}

/* The sketch board's equivalent of the WebGL probe: can tldraw actually run on
 * this host? Since v4.0.0 tldraw hard-gates production use — with no license
 * key its LicenseProvider renders the editor for exactly 5 seconds and then
 * swaps the whole thing for a hidden <div data-testid="tl-license-expired">.
 * That is the "sketch canvas goes blank after a few seconds" report: not a
 * camera drift, not a lost context, a licence gate. localhost is exempt (same
 * host check tldraw's own LicenseManager uses), which is why dev, preview and
 * CI never saw it. So we only offer Sketch where it will survive; drop a key
 * in VITE_TLDRAW_LICENSE_KEY and the mode comes back everywhere. */
/**
 * The expiry baked into a tldraw key, or null if the string is not one.
 *
 * Keys look like `tldraw-YYYY-MM-DD/payload.signature`, and that date is the
 * whole point: an EXPIRED key is worse than no key at all. With no key,
 * hasTldrawLicense() returns false on an https host and Sketch mode is never
 * offered, so a visitor sees Fly and ASCII and nothing is broken. With an
 * expired key the gate below used to return true on the mere presence of a
 * string, so the site advertised a mode that tldraw's own LicenseManager then
 * refused: the editor rendered for about five seconds and vanished.
 *
 * Verified against the live site on 2026-08-24 — the key in play expired
 * 2026-08-12, and /blueprint's Sketch mode mounted at 2.5s and was gone by
 * 6.5s. Presence is not validity.
 */
export function tldrawKeyExpiry(key: string | undefined): Date | null {
  const m = /^tldraw-(\d{4})-(\d{2})-(\d{2})\//.exec(key ?? "");
  if (!m) return null;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  return Number.isNaN(d.getTime()) ? null : d;
}

export function hasTldrawLicense(now: Date = new Date()): boolean {
  const key = import.meta.env.VITE_TLDRAW_LICENSE_KEY;
  if (key) {
    const expiry = tldrawKeyExpiry(key);
    // An unrecognised shape is trusted: tldraw may change its format, and
    // refusing a key we simply cannot parse would disable a mode that would
    // have worked. Only a key we can read AND that has passed is rejected.
    if (expiry === null || expiry.getTime() >= now.getTime()) return true;
  }
  if (typeof location === "undefined") return false;
  // Mirrors LicenseManager.getIsDevelopment(): tldraw exempts anything not
  // served over https as well as the loopback hosts, so a plain-http preview
  // on a LAN address is "development" to it and runs unlicensed. Matching its
  // rule rather than guessing at it keeps this from disabling a mode tldraw
  // would happily have run. Note the corollary — an http origin can never
  // prove the licence works, because tldraw never checks it there.
  const host = location.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  const isLoopback = host === "localhost" || host === "::1" || /^127(?:\.\d{1,3}){3}$/.test(host);
  return isLoopback || location.protocol !== "https:";
}

/* Local boundary so a crash *inside* a piece of three.js content (e.g. a lost
 * WebGL context) can't propagate up and take a whole page down. */
export class ShapeBoundary extends Component<{ children: ReactNode; fallback: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

export function CountUp({ value }: { value: string }) {
  const [text, setText] = useState("0");
  useEffect(() => {
    const m = /^(-?)(\d+)(.*)$/.exec(value);
    if (!m) {
      setText(value);
      return;
    }
    const [, sign, digits, suffix] = m;
    const target = parseInt(digits, 10);
    const start = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      const t = Math.min((now - start) / 1200, 1);
      const eased = 1 - (1 - t) ** 3;
      setText(`${sign}${Math.round(target * eased)}${suffix}`);
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value]);
  return <>{text}</>;
}
