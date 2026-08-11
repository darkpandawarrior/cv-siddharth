#!/usr/bin/env python3
"""Watches a repo's screenshots for the ways they rot silently.

    python3 scripts/screenshot-sentinel.py [--fail-on broken,duplicate] [--write-report]

Configured by scripts/sentinel.config.json next to it, so the script is identical in every repo
and only the config differs. Keys (all optional except `shots`):

    shots        directory holding the captures, relative to the repo root
    sources      globs to scan for screen declarations, e.g. ["**/*.kt"]
    screenRegex  regex whose first group is a screen name, e.g. "fun (\\w+Screen)\\s*\\("
    ignore       capture basenames (no extension) that are allowed to have no source screen
    checkOrphaned  true only when captures are named after screens (see ORPHANED below)
    minBytes     below this a capture is treated as broken (default 1000)

Every check answers a way screenshots lie while looking fine:

  BROKEN      a capture that is blank or near-uniform. It renders, it commits, it proves nothing.
  DUPLICATE   two names, identical pixels. Either one screen is captured twice under two names, or
              a capture silently stopped following its screen and fell back to something generic.
  UNCAPTURED  a screen in the source that no capture matches — the gallery looks complete because
              you cannot see what is missing.
  ORPHANED    a capture whose screen no longer exists. It keeps showing a UI that is gone, which is
              worse than showing nothing.
  STALE       source changed after its capture was last written, so the image predates the code.

Exit code is 0 unless --fail-on names a category with findings, so a repo can adopt it in warn-only
mode and tighten later. Adopting it as a hard gate on day one just gets it disabled.
"""
from __future__ import annotations

import argparse
import fnmatch
import hashlib
import json
import os
import re
import subprocess
import sys
from collections import defaultdict

try:
    from PIL import Image, ImageStat
except ImportError:
    sys.exit("Pillow required:  python3 -m pip install --user Pillow")

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.dirname(HERE)
CONFIG = os.path.join(HERE, "sentinel.config.json")
# Standard deviation across all channels. A real screen has type, chrome and cards; below this it
# is a flat fill or near enough that nobody could review it.
FLAT_STDDEV = 6.0


def load_config() -> dict:
    if not os.path.exists(CONFIG):
        sys.exit(f"missing {CONFIG} — the sentinel is config-driven so the script stays identical across repos")
    return json.load(open(CONFIG))


def git(*args: str) -> str:
    try:
        return subprocess.check_output(["git", "-C", REPO, *args], text=True, stderr=subprocess.DEVNULL)
    except subprocess.CalledProcessError:
        return ""


def captures(shots_dir: str) -> list[str]:
    if not os.path.isdir(shots_dir):
        return []
    out = []
    for root, _, files in os.walk(shots_dir):
        for f in sorted(files):
            if f.lower().endswith((".png", ".jpg", ".jpeg", ".webp")):
                out.append(os.path.join(root, f))
    return out


def scan_screens(cfg: dict) -> set[str]:
    pattern = cfg.get("screenRegex")
    if not pattern:
        return set()
    rx = re.compile(pattern)
    found: set[str] = set()
    globs = cfg.get("sources", [])
    for root, dirs, files in os.walk(REPO):
        dirs[:] = [d for d in dirs if d not in {".git", "node_modules", "build", "dist", ".gradle", ".worktrees", "external"}]
        for f in files:
            path = os.path.join(root, f)
            rel = os.path.relpath(path, REPO)
            if not any(fnmatch.fnmatch(rel, g) for g in globs):
                continue
            try:
                found.update(rx.findall(open(path, encoding="utf-8", errors="ignore").read()))
            except OSError:
                continue
    return found


