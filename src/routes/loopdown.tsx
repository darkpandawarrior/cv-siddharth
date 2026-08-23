import { createFileRoute } from "@tanstack/react-router";
import { roomHead } from "../lib/routeHead.ts";
import { AmbientBackground } from "../AmbientBackground.tsx";
import { CursorAura } from "../CursorAura.tsx";
import { WritingView } from "../WritingView.tsx";
import { FloatingChat } from "../FloatingChat.tsx";
import { SiteFooter } from "../SiteFooter.tsx";

export const Route = createFileRoute("/loopdown")({
  head: () => roomHead("/loopdown"),
  component: () => (
    <div className="min-h-screen">
      <AmbientBackground />
      <CursorAura />
      <WritingView />
      {/* This route had ZERO links in it — no nav, no footer, no onward path.
          Once you arrived, the browser back button was the only way out.
          SiteFooter's own doc comment says it exists "so no page is a dead
          end", and it was mounted on exactly one page. Its section links
          already navigate cross-route (useSectionNav falls through to
          /#id), so it works here unchanged. */}
      <SiteFooter />
      <FloatingChat />
    </div>
  ),
});
