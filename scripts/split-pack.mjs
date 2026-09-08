#!/usr/bin/env node
// Split a Godot web export's index.pck into parts under GitHub's 100 MB
// per-file cap and teach the exported shell to stitch them back into one
// Blob before the engine starts. heavy/ is served from GitHub Pages, which
// refuses any single file over 100 MB, while Stutter's trimmed "Web Demo"
// preset now exports a 177 MB pack. The cap is per file, not per site, so
// the load is spread across parts; the engine sees one pack (mainPack is a
// blob: URL, which its fetch() accepts) and the game itself is untouched.
//
//   node scripts/split-pack.mjs heavy/stutter-app [--part-bytes 90000000]
//
// Idempotent: a bundle that already carries parts and no index.pck is left
// alone. Reversible: `cat index.pck.part-* > index.pck` and re-export the
// shell. ponytail: parts are read fully into memory in the browser (as the
// engine does with a single pack anyway); if a pack ever grows past what a
// tab will hold, switch the shell to a streamed Response instead.
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, unlinkSync, writeFileSync, openSync, readSync, closeSync } from "node:fs";
import { join, basename } from "node:path";

const args = process.argv.slice(2);
const dir = args.find((a) => !a.startsWith("--"));
if (!dir) { console.error("usage: split-pack.mjs <bundle-dir> [--part-bytes N]"); process.exit(2); }
const PART = Number(args[args.indexOf("--part-bytes") + 1] || 0) || 90_000_000;
const pck = join(dir, "index.pck");
const html = join(dir, "index.html");
const existing = readdirSync(dir).filter((f) => /^index\.pck\.part-\d{2}$/.test(f)).sort();

if (!existsSync(pck)) {
  if (existing.length) { console.log(`split-pack: ${dir} already split into ${existing.length} parts, nothing to do.`); process.exit(0); }
  console.error(`split-pack: no index.pck in ${dir}`); process.exit(1);
}
const size = statSync(pck).size;
if (size <= PART && !existing.length) { console.log(`split-pack: index.pck is ${size} B, under ${PART} B, no split needed.`); process.exit(0); }

for (const f of existing) unlinkSync(join(dir, f));
const fd = openSync(pck, "r");
const parts = [];
const buf = Buffer.alloc(PART);
for (let off = 0, i = 0; off < size; off += PART, i++) {
  const n = readSync(fd, buf, 0, Math.min(PART, size - off), off);
  const name = `index.pck.part-${String(i).padStart(2, "0")}`;
  writeFileSync(join(dir, name), buf.subarray(0, n));
  parts.push({ name, bytes: n });
}
closeSync(fd);
unlinkSync(pck);
writeFileSync(join(dir, "index.pck.parts.json"), JSON.stringify({ total: size, parts }, null, 2) + "\n");

// Patch the shell: fetch the parts (with the same progress bar), build one
// Blob, hand its URL to the engine as mainPack.
let shell = readFileSync(html, "utf8");
const startRe = /engine\.startGame\(\{\s*'onProgress': function \(current, total\) \{[\s\S]*?\}\)\.then\(\(\) => \{\s*setStatusMode\('hidden'\);\s*\}, displayFailureNotice\);/;
if (!startRe.test(shell)) { console.error("split-pack: could not find engine.startGame({...}).then(...) in index.html; shell layout changed?"); process.exit(1); }
const loader = `// split-pack.mjs: the pack ships as parts under GitHub's 100 MB per-file
		// cap and is stitched into one Blob here; the engine only ever sees mainPack.
		const PACK_PARTS = ${JSON.stringify(parts.map((p) => p.name))};
		const PACK_TOTAL = ${size};
		const loadPack = async () => {
			const chunks = [];
			let done = 0;
			statusProgress.max = PACK_TOTAL;
			for (const name of PACK_PARTS) {
				const res = await fetch(name);
				if (!res.ok) throw new Error('pack part ' + name + ' failed: HTTP ' + res.status);
				const chunk = await res.arrayBuffer();
				chunks.push(chunk);
				done += chunk.byteLength;
				statusProgress.value = done;
			}
			if (done !== PACK_TOTAL) throw new Error('pack parts total ' + done + ' B, expected ' + PACK_TOTAL);
			return URL.createObjectURL(new Blob(chunks, { type: 'application/octet-stream' }));
		};
		loadPack().then((mainPack) => engine.startGame({
			'mainPack': mainPack,
			'onProgress': function (current, total) {
				if (current > 0 && total > 0) {
					statusProgress.value = current;
					statusProgress.max = total;
				} else {
					statusProgress.removeAttribute('value');
					statusProgress.removeAttribute('max');
				}
			},
		})).then(() => {
			setStatusMode('hidden');
		}, displayFailureNotice);`;
shell = shell.replace(startRe, loader);
// The engine's own progress accounting lists index.pck; it is no longer a file.
shell = shell.replace(/"index\.pck":\d+,?/, "");
writeFileSync(html, shell);
console.log(`split-pack: ${basename(dir)}: ${size} B -> ${parts.length} parts (max ${PART} B), shell patched.`);
