import { lazy, Suspense, useEffect, useState } from "react";
import { useRouterState } from "@tanstack/react-router";
import { MessageCircle } from "lucide-react";
import { OPEN_CHAT_EVENT, type OpenChatDetail } from "./lib/chatBus.ts";

// FloatingChat.tsx is 1,100+ lines (the panel, ChatWidgets, chatClient,
// voice) and was previously mounted eagerly on every route (F12: 24 hand
// mounts across src/App.tsx and 23 route files, F13). This component is the
// one root mount (src/routes/__root.tsx) that replaces all of them: eager
// and tiny itself, it lazy-loads FloatingChat only once chat is actually
// wanted — a click here, or an openChat()/openJdFit() call from elsewhere
// (CommandPalette, rooms.tsx, FaqDock's follow-up) that fires chatBus's
// open-chat event before this button was ever touched.
const LazyFloatingChat = lazy(() =>
  import("./FloatingChat.tsx").then((m) => ({ default: m.FloatingChat })),
);

// null = not wanted yet (the eager button below). An object = wanted — even
// with `detail: undefined` (a plain click) — carrying whatever payload the
// event that asked for it beat FloatingChat here with (a question, a JD, a
// FAQ follow-up), so it can be handed to FloatingChat as its initialDetail
// prop instead of lost: that event's own dispatch already happened and found
// nobody listening yet.
type Pending = { detail: OpenChatDetail | undefined } | null;

export function ChatLauncher() {
  const [pending, setPending] = useState<Pending>(null);

  useEffect(() => {
    if (pending) return; // FloatingChat's own window listener takes over from here
    const onOpen = (e: Event) => setPending({ detail: (e as CustomEvent<OpenChatDetail | undefined>).detail });
    window.addEventListener(OPEN_CHAT_EVENT, onOpen);
    return () => window.removeEventListener(OPEN_CHAT_EVENT, onOpen);
  }, [pending]);

  // /playground's own capture-hide (F13, moved from PlaygroundFloatingChat):
  // the launcher must not sit on top of the HUD's corner controls while a
  // visitor is actively driving the world. Gated on isWorldActive() &&
  // isCaptured() rather than isCaptured() alone: captured defaults to true
  // before the world ever mounts, so reading it alone would hide the
  // launcher on the room-list view too, before anyone has touched a control.
  //
  // world/input.ts is dynamically imported, not a top-level import: it is
  // /playground-only logic, and ChatLauncher is eager on every route (F12) —
  // a static import here would have put the world's input module back in
  // every route's initial bundle, the exact regression this component
  // exists to avoid. `captured` (not `hide` itself) is what state tracks, so
  // leaving /playground needs no reset effect — `hide` below just stops
  // reading it.
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const [captured, setCaptured] = useState(false);
  const hide = pathname === "/playground" && captured;
  useEffect(() => {
    if (pathname !== "/playground") return;
    let unsub: (() => void) | undefined;
    let cancelled = false;
    import("./world/input.ts").then(({ isCaptured, isWorldActive, subscribeCaptured }) => {
      if (cancelled) return;
      setCaptured(isWorldActive() && isCaptured());
      unsub = subscribeCaptured((c) => setCaptured(isWorldActive() && c));
    });
    return () => {
      cancelled = true;
      unsub?.();
    };
  }, [pathname]);

  if (hide) return null;

  if (!pending) {
    return (
      <button
        type="button"
        onClick={() => setPending({ detail: undefined })}
        aria-label="Open chat"
        className="chat-launcher fixed bottom-6 right-6 z-50 flex h-14 w-14 items-center justify-center rounded-full bg-accent text-ink shadow-lg shadow-accent/20 transition hover:scale-105 print:hidden"
      >
        <MessageCircle size={24} />
      </button>
    );
  }

  return (
    <Suspense fallback={null}>
      <LazyFloatingChat initialDetail={pending.detail} />
    </Suspense>
  );
}
