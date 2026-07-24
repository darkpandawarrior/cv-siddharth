import { createFileRoute } from "@tanstack/react-router";
import { CursorAura } from "../CursorAura.tsx";
import { RoomFrame } from "../Playground.tsx";
import { LabBench } from "../LabBench.tsx";
import { FloatingChat } from "../FloatingChat.tsx";

export const Route = createFileRoute("/lab")({
  ssr: false,
  component: () => (
    <>
      <CursorAura />
      <RoomFrame title="The Lab Bench" tagline="nine instruments, running live">
        <LabBench />
      </RoomFrame>
      <FloatingChat />
    </>
  ),
});
