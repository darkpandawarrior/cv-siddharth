import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { useRouterState } from "@tanstack/react-router";
import { MessageCircle } from "lucide-react";
import { OPEN_CHAT_EVENT, type OpenChatDetail } from "./lib/chatBus.ts";
import { isCaptured, isWorldActive, subscribeCaptured } from "./world/input.ts";

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

export function ChatLauncher() {
  const [wanted, setWanted] = useState(false);
  // The event that made `wanted` true may have carried a payload (a
  // question, a JD, a FAQ follow-up) — FloatingChat isn't mounted yet to
  // hear it, so it's captured here and handed to FloatingChat once it is
  // (its own initialDetail prop), rather than lost or replayed.
  const initialDetailRef = useRef<OpenChatDetail | undefined>(undefined);

  useEffect(() => {
    if (wanted) return; // FloatingChat's own window listener takes over from here
    const onOpen = (e: Event) => {
      initialDetailRef.current = (e as CustomEvent<OpenChatDetail | undefined>).detail;
      setWanted(true);
    };
    window.addEventListener(OPEN_CHAT_EVENT, onOpen);
    return () => window.removeEventListener(OPEN_CHAT_EVENT, onOpen);
  }, [wanted]);

  // /playground's own capture-hide (F13, moved from PlaygroundFloatingChat):
  // the launcher must not sit on top of the HUD's corner controls while a
  // visitor is actively driving the world. Gated on isWorldActive() &&
  // isCaptured() rather than isCaptured() alone: captured defaults to true
  // before the world ever mounts, so reading it alone would hide the
  // launcher on the room-list view too, before anyone has touched a control.
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const [hide, setHide] = useState(() => pathname === "/playground" && isWorldActive() && isCaptured());
  useEffect(() => {
    if (pathname !== "/playground") {
      setHide(false);
      return;
    }
    setHide(isWorldActive() && isCaptured());
    return subscribeCaptured((captured) => setHide(isWorldActive() && captured));
  }, [pathname]);

  if (hide) return null;

  if (!wanted) {
    return (
      <button
        type="button"
        onClick={() => setWanted(true)}
        aria-label="Open chat"
        className="chat-launcher fixed bottom-6 right-6 z-50 flex h-14 w-14 items-center justify-center rounded-full bg-accent text-ink shadow-lg shadow-accent/20 transition hover:scale-105 print:hidden"
      >
        <MessageCircle size={24} />
      </button>
    );
  }

  return (
    <Suspense fallback={null}>
      <LazyFloatingChat initialDetail={initialDetailRef.current} />
    </Suspense>
  );
}
