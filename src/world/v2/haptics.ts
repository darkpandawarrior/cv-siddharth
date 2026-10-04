import { isMuted, playImpact as audioImpact, playPickup as audioPickup } from "../audio.ts";

function pulse(pattern: number | number[], strength: number): void {
  if (isMuted() || typeof navigator === "undefined") return;
  try { navigator.vibrate?.(pattern); } catch { /* The browser can refuse vibration. */ }
  const duration = typeof pattern === "number" ? pattern : pattern.reduce((sum, ms) => sum + ms, 0);
  try {
    for (const pad of navigator.getGamepads?.() ?? []) {
      const actuator = pad?.vibrationActuator;
      if (!actuator) continue;
      void actuator.playEffect("dual-rumble", { duration, strongMagnitude: strength, weakMagnitude: strength / 2 }).catch(() => {});
    }
  } catch { /* Haptics must not prevent a walking transition. */ }
}

export function playImpact(force = 0.5): void {
  const strength = Math.max(0, Math.min(1, force));
  audioImpact(strength);
  pulse(40, strength);
}
export function playPickup(): void {
  audioPickup();
  pulse([20, 30, 20], 0.3);
}
