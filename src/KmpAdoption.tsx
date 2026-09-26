import { kmpGraph } from "./data/kmpGraph.ts";
import { projectStats, kmpAdoption } from "./data/projectStats.ts";

/** One `substitutedModules` array per consumer app, in `kmpGraph.consumers`
 *  order — three live on `projectStats.ts` (measured off each app's own
 *  repo), two (candidai, the private repo; portfolio, this site itself) on
 *  the separate `kmpAdoption` export, per that module's own docstring. */
const SUBSTITUTED: Record<string, readonly string[]> = {
  doori: projectStats.doori.substitutedModules,
  gaddi: projectStats.gaddi.substitutedModules,
  "paymentslab-kmp": projectStats["paymentslab-kmp"].substitutedModules,
  candidai: kmpAdoption.candidai.substitutedModules,
  portfolio: kmpAdoption.portfolio.substitutedModules,
};

/**
 * kmp-toolkit's full module catalog (`kmpGraph.modules`) x its five
 * consumers, one dot per cell: which app has actually substituted which
 * module in, read straight off each app's own measured `substitutedModules`
 * list (idea-atlas.md#I2/#I4) — never a hand-typed adoption claim.
 */
export function KmpAdoption() {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[520px] border-collapse text-xs">
        <thead>
          <tr>
            <th scope="col" className="p-2 text-left font-semibold text-muted">
              Module
            </th>
            {kmpGraph.consumers.map((consumer) => (
              <th key={consumer.id} scope="col" className="p-2 text-center font-semibold text-muted">
                {consumer.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {kmpGraph.modules.map((mod) => (
            <tr key={mod.id} className="border-t border-line">
              <th scope="row" className="p-2 text-left font-mono font-normal text-zinc-300">
                {mod.id}
              </th>
              {kmpGraph.consumers.map((consumer) => {
                const used = SUBSTITUTED[consumer.id]?.includes(mod.id) ?? false;
                return (
                  <td key={consumer.id} className="p-2 text-center text-accent">
                    <span aria-label={used ? `substituted in ${consumer.label}` : `not substituted in ${consumer.label}`}>
                      {used ? "●" : "·"}
                    </span>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
