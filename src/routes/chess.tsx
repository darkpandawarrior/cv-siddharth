import { createFileRoute } from "@tanstack/react-router";
import { roomHead } from "../lib/routeHead.ts";
import { CursorAura } from "../CursorAura.tsx";
import { RoomFrame } from "../rooms.tsx";
import { ChessRoom } from "../ChessRoom.tsx";
import { FloatingChat } from "../FloatingChat.tsx";
import { chess } from "../data/chess.ts";
import { countWord } from "../data/labs.ts";

// "seven years" was typed into the tagline beside the generated span that
// decides it, and it is only true by accident: `discipline.spanDays` is
// refreshed on every build from the first and last game the APIs return.
// Spelled out rather than a numeral because that is the register the rest of
// the site counts in, lowercased because countWord capitalises for prose.
//
// ponytail: derived here rather than exported from src/data/chess.ts, which is
// generator output — a helper added there is deleted by the next
// `npm run gen:chess`. Four other surfaces state the same number; when they
// derive it too this belongs next to countWord in src/data/labs.ts.
const chessYears = countWord(Math.floor(chess.discipline.spanDays / 365.25)).toLowerCase();

export const Route = createFileRoute("/chess")({
  head: () => roomHead("/chess"),
  component: () => (
    <>
      <CursorAura />
      <RoomFrame title="The Board" tagline={`${chessYears} years of games, mined`}>
        <ChessRoom />
      </RoomFrame>
      <FloatingChat />
    </>
  ),
});
