// ponytail: archive(world-v1) until 2027-04-04; removal recipe in ARCHIVE.md#world-v1
import { useEffect } from "react";
import { isInteractiveTarget } from "../../input.ts";
import { openArchive } from "../archiveGate.ts";

export const layer = { id: "konami-archive", order: 76 };
const sequence = ["arrowup", "arrowup", "arrowdown", "arrowdown", "arrowleft", "arrowright", "arrowleft", "arrowright", "b", "a"];

export function createKonamiListener(): (event: KeyboardEvent) => void {
  let index = 0;
  return (event) => {
    if (event.repeat || isInteractiveTarget(event.target)) return;
    const key = event.key.toLowerCase();
    index = key === sequence[index] ? index + 1 : key === sequence[0] ? 1 : 0;
    if (index === sequence.length) { index = 0; openArchive(); }
  };
}

export default function KonamiArchive() {
  useEffect(() => {
    const onKey = createKonamiListener();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  return null;
}
