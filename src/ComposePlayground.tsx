import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { ArrowLeft, Play, RotateCcw, Smartphone, Wand2 } from "lucide-react";
import { openChat } from "./FloatingChat.tsx";
import { parseCompose, type Expr, type Modifier, type Node, type Program } from "./composeInterpreter.ts";
import { projects } from "./data/profile.ts";

/**
 * The Compose Playground — write a slice of Jetpack Compose, watch it render
 * live in a phone frame, tap the buttons and see state recompose. It's a
 * simulation (see composeInterpreter.ts): real Kotlin can't compile in a
 * browser, so a hand-written interpreter renders a curated subset as an
 * Android-style surface. State is genuine — the counter counts.
 *
 * Lazy-loaded at #compose so its parser never ships in the main bundle.
 */

/* ── colour + unit resolution ────────────────────────────────────────── */

const NAMED_COLORS: Record<string, string> = {
  "Color.Green": "#3ddc84",
  "Color.Red": "#ff5c5c",
  "Color.Blue": "#5ee6ff",
  "Color.Cyan": "#5ee6ff",
  "Color.Magenta": "#db61ff",
  "Color.Yellow": "#ffd15c",
  "Color.White": "#ffffff",
  "Color.Black": "#05070a",
  "Color.Gray": "#8b96a0",
  "Color.DarkGray": "#3a444d",
  "Color.LightGray": "#c3ccd4",
  "Color.Transparent": "transparent",
};

function hexFromArgb(raw: string): string {
  const h = raw.replace(/^0x/i, "");
  if (h.length === 8) {
    const a = parseInt(h.slice(0, 2), 16) / 255;
    const r = parseInt(h.slice(2, 4), 16);
    const g = parseInt(h.slice(4, 6), 16);
    const b = parseInt(h.slice(6, 8), 16);
    return `rgba(${r},${g},${b},${a.toFixed(3)})`;
  }
  if (h.length === 6) return `#${h}`;
  return "#3ddc84";
}

/**
 * Design-system tokens imported straight from the real app themes in
 * profile.ts — so the playground speaks the same colour language as the
 * shipped apps. Type `Kursi.accent`, `Mileway.surface`, `PaymentsLab.card`…
 * and it resolves to the exact hex those apps use.
 */
const DS_COLORS: Record<string, string> = {};
for (const p of projects) {
  const t = p.theme;
  if (!t) continue;
  DS_COLORS[`${p.name}.accent`] = t.accent;
  DS_COLORS[`${p.name}.accentDim`] = t.accentDim;
  if (t.ink) DS_COLORS[`${p.name}.ink`] = t.ink;
  if (t.surface) DS_COLORS[`${p.name}.surface`] = t.surface;
  if (t.card) DS_COLORS[`${p.name}.card`] = t.card;
  if (t.line) DS_COLORS[`${p.name}.line`] = t.line;
}
/** Project names that contributed a theme — surfaced in the UI hint. */
const DS_APPS = projects.filter((p) => p.theme).map((p) => p.name);

function resolveColor(expr: Expr | undefined, fallback: string): string {
  if (!expr) return fallback;
  if (expr.t === "member") {
    if (expr.path.startsWith("ColorHex:")) return hexFromArgb(expr.path.slice("ColorHex:".length));
    if (DS_COLORS[expr.path]) return DS_COLORS[expr.path];
    if (NAMED_COLORS[expr.path]) return NAMED_COLORS[expr.path];
    if (expr.path.includes("primary")) return "#3ddc84";
    if (expr.path.includes("secondary")) return "#5ee6ff";
    if (expr.path.includes("error")) return "#ff5c5c";
  }
  return fallback;
}

/** Web haptics — a short buzz on tap where the platform supports it (Android
 *  Chrome, mostly). A nod to the real thing: Compose buttons fire haptic
 *  feedback, so the simulated ones do too. No-op on desktop/iOS Safari and
 *  when reduced motion is requested. */
