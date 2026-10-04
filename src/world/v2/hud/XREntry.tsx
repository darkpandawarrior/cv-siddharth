import { useEffect, useState, useSyncExternalStore } from "react";
import { cancelXR, enterVR, getXRPresenting, getXRTier, prepareXR, subscribeXRTier, supportsVR } from "../xr.ts";
import { getWalk, getWalkControls, subscribeWalk } from "../walk.ts";
import { deviceTier } from "../../deviceTier.ts";

export const layer = { id: "xr-entry", order: 75 };

export default function XREntry() {
  const [supported, setSupported] = useState<boolean | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState("");
  const controls = useSyncExternalStore(subscribeWalk, getWalkControls, () => null);
  const walk = useSyncExternalStore(subscribeWalk, getWalk, () => null);
  const xrTier = useSyncExternalStore(subscribeXRTier, getXRTier, () => null);
  const presenting = useSyncExternalStore(subscribeXRTier, getXRPresenting, () => false);
  useEffect(() => {
    let active = true;
    void supportsVR().then((value) => { if (active) setSupported(value); });
    return () => { active = false; cancelXR(); };
  }, []);

  return <section aria-label="Walk and VR" data-vr-supported={supported ?? "pending"} className="pointer-events-auto absolute right-3 top-16 z-20 max-w-64 rounded-xl border border-line bg-card/95 p-3 text-sm backdrop-blur">
    {controls && deviceTier() !== 3 && (walk ? <>
      <p>Walking at {walk.landing.label}. WASD to move. B returns to the boat.</p>
      <button type="button" onClick={() => { void controls.back().catch(() => setError("Exit the headset session to return to the boat.")); }}>Back to boat</button>
    </> : <>
      <label className="block">Landing
        <select aria-label="Walking landing" value={selected || controls.landings[0]?.id || ""} onChange={(event) => setSelected(event.target.value)} className="block w-full bg-card">
          {controls.landings.map((l) => <option key={l.id} value={l.id}>{l.label}</option>)}
        </select>
      </label>
      <button type="button" disabled={!controls.landings.length} onClick={() => {
        setError(controls.start(selected || controls.landings[0]?.id || "") ? "" : "Exit the tour before stepping ashore.");
      }}>Walk the ghats</button>
    </>)}
    {supported && <button type="button" disabled={pending || (xrTier === 2 && !controls)} onClick={async () => {
      if (xrTier === null) { prepareXR(); return; }
      setPending(true);
      setError("");
      try { if (presenting) await controls?.back(); else await enterVR(); }
      catch (cause) { setError(cause instanceof Error ? cause.message : "VR could not start."); }
      finally { setPending(false); }
    }}>{presenting ? "Exit VR" : xrTier === 2 ? "Start VR" : "Enter VR"}</button>}
    {xrTier === 2 && !walk && <button type="button" onClick={cancelXR}>Cancel VR</button>}
    {error && <p role="status">{error}</p>}
  </section>;
}
