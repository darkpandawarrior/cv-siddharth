#!/usr/bin/env node
// Installs the cv-gate shims: at most 2 `playwright test` / `vite build` run at once across all
// worktrees (12 software-WebGL lanes once reached load 133 on 10 cores). macOS only, applied by
// postinstall. Other subcommands are not gated. Waiting lanes print `cv-gate[name]: all 2 slots
// busy, waiting`; that is normal. Bypass one command: `CV_GATE=off npx playwright test`. Slot count:
// `CV_GATE_SLOTS=3`. Slots are dirs in /private/tmp/cv-gate/<name>/; a dead holder is reclaimed.
// Library code that calls chromium.launch() skips the shim; --chrome wraps the browser binary
// instead (edits the shared ms-playwright cache, so never from postinstall).
// Proof: `npm run test:cv-gate`.
//   node scripts/cv-gate/install.mjs                 shim playwright + vite in node_modules/.bin
//   node scripts/cv-gate/install.mjs --chrome        also wrap chrome-headless-shell (manual only)
//   node scripts/cv-gate/install.mjs --uninstall     restore the chrome wrappers (shims return on npm install)
//   node scripts/cv-gate/install.mjs --self-test     run in a temp dir, touches no real state
// Test hooks: --bin DIR, --cache DIR, --force (skip the Darwin check).
import {
  existsSync, lstatSync, readFileSync, writeFileSync, chmodSync, renameSync, readdirSync,
  realpathSync, mkdtempSync, mkdirSync, rmSync, symlinkSync, unlinkSync,
} from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { homedir, tmpdir, platform } from 'node:os'
import { spawn, spawnSync } from 'node:child_process'

const here = dirname(fileURLToPath(import.meta.url))
const GATE = join(here, 'gate.sh')
const MARK = '# cv-gate-shim'
// command -> the one subcommand that gets gated
const SHIMS = { playwright: 'test', vite: 'build' }
const CHROME_SLOTS = 5

const args = process.argv.slice(2)
const flag = (f) => args.includes(f)
const opt = (f, d) => (args.includes(f) ? args[args.indexOf(f) + 1] : d)

const isShim = (p) => {
  try { return lstatSync(p).isFile() && readFileSync(p, 'utf8').includes(MARK) } catch { return false }
}

function shimBody(name, real) {
  return `#!/bin/sh
${MARK}
# Gates only \`${name} ${SHIMS[name]}\` through gate.sh; every other subcommand passes straight through.
REAL=${JSON.stringify(real)}
if [ "$1" = "${SHIMS[name]}" ]; then
  exec ${JSON.stringify(GATE)} -d ${name} -- node "$REAL" "$@"
fi
exec node "$REAL" "$@"
`
}

export function installShims(bin) {
  const out = []
  for (const name of Object.keys(SHIMS)) {
    const p = join(bin, name)
    if (!existsSync(p)) { out.push(`${name}: not in .bin, skipped`); continue }
    // Never shim a shim: if it is one already, read the real target back out of it.
    let real
    if (isShim(p)) {
      real = JSON.parse(readFileSync(p, 'utf8').match(/^REAL=(".*")$/m)[1])
    } else {
      real = realpathSync(p)
    }
    const body = shimBody(name, real)
    if (isShim(p) && readFileSync(p, 'utf8') === body) { out.push(`${name}: up to date`); continue }
    if (lstatSync(p).isSymbolicLink()) unlinkSync(p) // do not write through the symlink
    writeFileSync(p, body)
    chmodSync(p, 0o755)
    out.push(`${name}: shimmed -> ${real}`)
  }
  return out
}

function chromeBinaries(cache) {
  if (!existsSync(cache)) return []
  return readdirSync(cache)
    .filter((d) => d.startsWith('chromium_headless_shell-'))
    .flatMap((d) => {
      const root = join(cache, d)
      return readdirSync(root)
        .map((arch) => join(root, arch, 'chrome-headless-shell'))
        .filter((p) => existsSync(p) || existsSync(`${p}.real`))
    })
}

