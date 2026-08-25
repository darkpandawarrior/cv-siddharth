import { createFileRoute } from "@tanstack/react-router";
import { roomHead } from "../lib/routeHead.ts";
import { CursorAura } from "../CursorAura.tsx";
import { RoomFrame } from "../rooms.tsx";
import { LabBench } from "../LabBench.tsx";
import { FloatingChat } from "../FloatingChat.tsx";
import { LAB_TABS, countWord } from "../data/labs.ts";

export const Route = createFileRoute("/lab")({
  head: () => roomHead("/lab"),
  component: () => (
    <>
      <CursorAura />
      <RoomFrame title="The Lab Bench" tagline={`${countWord(LAB_TABS.length).toLowerCase()} instruments, running live`}>
        <LabBench />
      </RoomFrame>
      <FloatingChat />
    </>
  ),
});
