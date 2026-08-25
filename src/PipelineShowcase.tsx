import { useEffect, useState } from "react";
import { ArrowUpRight, CheckCircle2, XCircle, Loader2 } from "lucide-react";
import type { Pipeline } from "../api/_lib/pipeline-handler.ts";

/** Live CI/CD panel for a project page.
 *
 *  Deliberately read-only. A button that starts a build mostly proves you can call
 *  an API, and these builds take 10 to 25 minutes, so a reader would never see the
 *  end of one. What is worth showing is the supply chain: which workflows ran, how
 *  long they took, what version reached the F-Droid repo, and the signing
 *  certificate a reader can verify against the APK themselves. */
export function PipelineShowcase({ slug }: { slug: string }) {
  const [data, setData] = useState<Pipeline | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let live = true;
    fetch(`/api/pipeline?slug=${encodeURIComponent(slug)}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((d: Pipeline) => live && setData(d))
      .catch(() => live && setFailed(true));
    return () => {
      live = false;
    };
  }, [slug]);

  // Say nothing rather than render an empty shell. A panel that shows zeros when
  // the API is down misrepresents the pipeline as idle.
  if (failed) return null;
  if (!data) {
    return (
      <p className="flex items-center gap-2 font-mono text-[11px] text-muted">
        <Loader2 size={12} className="animate-spin" /> reading the pipeline
      </p>
    );
  }
  if (!data.connected && !data.published) return null;

  const mb = data.published ? (data.published.sizeBytes / 1048576).toFixed(1) : null;

  return (
    <div className="flex flex-col gap-5">
      {data.published && (
        <div className="panel flex flex-wrap items-baseline gap-x-6 gap-y-2 p-5">
          <span className="font-display text-2xl font-bold text-accent">{data.published.versionName}</span>
          <span className="font-mono text-sm text-zinc-400">{mb} MB</span>
          <span className="font-mono text-[11px] text-muted">
            {data.published.antiFeatures.length
              ? data.published.antiFeatures.join(", ")
              : "no anti-features"}
          </span>
          <span className="ml-auto font-mono text-[11px] text-muted">live on F-Droid</span>
        </div>
      )}

      {data.runs.length > 0 && (
        <ul className="flex flex-col divide-y divide-line">
          {data.runs.map((r) => {
            const ok = r.conclusion === "success";
            const running = r.conclusion === "running";
            return (
              <li key={r.url} className="flex items-center gap-3 py-2.5">
                {running ? (
                  <Loader2 size={13} className="shrink-0 animate-spin text-muted" />
                ) : ok ? (
                  <CheckCircle2 size={13} className="shrink-0 text-accent" />
                ) : (
                  <XCircle size={13} className="shrink-0 text-red-400" />
                )}
                <a href={r.url} target="_blank" rel="noreferrer" className="flex-1 truncate text-sm text-zinc-300 hover:text-accent">
                  {r.name}
                </a>
                <span className="shrink-0 font-mono text-[11px] tabular-nums text-muted">
                  {r.durationSec === null
                    ? ""
                    : r.durationSec >= 60
                      ? `${Math.floor(r.durationSec / 60)}m ${r.durationSec % 60}s`
                      : `${r.durationSec}s`}
                </span>
              </li>
            );
          })}
        </ul>
      )}

      <div className="panel flex flex-col gap-2 p-5">
        <p className="kicker-accent">signing certificate</p>
        <p className="break-all font-mono text-[11px] leading-relaxed text-zinc-400">{data.fingerprint}</p>
        <p className="text-sm leading-relaxed text-zinc-400">
          Every published APK carries this certificate, and each app pins it in its own F-Droid
          metadata. Download the APK and run{" "}
          <code className="font-mono text-[11px] text-accent">apksigner verify --print-certs</code> on
          it: the SHA-256 should match this string exactly. That is the whole claim, and it is
          checkable without trusting anything on this page.
        </p>
        {data.release && (
          <a
            href={data.release.url}
            target="_blank"
            rel="noreferrer"
            className="mt-1 inline-flex items-center gap-1 font-mono text-[11px] text-accent hover:underline"
          >
            {data.release.tag} on GitHub <ArrowUpRight size={11} />
          </a>
        )}
      </div>
    </div>
  );
}