function hapticTap() {
  if (typeof navigator === "undefined" || typeof navigator.vibrate !== "function") return;
  if (typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  navigator.vibrate(10);
}

const px = (expr: Expr | undefined, fallback = 0, state?: StateMap): number => {
  if (!expr || expr.t !== "num") return fallback;
  if (expr.ref && state) { const v = state[expr.ref]; return typeof v === "number" ? v : fallback; }
  return expr.value;
};

/* ── state-aware value resolution ────────────────────────────────────── */

type StateMap = Record<string, number | boolean | string>;

function resolveText(expr: Expr | undefined, state: StateMap): string {
  if (!expr) return "";
  if (expr.t === "str") return expr.parts.map((p) => (typeof p === "string" ? p : String(state[p.ref] ?? ""))).join("");
  if (expr.t === "num") return String(expr.value);
  if (expr.t === "bool") return String(expr.value);
  if (expr.t === "ident") return String(state[expr.name] ?? expr.name);
  return "";
}

function resolveBool(expr: Expr | undefined, state: StateMap): boolean {
  if (!expr) return true;
  if (expr.t === "bool") return expr.value;
  if (expr.t === "num") return expr.value !== 0;
  if (expr.t === "ident") return !!state[expr.name];
  if (expr.t === "str") return resolveText(expr, state) === "true";
  return true;
}

// State-driven changes (a toggled colour, a recomposed weight) glide instead of
// snapping — the spirit of Compose's animate*AsState, done with CSS. Disabled
// for anyone who asked for reduced motion.
const MOTION_OK = typeof window === "undefined" || !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const TRANSITION = MOTION_OK
  ? "background-color 0.35s ease, background 0.35s ease, color 0.3s ease, transform 0.35s cubic-bezier(0.2,0.7,0.2,1), opacity 0.3s ease, width 0.35s ease, height 0.35s ease, flex-grow 0.35s ease, border-radius 0.35s ease"
  : undefined;

/* ── modifier → CSS ──────────────────────────────────────────────────── */

function modifierStyle(mods: Modifier[], state?: StateMap): CSSProperties {
  const s: CSSProperties = {};
  for (const m of mods) {
    const a = m.args;
    switch (m.name) {
      case "padding":
        if (a.length >= 2) s.padding = `${px(a[1], 0, state)}px ${px(a[0], 0, state)}px`;
        else s.padding = `${px(a[0], 0, state)}px`;
        break;
      case "fillMaxWidth": s.width = "100%"; break;
      case "fillMaxHeight": s.height = "100%"; break;
      case "fillMaxSize": s.width = "100%"; s.height = "100%"; break;
      case "size": s.width = `${px(a[0], 0, state)}px`; s.height = `${px(a[0], 0, state)}px`; break;
      case "width": s.width = `${px(a[0], 0, state)}px`; break;
      case "height": s.height = `${px(a[0], 0, state)}px`; break;
      case "background":
        s.background = resolveColor(a[0], "#171e1a");
        break;
      case "clip":
        s.borderRadius = a[0]?.t === "member" && a[0].path.includes("Circle") ? 9999 : a[0]?.t === "num" ? px(a[0], 16, state) : 16;
        s.overflow = "hidden";
        break;
      case "border":
        s.border = `${a[0] && a[0].t === "num" ? px(a[0], 1, state) : 1}px solid ${resolveColor(a.find((x) => x.t === "member"), "#243029")}`;
        break;
      case "weight": s.flex = a[0] && a[0].t === "num" ? a[0].value : 1; break;
      case "alpha": if (a[0] && a[0].t === "num") s.opacity = a[0].value; break;
      default: break; // unknown modifier — silently ignored, by design
    }
  }
  return s;
}

/** Column/Row alignment + arrangement from named args → flex CSS. */
function arrangementStyle(name: string, named: Record<string, Expr>): CSSProperties {
  const s: CSSProperties = {};
  const val = (k: string) => (named[k]?.t === "member" ? (named[k] as { path: string }).path : "");
  const hAlign = val("horizontalAlignment");
  const vAlign = val("verticalAlignment");
  const vArr = val("verticalArrangement");
  const hArr = val("horizontalArrangement");
  const mapAlign = (v: string): CSSProperties["alignItems"] =>
    v.endsWith("End") || v.endsWith("Bottom") ? "flex-end" : v.includes("Center") ? "center" : "flex-start";
  const mapArrange = (v: string): CSSProperties["justifyContent"] =>
    v.endsWith("SpaceBetween") ? "space-between" : v.endsWith("SpaceAround") ? "space-around" : v.endsWith("SpaceEvenly") ? "space-evenly" : v.endsWith("End") || v.endsWith("Bottom") ? "flex-end" : v.includes("Center") ? "center" : "flex-start";
  if (name === "Column") {
    if (hAlign) s.alignItems = mapAlign(hAlign);
    if (vArr) s.justifyContent = mapArrange(vArr);
    if (vArr.includes("spacedBy")) s.gap = 8;
  } else if (name === "Row") {
    s.alignItems = vAlign ? mapAlign(vAlign) : "center";
    if (hArr) s.justifyContent = mapArrange(hArr);
    if (hArr.includes("spacedBy")) s.gap = 8;
  }
  return s;
}

/* ── AST → Android-styled React ──────────────────────────────────────── */

function renderNode(node: Node, state: StateMap, dispatch: (n: Node) => void, key: number): ReactNode {
  switch (node.kind) {
    case "container": {
      const base: CSSProperties = { display: "flex", boxSizing: "border-box", transition: TRANSITION };
      if (node.name === "Row") base.flexDirection = "row";
      else base.flexDirection = "column";
      if (node.name === "Box") { base.display = "grid"; base.placeItems = "start"; }
      if (node.name === "Card") {
        base.background = "#171e1a";
        base.borderRadius = 16;
        base.boxShadow = "0 8px 24px -12px rgba(0,0,0,0.7)";
        base.border = "1px solid #243029";
        base.overflow = "hidden";
      }
      const style = { ...base, ...arrangementStyle(node.name, node.named), ...modifierStyle(node.modifiers, state) };
      const kids = node.children.map((c, i) => renderNode(c, state, dispatch, i));
      if (node.name === "Box") {
        return (
          <div key={key} style={style}>
            {node.children.map((c, i) => (
              <div key={i} style={{ gridArea: "1 / 1" }}>{renderNode(c, state, dispatch, i)}</div>
            ))}
          </div>
        );
      }
      return <div key={key} style={style}>{kids}</div>;
    }
    case "text": {
      const style: CSSProperties = {
        color: resolveColor(node.named.color, "#e8efe9"),
        fontSize: px(node.named.fontSize, 16),
        fontWeight: node.named.fontWeight?.t === "member" && /Bold|Black|SemiBold|Medium/.test((node.named.fontWeight as { path: string }).path)
          ? (node.named.fontWeight as { path: string }).path.includes("Medium") ? 500 : 700
          : 400,
        lineHeight: 1.35,
        fontFamily: "var(--font-body)",
        transition: TRANSITION,
        ...modifierStyle(node.modifiers, state),
      };
      const align = node.named.textAlign?.t === "member" ? (node.named.textAlign as { path: string }).path : "";
      if (align.includes("Center")) style.textAlign = "center";
      else if (align.includes("End")) style.textAlign = "right";
      return <span key={key} style={style}>{resolveText(node.value, state)}</span>;
    }
    case "button": {
      const bg = node.modifiers.find((m) => m.name === "background");
      const style: CSSProperties = {
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 6,
        padding: "10px 20px",
        borderRadius: 999,
        border: "none",
        cursor: "pointer",
        background: bg ? resolveColor(bg.args[0], "#3ddc84") : "#3ddc84",
        color: "#05221a",
        fontWeight: 700,
        fontSize: 14,
        fontFamily: "var(--font-body)",
        transition: TRANSITION,
        ...modifierStyle(node.modifiers.filter((m) => m.name !== "background"), state),
      };
      const label = node.children.length
        ? node.children.map((c, i) => (
            <span key={i} style={{ color: "#05221a", fontWeight: 700 }}>{c.kind === "text" ? resolveText(c.value, state) : ""}</span>
          ))
        : "Button";
      const labelText = node.children.map((c) => (c.kind === "text" ? resolveText(c.value, state) : "")).join(" ").trim();
      return (
        <button
          key={key}
          style={style}
          onClick={() => { hapticTap(); dispatch(node); }}
          aria-label={labelText || "Button"}
        >
          {label}
        </button>
      );
    }
    case "spacer": {
      const s = modifierStyle(node.modifiers);
      return <div key={key} style={{ width: s.width ?? 0, height: s.height ?? 0, flexShrink: 0 }} />;
    }
    case "animated": {
      const visible = resolveBool(node.visible, state);
      // enter/exit like Compose's fadeIn()+expandVertically(): collapse height
      // and fade, so toggling `visible` slides content in and out.
      const style: CSSProperties = {
        display: "grid",
        gridTemplateRows: visible ? "1fr" : "0fr",
        opacity: visible ? 1 : 0,
        transform: visible ? "translateY(0)" : "translateY(-6px)",
        transition: MOTION_OK ? "grid-template-rows 0.4s cubic-bezier(0.2,0.7,0.2,1), opacity 0.3s ease, transform 0.35s ease" : undefined,
      };
      return (
        <div key={key} style={style}>
          <div style={{ overflow: "hidden", minHeight: 0 }}>
            {node.children.map((c, i) => renderNode(c, state, dispatch, i))}
          </div>
        </div>
      );
    }
    case "unknown":
      return (
        <div key={key} style={{ padding: "6px 10px", borderRadius: 8, border: "1px dashed #ff5c5c66", color: "#ff8f8f", fontFamily: "var(--font-mono)", fontSize: 11 }}>
          {node.name} — not supported yet
        </div>
      );
  }
}

/* ── presets ─────────────────────────────────────────────────────────── */

const PRESETS: { label: string; code: string }[] = [
  {
    label: "Counter",
    code: `var count by remember { mutableStateOf(0) }

Column(
    modifier = Modifier.fillMaxSize().padding(24.dp),
    verticalArrangement = Arrangement.Center,
    horizontalAlignment = Alignment.CenterHorizontally
) {
    Text("you tapped", color = Color.Gray, fontSize = 13.sp)
    Text(
        "$count",
        color = Color.Green,
        fontSize = 72.sp,
        fontWeight = FontWeight.Bold
    )
    Text("times", color = Color.Gray, fontSize = 13.sp)
    Spacer(Modifier.height(28.dp))
    Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
        Button(onClick = { count-- }) { Text("remove") }
        Button(onClick = { count++ }) { Text("add one") }
    }
}`,
  },
  {
    label: "Profile card",
    code: `Column(modifier = Modifier.fillMaxSize().padding(20.dp)) {
    Card(modifier = Modifier.fillMaxWidth().padding(4.dp)) {
        Column(modifier = Modifier.padding(20.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Box(
                    modifier = Modifier.size(52.dp)
                        .clip(CircleShape)
                        .background(Color.Green)
                )
                Spacer(Modifier.width(14.dp))
                Column {
                    Text("Siddharth", fontSize = 18.sp, fontWeight = FontWeight.Bold)
                    Text("Senior Android Engineer", color = Color.Gray, fontSize = 13.sp)
                }
            }
            Spacer(Modifier.height(16.dp))
            Text(
                "Takes Android apps from prototype to platform.",
                color = Color.LightGray,
                fontSize = 14.sp
            )
            Spacer(Modifier.height(16.dp))
            Button(
                onClick = { },
                modifier = Modifier.fillMaxWidth()
            ) { Text("Follow") }
        }
    }
}`,
  },
  {
    label: "Toggle",
    code: `var on by remember { mutableStateOf(false) }

Column(
    modifier = Modifier.fillMaxSize().padding(24.dp),
    verticalArrangement = Arrangement.Center,
    horizontalAlignment = Alignment.CenterHorizontally
) {
    Box(
        modifier = Modifier.size(120.dp)
            .clip(RoundedCornerShape(24.dp))
            .background(Color(0xFF3DDC84))
    )
    Spacer(Modifier.height(24.dp))
    Text("state is \${on}", color = Color.Green, fontSize = 20.sp, fontWeight = FontWeight.Bold)
    Spacer(Modifier.height(16.dp))
    Button(onClick = { on = !on }) { Text("toggle") }
}`,
  },
  {
    label: "Kursi role",
    code: `// theme tokens imported from the real Kursi app
Column(
    modifier = Modifier.fillMaxSize().background(Kursi.ink).padding(18.dp),
    verticalArrangement = Arrangement.Center
) {
    Card(modifier = Modifier.fillMaxWidth().background(Kursi.card)) {
        Column(modifier = Modifier.padding(20.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Box(
                    modifier = Modifier.size(46.dp)
                        .clip(CircleShape)
                        .background(Color(0xFF0072B2))
                )
                Spacer(Modifier.width(12.dp))
                Column {
                    Text("Netaji Vachan", color = Kursi.accent, fontSize = 18.sp, fontWeight = FontWeight.Bold)
                    Text("The Politician", color = Color.LightGray, fontSize = 12.sp)
                }
            }
            Spacer(Modifier.height(16.dp))
            Text("Tax +3  ·  GHOTALA", color = Color.White, fontSize = 15.sp, fontWeight = FontWeight.Medium)
            Text("blocks Foreign Aid", color = Color.Gray, fontSize = 12.sp)
        }
    }
}`,
  },
  {
    label: "Mileway",
    code: `// theme tokens imported from the real Mileway app
Column(
    modifier = Modifier.fillMaxSize().background(Mileway.ink).padding(20.dp),
    verticalArrangement = Arrangement.Center,
    horizontalAlignment = Alignment.CenterHorizontally
) {
    Text("Mileway", color = Mileway.accent, fontSize = 28.sp, fontWeight = FontWeight.Bold)
    Text("one Kotlin codebase", color = Color.Gray, fontSize = 13.sp)
    Spacer(Modifier.height(20.dp))
    Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
        Card(modifier = Modifier.background(Mileway.card)) {
            Column(modifier = Modifier.padding(18.dp)) {
                Text("5", color = Mileway.accent, fontSize = 30.sp, fontWeight = FontWeight.Bold)
                Text("platforms", color = Color.Gray, fontSize = 11.sp)
            }
        }
        Card(modifier = Modifier.background(Mileway.card)) {
            Column(modifier = Modifier.padding(18.dp)) {
                Text("35", color = Mileway.accent, fontSize = 30.sp, fontWeight = FontWeight.Bold)
                Text("modules", color = Color.Gray, fontSize = 11.sp)
            }
        }
    }
}`,
  },
  {
    label: "Animation",
    code: `var size by remember { mutableStateOf(84) }
var shown by remember { mutableStateOf(true) }

Column(
    modifier = Modifier.fillMaxSize().padding(20.dp),
    verticalArrangement = Arrangement.Center,
    horizontalAlignment = Alignment.CenterHorizontally
) {
    // size is state — the box animates between values on tap
    Box(
        modifier = Modifier.size(size.dp)
            .clip(RoundedCornerShape(20.dp))
            .background(Color.Green)
    )
    Spacer(Modifier.height(22.dp))
    Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
        Button(onClick = { size = 56 }) { Text("small") }
        Button(onClick = { size = 150 }) { Text("big") }
        Button(onClick = { shown = !shown }) { Text("reveal") }
    }
    Spacer(Modifier.height(22.dp))
    // AnimatedVisibility slides its content in and out
    AnimatedVisibility(visible = shown) {
        Card(modifier = Modifier.fillMaxWidth().background(Color(0xFF171E1A))) {
            Text(
                "now you see me",
                modifier = Modifier.padding(18.dp),
                color = Color.Green,
                fontWeight = FontWeight.Bold
            )
        }
    }
}`,
  },
  {
    label: "Layout",
    code: `Column(modifier = Modifier.fillMaxSize().padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
    Text("Rows & weights", fontSize = 18.sp, fontWeight = FontWeight.Bold)
    Row(modifier = Modifier.fillMaxWidth().height(56.dp)) {
        Box(modifier = Modifier.weight(1.dp).fillMaxHeight().background(Color.Green))
        Box(modifier = Modifier.weight(2.dp).fillMaxHeight().background(Color.Blue))
        Box(modifier = Modifier.weight(1.dp).fillMaxHeight().background(Color.Magenta))
    }
    Text("Cards stack", fontSize = 18.sp, fontWeight = FontWeight.Bold)
    Card(modifier = Modifier.fillMaxWidth()) {
        Text("A Material card", modifier = Modifier.padding(16.dp), color = Color.LightGray)
    }
}`,
  },
];

/* ── AI scenario generation ──────────────────────────────────────────── */

// Same endpoint the chat widget uses; the server always applies its own CV
// system prompt and only accepts user/assistant roles, so the grammar has to
// ride inside the user message.
const CHAT_API_URL: string = import.meta.env.VITE_CHAT_API_URL || "/api/chat";

const GEN_RULES = `You are a code generator for an in-browser Jetpack Compose playground with a LIMITED interpreter. Output ONLY Kotlin Compose code inside one \`\`\`kotlin fence. No prose, no imports, no @Composable function wrapper.
Use ONLY this subset:
- Layout: Column(...) { }, Row(...) { }, Box(...) { }, Card(...) { }
- Text("literal or \$stateVar", color = Color.X, fontSize = N.sp, fontWeight = FontWeight.Bold)
- Button(onClick = { STATE_MUTATION }) { Text("...") }
- Spacer(Modifier.height(N.dp)) or Spacer(Modifier.width(N.dp))
- AnimatedVisibility(visible = boolState) { ... }
- Modifier chain: .padding(N.dp).fillMaxWidth().fillMaxSize().size(N.dp).height(N.dp).width(N.dp).background(COLOR).clip(RoundedCornerShape(N.dp)) or .clip(CircleShape).weight(N.dp)
- State: var name by remember { mutableStateOf(0) } (or false, or "text"); mutate in onClick as name++, name--, name += 2, name = !name; a size can be state: Modifier.size(name.dp)
- COLOR is Color.Green/Red/Blue/Cyan/Magenta/Yellow/White/Black/Gray/LightGray/DarkGray or Color(0xFFRRGGBB)
- Arrangement.Center / Arrangement.SpaceBetween / Arrangement.spacedBy(N.dp); Alignment.CenterHorizontally / Alignment.CenterVertically
Keep it under ~40 lines and make it visually appealing on a dark surface. Screen to build: `;

/** Pull the Kotlin out of a fenced (or bare) model reply. Forgiving — the
 *  interpreter tolerates the rest, so worst case it renders a placeholder. */
function extractCode(text: string): string {
  const fence = text.match(/```(?:kotlin|kt)?\s*([\s\S]*?)```/i);
  return (fence ? fence[1] : text).trim();
}

/** Stream the chat endpoint and return the full concatenated text. */
async function streamChat(userContent: string, onDelta?: (full: string) => void): Promise<string> {
  const res = await fetch(CHAT_API_URL, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ messages: [{ role: "user", content: userContent }] }),
  });
  if (!res.ok || !res.body) {
    const body = await res.json().catch(() => null);
    throw new Error(body?.error ?? `AI backend unavailable (${res.status})`);
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let full = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      if (!line.startsWith("data: ") || line.includes("[DONE]")) continue;
      try {
        const event = JSON.parse(line.slice(6));
        if (typeof event.text === "string") { full += event.text; onDelta?.(full); }
      } catch {
        /* ignore keepalives */
      }
    }
  }
  return full;
}

