import { useEffect, useState } from 'react';

/** The HUD and its lazy siblings can arrive in either order. */
export function useOverflowHost() {
  const [host, setHost] = useState<Element | null>(null);
  useEffect(() => {
    const root = document.querySelector('[data-globe-root]');
    if (!root) return;
    const update = () => setHost(window.matchMedia('(max-width: 639px), (max-height: 500px)').matches
      ? root.querySelector('[data-globe-overflow]') : null);
    const observer = new MutationObserver(update);
    observer.observe(root, { childList: true, subtree: true });
    window.addEventListener('resize', update);
    queueMicrotask(update);
    return () => { observer.disconnect(); window.removeEventListener('resize', update); };
  }, []);
  return host;
}
