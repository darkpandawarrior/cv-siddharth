import { useState } from "react";
import { providers } from "./data/providers.ts";
import type { Provider } from "./data/providers.ts";

/** Two gateways from PaymentsLab-KMP's cataloged providers, side by side:
 *  archetype, region and shipped status. Reads providers.ts, the generated
 *  catalog (scripts/gen-providers.mjs), no hand-typed provider list here,
 *  see idea-atlas.md#REC-2/#I3. */

/** Pure lookup, exported so a test can exercise it without rendering (no
 *  jsdom/@testing-library/react in this repo's vitest config; see
 *  EvidenceChip.test.ts for the same convention). */
export function findProvider(slug: string, list: Provider[] = providers): Provider | undefined {
  return list.find((p) => p.slug === slug);
}

const DEFAULT_A = providers[0]?.slug ?? "";
const DEFAULT_B = providers[1]?.slug ?? DEFAULT_A;

function ProviderColumn({ provider }: { provider: Provider | undefined }) {
  if (!provider) return <p className="text-sm text-muted">No provider selected.</p>;
  return (
    <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 text-sm">
      <dt className="text-muted">Region</dt>
      <dd className="text-zinc-100">{provider.region}</dd>
      <dt className="text-muted">Archetype</dt>
      <dd className="text-zinc-100">{provider.archetypeLabel}</dd>
      <dt className="text-muted">Status</dt>
      <dd className="font-mono text-xs text-accent">{provider.status}</dd>
    </dl>
  );
}

function CompareColumn({ index, slug, onChange, provider }: { index: number; slug: string; onChange: (slug: string) => void; provider: Provider | undefined }) {
  const id = `gateway-compare-${index}`;
  return (
    <div className="rounded-xl border border-line bg-card/50 p-4">
      <label className="sr-only" htmlFor={id}>Gateway {index + 1}</label>
      <select
        id={id}
        value={slug}
        onChange={(event) => onChange(event.target.value)}
        className="mb-3 min-h-11 w-full rounded-lg border border-line bg-ink px-3 text-sm text-zinc-100 focus:border-accent"
      >
        {providers.map((p) => (
          <option key={p.slug} value={p.slug}>
            {p.name}
          </option>
        ))}
      </select>
      <ProviderColumn provider={provider} />
    </div>
  );
}

export function GatewayCompare() {
  const [aSlug, setASlug] = useState(DEFAULT_A);
  const [bSlug, setBSlug] = useState(DEFAULT_B);

  return (
    <div className="card-elevated rounded-2xl border border-line bg-void/70 p-5">
      <p className="mb-4 text-sm leading-relaxed text-muted">
        Pick two of PaymentsLab-KMP's {providers.length} cataloged gateways to compare region, archetype and shipped status.
      </p>
      <div className="grid gap-4 sm:grid-cols-2">
        <CompareColumn index={0} slug={aSlug} onChange={setASlug} provider={findProvider(aSlug)} />
        <CompareColumn index={1} slug={bSlug} onChange={setBSlug} provider={findProvider(bSlug)} />
      </div>
    </div>
  );
}