const AI_IDEAS = ["a login screen", "a pricing card", "a like button with a counter", "a settings toggle row"];

/* ── reactive state plumbing ─────────────────────────────────────────── */

function initialState(program: Program): StateMap {
  const s: StateMap = {};
  for (const d of program.state) s[d.name] = d.init;
  return s;
}

/** A stable signature of the state declarations — used to reset live state
 *  only when the vars themselves change, so editing UI keeps the counter. */
function stateSignature(program: Program): string {
  return program.state.map((d) => `${d.name}:${typeof d.init}:${d.init}`).join("|");
}

function applyActions(node: Node, state: StateMap): StateMap {
  if (node.kind !== "button") return state;
  const next = { ...state };
  for (const act of node.onClick) {
    const cur = next[act.name];
    switch (act.op) {
      case "inc": next[act.name] = (typeof cur === "number" ? cur : 0) + 1; break;
      case "dec": next[act.name] = (typeof cur === "number" ? cur : 0) - 1; break;
      case "addAssign": next[act.name] = (typeof cur === "number" ? cur : 0) + act.value; break;
      case "subAssign": next[act.name] = (typeof cur === "number" ? cur : 0) - act.value; break;
      case "toggle": next[act.name] = !cur; break;
      case "set":
        next[act.name] = act.value.t === "num" ? act.value.value : act.value.t === "bool" ? act.value.value : resolveText(act.value, next);
        break;
    }
  }
  return next;
}