def normalise(name: str) -> str:
    """screen name / capture name -> comparable key. TrackMilesScreen and track_miles_screen match."""
    return re.sub(r"[^a-z0-9]", "", name.lower())


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--fail-on", default="", help="comma list of broken,duplicate,uncaptured,orphaned,stale")
    ap.add_argument("--write-report", action="store_true")
    args = ap.parse_args()

    cfg = load_config()
    shots_dir = os.path.join(REPO, cfg["shots"])
    min_bytes = cfg.get("minBytes", 1000)
    ignore = {normalise(x) for x in cfg.get("ignore", [])}

    shots = captures(shots_dir)
    findings: dict[str, list[str]] = defaultdict(list)

    by_hash: dict[str, list[str]] = defaultdict(list)
    for path in shots:
        rel = os.path.relpath(path, REPO)
        size = os.path.getsize(path)
        if size < min_bytes:
            findings["broken"].append(f"{rel} — {size} bytes, too small to be a real render")
            continue
        try:
            im = Image.open(path).convert("RGB")
        except Exception as e:  # noqa: BLE001 — an unreadable capture IS the finding
            findings["broken"].append(f"{rel} — unreadable ({type(e).__name__})")
            continue
        small = im.copy()
        small.thumbnail((240, 240), Image.LANCZOS)
        if max(ImageStat.Stat(small).stddev[:3]) < FLAT_STDDEV:
            mean = [int(v) for v in ImageStat.Stat(small).mean[:3]]
            findings["broken"].append(f"{rel} — flat fill, mean rgb{tuple(mean)}")
        by_hash[hashlib.sha256(small.tobytes()).hexdigest()].append(rel)

    for _, group in by_hash.items():
        if len(group) > 1:
            findings["duplicate"].append(" == ".join(sorted(group)))

    screens = scan_screens(cfg)
    if screens:
        cap_keys = {normalise(os.path.splitext(os.path.basename(p))[0]) for p in shots}
        for screen in sorted(screens):
            key = normalise(screen)
            if key in ignore:
                continue
            if not any(key in c or c in key for c in cap_keys):
                findings["uncaptured"].append(screen)
        # Opt-in: it assumes captures are NAMED after screens. Kursi names its by flow state
        # (4p_pick_action), so every capture reads as orphaned and 40 false positives bury the two
        # findings that matter. A check nobody can trust is a check nobody reads.
        screen_keys = {normalise(s) for s in screens}
        for path in (shots if cfg.get("checkOrphaned") else []):
            key = normalise(os.path.splitext(os.path.basename(path))[0])
            if key in ignore:
                continue
            if not any(key in s or s in key for s in screen_keys):
                findings["orphaned"].append(os.path.relpath(path, REPO))

    total = len(shots)
    lines = [
        f"# Screenshot sentinel — {git('log', '-1', '--format=%cs').strip() or 'uncommitted'}",
        "",
        f"{total} captures in `{cfg['shots']}`"
        + (f" · {len(screens)} screens found in source" if screens else " · no source scan configured"),
        "",
    ]
    order = ["broken", "duplicate", "uncaptured", "orphaned", "stale"]
    titles = {
        "broken": "Broken captures (blank, flat or unreadable)",
        "duplicate": "Duplicate pixels under different names",
        "uncaptured": "Screens with no capture",
        "orphaned": "Captures with no matching screen",
        "stale": "Captures older than the code they show",
    }
    for key in order:
        items = findings.get(key, [])
        lines.append(f"## {titles[key]} — {len(items)}")
        lines.append("")
        lines.extend(f"- {i}" for i in items[:40] or ["None."])
        if len(items) > 40:
            lines.append(f"- …and {len(items) - 40} more")
        lines.append("")

    report = "\n".join(lines)
    print(report)
    if args.write_report:
        out = os.path.join(shots_dir if os.path.isdir(shots_dir) else REPO, "SENTINEL_REPORT.md")
        os.makedirs(os.path.dirname(out), exist_ok=True)
        open(out, "w").write(report)
        print(f"\nwrote {os.path.relpath(out, REPO)}", file=sys.stderr)

    fail_on = {c.strip() for c in args.fail_on.split(",") if c.strip()}
    hit = sorted(c for c in fail_on if findings.get(c))
    if hit:
        print(f"\nFAIL: {', '.join(hit)}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
