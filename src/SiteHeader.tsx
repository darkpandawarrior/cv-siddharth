import type { ReactNode } from "react";

export function SiteHeader({ children }: { children: ReactNode }) {
  return (
    <header
      data-spine="route-header"
      className="sticky top-0 z-40 border-b border-line bg-ink/90 backdrop-blur print:hidden max-md:[&>nav]:min-h-14 max-md:[&>nav]:flex-nowrap max-md:[&>nav]:gap-2 max-md:[&>nav]:px-3 max-md:[&>nav]:py-1"
    >
      {children}
    </header>
  );
}