export function wrapChrome(cache, undo = false) {
  const out = []
  for (const p of chromeBinaries(cache)) {
    const real = `${p}.real`
    const wrapped = existsSync(real) && isShim(p)
    if (undo) {
      if (wrapped) { renameSync(real, p); out.push(`restored ${p}`) }
      continue
    }
    if (wrapped) { out.push(`already wrapped ${p}`); continue }
    if (existsSync(real)) { out.push(`SKIP ${p}: .real exists but wrapper is not ours`); continue }
    renameSync(p, real)
    writeFileSync(p, `#!/bin/bash\n${MARK}\nexec ${JSON.stringify(GATE)} -n ${CHROME_SLOTS} -d chrome -- ${JSON.stringify(real)} "$@"\n`)
    chmodSync(p, 0o755)
    out.push(`wrapped ${p}`)
  }
  return out
}

// ---------------------------------------------------------------- self-test
const sh = (cmd, env = {}) => spawnSync('bash', ['-c', cmd], { encoding: 'utf8', env: { ...process.env, ...env } })

async function selfTest() {
  let fails = 0
  const ok = (cond, msg) => { console.log(`${cond ? 'PASS' : 'FAIL'}  ${msg}`); if (!cond) fails++ }
  const tmp = mkdtempSync(join(tmpdir(), 'cv-gate-test-'))
  try {
    const slotRoot = join(tmp, 'slots')
    const gateEnv = { CV_GATE_DIR: slotRoot, CV_GATE_POLL: '0.1', CV_GATE: '' }
    const holder = (ms, mark) =>
      spawn(GATE, ['-n', '2', '-d', 't', '--', 'bash', '-c', `echo ${mark} >> ${tmp}/log; sleep ${ms}`], {
        env: { ...process.env, ...gateEnv }, stdio: 'ignore',
      })
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
    const slotCount = () => { try { return readdirSync(join(slotRoot, 't')).length } catch { return 0 } }

    // 1. third concurrent holder waits while two hold slots
    const a = holder(1.5, 'a'), b = holder(1.5, 'b')
    await sleep(500)
    const c = holder(0.1, 'c')
    await sleep(500)
    const log1 = existsSync(join(tmp, 'log')) ? readFileSync(join(tmp, 'log'), 'utf8') : ''
    ok(slotCount() === 2 && !log1.includes('c'), '3rd holder waits while 2 hold slots')
    await new Promise((r) => c.on('exit', r))
    const log2 = readFileSync(join(tmp, 'log'), 'utf8')
    ok(log2.includes('c'), '3rd holder runs once a slot frees')
    await Promise.all([a, b].map((p) => new Promise((r) => (p.exitCode !== null ? r() : p.on('exit', r)))))
    ok(slotCount() === 0, 'slots released after exit')

    // 2. dead pid reclaimed (two dead slots, would deadlock if not reclaimed)
    for (const n of [1, 2]) { mkdirSync(join(slotRoot, 't', `slot.${n}`), { recursive: true }); writeFileSync(join(slotRoot, 't', `slot.${n}`, 'pid'), '999999\n') }
    const r = sh(`${GATE} -n 2 -d t -- echo reclaimed`, gateEnv)
    ok(r.stdout.trim() === 'reclaimed' && r.status === 0, 'dead pid slots are reclaimed')

    // 3. exit status propagates, CV_GATE=off bypasses
    ok(sh(`${GATE} -d t -- bash -c 'exit 7'`, gateEnv).status === 7, 'child exit status propagates')
    mkdirSync(join(slotRoot, 'off', 'slot.1'), { recursive: true }); writeFileSync(join(slotRoot, 'off', 'slot.1', 'pid'), `${process.pid}\n`)
    mkdirSync(join(slotRoot, 'off', 'slot.2'), { recursive: true }); writeFileSync(join(slotRoot, 'off', 'slot.2', 'pid'), `${process.pid}\n`)
    ok(sh(`${GATE} -d off -- echo bypass`, { ...gateEnv, CV_GATE: 'off' }).stdout.trim() === 'bypass', 'CV_GATE=off bypasses a full gate')

    // 4. shims: passthrough is not gated, gated subcommand is
    const bin = join(tmp, 'node_modules', '.bin'), pkg = join(tmp, 'pkgs')
    mkdirSync(bin, { recursive: true }); mkdirSync(pkg)
    for (const n of Object.keys(SHIMS)) {
      writeFileSync(join(pkg, `${n}.js`), `console.log('${n}:' + process.argv.slice(2).join(' '))\n`)
      symlinkSync(join(pkg, `${n}.js`), join(bin, n))
    }
    const fullEnv = { ...gateEnv, CV_GATE_DIR: join(tmp, 'full') }
    for (const n of Object.keys(SHIMS)) for (const i of [1, 2]) {
      mkdirSync(join(tmp, 'full', n, `slot.${i}`), { recursive: true }); writeFileSync(join(tmp, 'full', n, `slot.${i}`, 'pid'), `${process.pid}\n`)
    }
    const inst1 = installShims(bin), before = readFileSync(join(bin, 'vite'), 'utf8')
    const inst2 = installShims(bin)
    ok(inst1.every((l) => l.includes('shimmed')) && inst2.every((l) => l.includes('up to date')) && before === readFileSync(join(bin, 'vite'), 'utf8'), 'install is idempotent and never shims a shim')
    ok(JSON.parse(before.match(/^REAL=(".*")$/m)[1]) === realpathSync(join(pkg, 'vite.js')), 'shim points at the real target')
    const pass = spawnSync(join(bin, 'playwright'), ['--version'], { encoding: 'utf8', env: { ...process.env, ...fullEnv }, timeout: 5000 })
    ok(pass.stdout.trim() === 'playwright:--version', 'non-test subcommand passes straight through (full gate does not block it)')
    const gated = spawnSync(join(bin, 'vite'), ['build'], { encoding: 'utf8', env: { ...process.env, ...fullEnv }, timeout: 1500 })
    ok(gated.error?.code === 'ETIMEDOUT', 'vite build waits on a full gate')
    const free = spawnSync(join(bin, 'vite'), ['build'], { encoding: 'utf8', env: { ...process.env, ...gateEnv, CV_GATE_DIR: join(tmp, 'free') }, timeout: 5000 })
    ok(free.stdout.trim() === 'vite:build', 'vite build runs when a slot is free')

    // 5. chrome wrap / uninstall on a fake cache
    const cache = join(tmp, 'ms-playwright'), cdir = join(cache, 'chromium_headless_shell-9999', 'chrome-headless-shell-mac-arm64')
    mkdirSync(cdir, { recursive: true }); writeFileSync(join(cdir, 'chrome-headless-shell'), '#!/bin/sh\necho chrome-ran "$@"\n'); chmodSync(join(cdir, 'chrome-headless-shell'), 0o755)
    wrapChrome(cache); const w2 = wrapChrome(cache)
    ok(existsSync(join(cdir, 'chrome-headless-shell.real')) && w2[0].startsWith('already'), 'chrome wrap is idempotent, keeps .real')
    ok(sh(`${join(cdir, 'chrome-headless-shell')} --x`, gateEnv).stdout.trim() === 'chrome-ran --x', 'wrapped chrome still runs the real binary')
    wrapChrome(cache, true)
    ok(!existsSync(join(cdir, 'chrome-headless-shell.real')) && readFileSync(join(cdir, 'chrome-headless-shell'), 'utf8').includes('chrome-ran'), '--uninstall restores the original')
  } finally {
    rmSync(tmp, { recursive: true, force: true })
  }
  console.log(fails ? `\n${fails} FAILED` : '\nall self-tests passed')
  process.exit(fails ? 1 : 0)
}

// --------------------------------------------------------------------- main
if (resolve(process.argv[1] ?? '') === fileURLToPath(import.meta.url)) {
  if (flag('--self-test')) await selfTest()
  else if (platform() !== 'darwin' && !flag('--force')) process.exit(0)
  else {
    const bin = resolve(opt('--bin', join(process.cwd(), 'node_modules', '.bin')))
    const cache = resolve(opt('--cache', join(homedir(), 'Library', 'Caches', 'ms-playwright')))
    if (flag('--uninstall')) {
      for (const l of wrapChrome(cache, true)) console.log(`cv-gate: ${l}`)
    } else {
      if (existsSync(bin)) for (const l of installShims(bin)) console.log(`cv-gate: ${l}`)
      if (flag('--chrome')) for (const l of wrapChrome(cache)) console.log(`cv-gate: ${l}`)
    }
  }
}