/* ── component ───────────────────────────────────────────────────────── */

const SUPPORTED = `Column · Row · Box · Card · Text · Button · Spacer · AnimatedVisibility · Modifier(padding, size, fillMax…, background, clip, weight) · remember { mutableStateOf() } · state-driven size.dp · onClick + haptics · imported themes: ${DS_APPS.map((n) => `${n}.accent`).join(", ")}`;

export default function ComposePlayground() {
  const [code, setCode] = useState(PRESETS[0].code);
  const [live, setLive] = useState(code);
  const gutterRef = useRef<HTMLDivElement>(null);
  const [aiPrompt, setAiPrompt] = useState("");
  const [aiBusy, setAiBusy] = useState(false);
  const [aiNote, setAiNote] = useState<string | null>(null);

  const generate = async (scenario: string) => {
    const s = scenario.trim();
    if (!s || aiBusy) return;
    setAiBusy(true);
    setAiNote(null);
    try {
      const full = await streamChat(GEN_RULES + s, (partial) => {
        // Live-type the code as it streams once a fence opens, so the preview
        // materialises in real time.
        const gen = extractCode(partial);
        if (gen) setCode(gen);
      });
      const finalCode = extractCode(full);
      if (finalCode) setCode(finalCode);
      else setAiNote("The model didn't return usable code — try rephrasing.");
    } catch (e) {
      setAiNote(e instanceof Error ? e.message : "AI generation failed. You can still edit by hand.");
    } finally {
      setAiBusy(false);
    }
  };

  // Debounce parsing so every keystroke doesn't reparse mid-word.
  useEffect(() => {
    const id = setTimeout(() => setLive(code), 220);
    return () => clearTimeout(id);
  }, [code]);

  const { program, error } = useMemo(() => {
    try {
      return { program: parseCompose(live), error: null as string | null };
    } catch (e) {
      return { program: null as Program | null, error: e instanceof Error ? e.message : String(e) };
    }
  }, [live]);

  const [state, setState] = useState<StateMap>(() => (program ? initialState(program) : {}));
  const sig = program ? stateSignature(program) : "";
  const lastSig = useRef(sig);
  useEffect(() => {
    if (program && sig !== lastSig.current) {
      lastSig.current = sig;
      setState(initialState(program));
    }
  }, [sig, program]);

  const dispatch = (node: Node) => setState((s) => applyActions(node, s));

  const lineCount = code.split("\n").length;

  return (
    <div className="flex h-screen flex-col bg-void">
      <header className="z-10 border-b border-line bg-ink/90 backdrop-blur">
        <nav className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <a href="#top" className="flex items-center gap-2 text-sm text-zinc-400 transition hover:text-accent">
            <ArrowLeft size={16} /> <span className="hidden sm:inline">Back to portfolio</span>
          </a>
          <span className="hidden items-center gap-2 font-mono text-xs uppercase tracking-widest text-zinc-500 lg:flex">
            <Smartphone size={13} className="text-accent" /> The Compose Playground — write it, watch it recompose
          </span>
          <div className="flex items-center gap-2 sm:gap-3">
            <button
              onClick={() => openChat("Explain how the Compose Playground on this site works, and what Compose subset it supports.")}
              className="hidden items-center gap-1.5 rounded-full border border-accent2/40 px-3 py-1.5 text-sm font-semibold text-accent2 transition hover:border-accent2 hover:bg-accent2/10 sm:flex"
            >
              <Wand2 size={13} /> How it works
            </button>
            <button
              onClick={() => openChat()}
              className="rounded-full bg-accent px-3 py-1.5 text-sm font-semibold text-ink transition hover:bg-accent-dim sm:px-4"
            >
              Ask <span className="hidden sm:inline">my AI</span>
            </button>
          </div>
        </nav>
      </header>

      <div className="border-b border-line bg-ink/60">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-2 px-4 py-2.5 sm:px-6">
          <span className="mr-1 font-mono text-[11px] uppercase tracking-wider text-zinc-500">examples</span>
          {PRESETS.map((p) => (
            <button
              key={p.label}
              onClick={() => setCode(p.code)}
              className="rounded-full border border-line px-3 py-1 text-xs font-semibold text-zinc-300 transition hover:border-accent/50 hover:text-accent"
            >
              {p.label}
            </button>
          ))}
          <button
            onClick={() => setCode(PRESETS[0].code)}
            title="Reset to the first example"
            className="ml-auto flex items-center gap-1.5 rounded-full border border-line px-3 py-1 text-xs font-semibold text-zinc-400 transition hover:border-accent hover:text-accent"
          >
            <RotateCcw size={12} /> Reset
          </button>
        </div>
      </div>

      {/* AI scenario generator — describe a screen, the assistant writes the Compose */}
      <div className="border-b border-line bg-void/40">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-2 px-4 py-2.5 sm:px-6">
          <span className="flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-wider text-accent2">
            <Wand2 size={13} /> AI build
          </span>
          <form
            onSubmit={(e) => { e.preventDefault(); generate(aiPrompt); }}
            className="flex min-w-0 flex-1 items-center gap-2"
          >
            <input
              value={aiPrompt}
              onChange={(e) => setAiPrompt(e.target.value)}
              placeholder="describe a screen — e.g. a login form"
              disabled={aiBusy}
              aria-label="Describe a screen for the AI to build in Compose"
              className="min-w-0 flex-1 rounded-full border border-line bg-ink/60 px-4 py-1.5 text-xs text-zinc-100 outline-none transition focus:border-accent2/60 disabled:opacity-50"
            />
            <button
              type="submit"
              disabled={aiBusy || !aiPrompt.trim()}
              className="flex shrink-0 items-center gap-1.5 rounded-full bg-accent2/90 px-4 py-1.5 text-xs font-bold text-ink transition hover:bg-accent2 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {aiBusy ? "generating…" : "Generate"}
            </button>
          </form>
          <div className="flex flex-wrap items-center gap-1.5">
            {AI_IDEAS.map((idea) => (
              <button
                key={idea}
                onClick={() => { setAiPrompt(idea); generate(idea); }}
                disabled={aiBusy}
                className="rounded-full border border-accent2/30 px-2.5 py-1 text-[11px] text-accent2/90 transition hover:border-accent2 hover:bg-accent2/10 disabled:opacity-40"
              >
                {idea}
              </button>
            ))}
          </div>
        </div>
        {aiNote && (
          <p className="mx-auto max-w-7xl px-4 pb-2 font-mono text-[11px] text-[#ff8f8f] sm:px-6">{aiNote}</p>
        )}
      </div>

      <div className="grid min-h-0 flex-1 grid-rows-2 lg:grid-cols-2 lg:grid-rows-1">
        {/* Editor */}
        <div className="relative flex min-h-0 flex-col border-b border-line lg:border-b-0 lg:border-r">
          <div className="flex min-h-0 flex-1">
            <div
              ref={gutterRef}
              aria-hidden
              className="select-none overflow-hidden border-r border-line bg-ink/40 px-3 py-4 text-right font-mono text-xs leading-[1.6] text-zinc-600"
            >
              {Array.from({ length: lineCount }, (_, i) => (
                <div key={i}>{i + 1}</div>
              ))}
            </div>
            <textarea
              value={code}
              onChange={(e) => setCode(e.target.value)}
              onScroll={(e) => { if (gutterRef.current) gutterRef.current.scrollTop = e.currentTarget.scrollTop; }}
              spellCheck={false}
              autoCapitalize="off"
              autoCorrect="off"
              className="min-h-0 flex-1 resize-none bg-transparent px-4 py-4 font-mono text-[13px] leading-[1.6] text-zinc-100 outline-none"
              style={{ tabSize: 4 }}
              onKeyDown={(e) => {
                if (e.key === "Tab") {
                  e.preventDefault();
                  const t = e.currentTarget;
                  const s = t.selectionStart;
                  const v = t.value;
                  const next = v.slice(0, s) + "    " + v.slice(t.selectionEnd);
                  setCode(next);
                  requestAnimationFrame(() => { t.selectionStart = t.selectionEnd = s + 4; });
                }
              }}
              aria-label="Compose code editor"
            />
          </div>
          <div className="flex items-center gap-2 border-t border-line px-4 py-2 font-mono text-[11px] text-zinc-500">
            <Play size={11} className="text-accent" /> live · renders as you type
          </div>
        </div>

        {/* Preview */}
        <div className="relative flex min-h-0 items-center justify-center overflow-auto bg-[radial-gradient(circle_at_50%_0%,rgba(61,220,132,0.08),transparent_60%)] p-6">
          <div className="relative">
            <div className="mx-auto w-[280px] overflow-hidden rounded-[2.2rem] border-[10px] border-[#0d1512] bg-[#0b0f0d] shadow-[0_30px_80px_-20px_rgba(0,0,0,0.9)]">
              {/* status bar */}
              <div className="flex items-center justify-between bg-[#0b0f0d] px-5 pb-1 pt-2 font-mono text-[9px] text-zinc-500">
                <span>9:41</span>
                <span className="h-2.5 w-14 rounded-b-xl bg-[#0d1512]" />
                <span>▮▮▮ 100%</span>
              </div>
              <div className="h-[520px] overflow-auto bg-[#0b0f0d] text-[#e8efe9]">
                {error ? (
                  <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
                    <span className="font-mono text-xs text-[#ff8f8f]">compile error</span>
                    <span className="font-mono text-[11px] leading-relaxed text-zinc-500">{error}</span>
                  </div>
                ) : program ? (
                  <div className="flex h-full flex-col">
                    {program.tree.map((n, i) => renderNode(n, state, dispatch, i))}
                  </div>
                ) : null}
              </div>
            </div>
            <p className="mt-4 text-center font-mono text-[10px] text-zinc-600">simulated preview · state is live</p>
          </div>
        </div>
      </div>

      <div className="border-t border-line bg-ink/70 px-4 py-2 sm:px-6">
        <p className="mx-auto max-w-7xl truncate font-mono text-[10px] text-zinc-600" title={SUPPORTED}>
          supported: {SUPPORTED}
        </p>
      </div>
    </div>
  );
}
