/**
 * A tiny interpreter for a curated slice of Jetpack Compose.
 *
 * Real Compose compiles Kotlin to Android — that can't run in a browser. So
 * this is a faithful *simulation*: a hand-written tokenizer + recursive-descent
 * parser for the subset people reach for first (Column/Row/Box/Card, Text,
 * Button, Spacer, a modifier chain, and `remember { mutableStateOf(...) }`),
 * producing an AST the React preview walks and renders as an Android surface.
 * State is real — a Button's onClick mutates a var and the tree recomposes —
 * so the counter everyone writes first actually counts.
 *
 * It is deliberately forgiving: unknown modifiers and named args are ignored
 * rather than fatal, so half-finished experiments still render something.
 */

/* ── AST ─────────────────────────────────────────────────────────────── */

export type Expr =
  | { t: "str"; parts: (string | { ref: string })[] }
  | { t: "num"; value: number; unit?: "dp" | "sp"; ref?: string } // ref → read the number from state (e.g. size.dp)
  | { t: "bool"; value: boolean }
  | { t: "ident"; name: string }
  | { t: "member"; path: string } // Color.Green, Arrangement.Center, FontWeight.Bold, password.isEmpty…
  | { t: "logic"; op: "and" | "or"; left: Expr; right: Expr }; // a || b, a && b

export type Modifier = { name: string; args: Expr[] };

export type Action =
  | { op: "inc" | "dec" | "toggle"; name: string }
  | { op: "addAssign" | "subAssign"; name: string; value: number }
  | { op: "set"; name: string; value: Expr };

export type Node =
  | { kind: "container"; name: "Column" | "Row" | "Box" | "Card" | "Surface"; modifiers: Modifier[]; named: Record<string, Expr>; children: Node[] }
  | { kind: "text"; value: Expr; named: Record<string, Expr>; modifiers: Modifier[] }
  | { kind: "button"; onClick: Action[]; named: Record<string, Expr>; modifiers: Modifier[]; children: Node[] }
  | { kind: "spacer"; modifiers: Modifier[] }
  | { kind: "animated"; visible: Expr; modifiers: Modifier[]; children: Node[] }
  // bindTo is the state var an `onValueChange = { name = it }` lambda assigns
  // to — null if the AI wrote something the parser doesn't recognize, in
  // which case the field still renders but won't feed back into state.
  | { kind: "textfield"; value: Expr; bindTo: string | null; named: Record<string, Expr>; modifiers: Modifier[] }
  | { kind: "unknown"; name: string };

export type StateDecl = { name: string; init: number | boolean | string };
export type Program = { state: StateDecl[]; tree: Node[] };

const CONTAINERS = new Set(["Column", "Row", "Box", "Card", "Surface"]);

/* ── Tokenizer ───────────────────────────────────────────────────────── */

type Tok =
  | { k: "id"; v: string }
  | { k: "num"; v: string }
  | { k: "str"; v: string }
  | { k: "punc"; v: string };

function tokenize(src: string): Tok[] {
  const toks: Tok[] = [];
  let i = 0;
  const n = src.length;
  const isIdStart = (c: string) => /[A-Za-z_]/.test(c);
  const isId = (c: string) => /[A-Za-z0-9_]/.test(c);
  const isDigit = (c: string) => /[0-9]/.test(c);

  while (i < n) {
    const c = src[i];
    // whitespace
    if (/\s/.test(c)) { i++; continue; }
    // line comment
    if (c === "/" && src[i + 1] === "/") { while (i < n && src[i] !== "\n") i++; continue; }
    // block comment
    if (c === "/" && src[i + 1] === "*") { i += 2; while (i < n && !(src[i] === "*" && src[i + 1] === "/")) i++; i += 2; continue; }
    // string (double-quoted, with \" escapes; content kept raw for interpolation)
    if (c === '"') {
      i++;
      let s = "";
      while (i < n && src[i] !== '"') {
        if (src[i] === "\\" && i + 1 < n) { s += src[i] + src[i + 1]; i += 2; continue; }
        s += src[i++];
      }
      i++; // closing quote
      toks.push({ k: "str", v: s });
      continue;
    }
    // hex literal 0xAARRGGBB (for Color(0x...))
    if (c === "0" && (src[i + 1] === "x" || src[i + 1] === "X")) {
      let s = "0x";
      i += 2;
      while (i < n && /[0-9A-Fa-f]/.test(src[i])) s += src[i++];
      toks.push({ k: "num", v: s });
      continue;
    }
    // number (integer or decimal; unit .dp/.sp handled by parser)
    if (isDigit(c)) {
      let s = "";
      while (i < n && isDigit(src[i])) s += src[i++];
      if (src[i] === "." && isDigit(src[i + 1])) { s += src[i++]; while (i < n && isDigit(src[i])) s += src[i++]; }
      if (src[i] === "f" || src[i] === "F") i++; // 12f float literal
      toks.push({ k: "num", v: s });
      continue;
    }
    // identifier / keyword
    if (isIdStart(c)) {
      let s = "";
      while (i < n && isId(src[i])) s += src[i++];
      toks.push({ k: "id", v: s });
      continue;
    }
    // multi-char punctuation
    const two = src.slice(i, i + 2);
    if (["++", "--", "+=", "-=", "==", "!=", "->", "||", "&&"].includes(two)) { toks.push({ k: "punc", v: two }); i += 2; continue; }
    // single-char punctuation
    if ("{}()[].,=!+-*/:<>".includes(c)) { toks.push({ k: "punc", v: c }); i++; continue; }
    // anything else — skip so a stray char never wedges the parser
    i++;
  }
  return toks;
}

/* ── Parser ──────────────────────────────────────────────────────────── */

class Parser {
  private p = 0;
  constructor(private toks: Tok[]) {}

  private peek(o = 0): Tok | undefined { return this.toks[this.p + o]; }
  private next(): Tok | undefined { return this.toks[this.p++]; }
  private atPunc(v: string, o = 0): boolean { const t = this.peek(o); return !!t && t.k === "punc" && t.v === v; }
  private atId(v: string, o = 0): boolean { const t = this.peek(o); return !!t && t.k === "id" && t.v === v; }
  private eatPunc(v: string) {
    if (!this.atPunc(v)) throw new Error(`Expected "${v}" near ${this.describe()}`);
    this.p++;
  }
  private describe(): string {
    const t = this.peek();
    return t ? `"${t.v}"` : "end of code";
  }

  parseProgram(): Program {
    const state: StateDecl[] = [];
    const tree: Node[] = [];
    while (this.peek()) {
      if (this.atId("var") || this.atId("val")) { state.push(this.parseStateDecl()); continue; }
      const node = this.parseNode();
      if (node) tree.push(node);
      else break;
    }
    return { state, tree };
  }

  // var count by remember { mutableStateOf(0) }
  private parseStateDecl(): StateDecl {
    this.next(); // var / val
    const nameTok = this.next();
    if (!nameTok || nameTok.k !== "id") throw new Error("Expected a name after var");
    const name = nameTok.v;
    // `by` or `=`
    if (this.atId("by")) this.next();
    else if (this.atPunc("=")) this.next();
    else throw new Error(`Expected "by" or "=" in the declaration of ${name}`);
    // remember { mutableStateOf( <init> ) }
    if (!this.atId("remember")) throw new Error(`${name} needs remember { mutableStateOf(...) }`);
    this.next();
    this.eatPunc("{");
    if (!this.atId("mutableStateOf")) throw new Error(`${name} needs mutableStateOf(...)`);
    this.next();
    this.eatPunc("(");
    const init = this.parseExpr();
    this.eatPunc(")");
    this.eatPunc("}");
    let value: number | boolean | string;
    if (init.t === "num") value = init.value;
    else if (init.t === "bool") value = init.value;
    else if (init.t === "str") value = init.parts.map((x) => (typeof x === "string" ? x : "")).join("");
    else value = 0;
    return { name, init: value };
  }

  private parseNode(): Node | null {
    const t = this.peek();
    if (!t || t.k !== "id") return null;
    const name = t.v;
    if (name === "Text") return this.parseText();
    if (name === "Button") return this.parseButton();
    if (name === "Spacer") return this.parseSpacer();
    if (name === "AnimatedVisibility") return this.parseAnimated();
    if (name === "TextField" || name === "OutlinedTextField" || name === "BasicTextField") return this.parseTextField();
    if (CONTAINERS.has(name)) return this.parseContainer(name as "Column");
    // Unknown composable: consume its call + trailing lambda so we can keep going.
    this.next();
    this.skipParens();
    this.skipBraces();
    return { kind: "unknown", name };
  }

  private parseText(): Node {
    this.next(); // Text
    const { positional, named, modifiers } = this.parseArgs();
    const value = positional[0] ?? (named.text ?? { t: "str", parts: [""] });
    return { kind: "text", value, named, modifiers };
  }

  private parseButton(): Node {
    this.next(); // Button
    const { named, modifiers, onClick } = this.parseArgs();
    const children = this.parseLambdaChildren();
    return { kind: "button", onClick: onClick ?? [], named, modifiers, children };
  }

  private parseSpacer(): Node {
    this.next(); // Spacer
    const { modifiers } = this.parseArgs();
    return { kind: "spacer", modifiers };
  }

  private parseTextField(): Node {
    this.next(); // TextField / OutlinedTextField / BasicTextField
    const { named, modifiers, onValueChange } = this.parseArgs();
    const value = named.value ?? { t: "str", parts: [""] };
    return { kind: "textfield", value, bindTo: onValueChange ?? null, named, modifiers };
  }

  private parseAnimated(): Node {
    this.next(); // AnimatedVisibility
    const { named, modifiers, positional } = this.parseArgs();
    const children = this.parseLambdaChildren();
    const visible = named.visible ?? positional[0] ?? { t: "bool", value: true };
    return { kind: "animated", visible, modifiers, children };
  }

  private parseContainer(name: "Column" | "Row" | "Box" | "Card" | "Surface"): Node {
    this.next();
    const { named, modifiers } = this.parseArgs();
    const children = this.parseLambdaChildren();
    return { kind: "container", name, modifiers, named, children };
  }

  /** Parse an optional (...) argument list: positional exprs, named k=v, a bare
   *  Modifier chain, onClick = { actions }, and onValueChange = { name = it }.
   *  All parts optional. */
  private parseArgs(): { positional: Expr[]; named: Record<string, Expr>; modifiers: Modifier[]; onClick?: Action[]; onValueChange?: string | null } {
    const positional: Expr[] = [];
    const named: Record<string, Expr> = {};
    let modifiers: Modifier[] = [];
    let onClick: Action[] | undefined;
    let onValueChange: string | null | undefined;
    if (!this.atPunc("(")) return { positional, named, modifiers };
    this.eatPunc("(");
    while (!this.atPunc(")") && this.peek()) {
      // named arg?
      if (this.peek()?.k === "id" && this.atPunc("=", 1) && !this.atPunc("==", 1)) {
        const key = (this.next() as Tok).v;
        this.next(); // =
        if (key === "onClick") onClick = this.parseActionLambda();
        else if (key === "modifier") modifiers = this.parseModifierChain();
        else if (key === "onValueChange") onValueChange = this.parseValueChangeBinding();
        else named[key] = this.parseExpr();
      } else if (this.atId("Modifier")) {
        modifiers = this.parseModifierChain();
      } else {
        positional.push(this.parseExpr());
      }
      if (this.atPunc(",")) this.next();
      else break;
    }
    this.eatPunc(")");
    return { positional, named, modifiers, onClick, onValueChange };
  }

  // { username = it } — the one shape that matters: bind the field straight
  // to a state var. Anything else in the lambda is skipped, not fatal.
  private parseValueChangeBinding(): string | null {
    if (!this.atPunc("{")) return null;
    this.eatPunc("{");
    let bound: string | null = null;
    if (this.peek()?.k === "id" && this.atPunc("=", 1) && this.atId("it", 2)) {
      bound = (this.next() as Tok).v; // the state var name
      this.next(); // =
      this.next(); // it
    }
    let depth = 1;
    while (depth > 0 && this.peek()) {
      if (this.atPunc("{")) depth++;
      else if (this.atPunc("}")) { depth--; if (depth === 0) break; }
      this.next();
    }
    this.eatPunc("}");
    return bound;
  }

  // Modifier.padding(16.dp).fillMaxWidth()...
  private parseModifierChain(): Modifier[] {
    const mods: Modifier[] = [];
    if (this.atId("Modifier")) this.next();
    while (this.atPunc(".")) {
      this.next();
      const m = this.next();
      if (!m || m.k !== "id") break;
      const args: Expr[] = [];
      if (this.atPunc("(")) {
        this.next();
        while (!this.atPunc(")") && this.peek()) {
          // ignore names on modifier args (e.g. horizontal = 12.dp); keep values
          if (this.peek()?.k === "id" && this.atPunc("=", 1)) { this.next(); this.next(); }
          args.push(this.parseExpr());
          if (this.atPunc(",")) this.next(); else break;
        }
        this.eatPunc(")");
      }
      mods.push({ name: m.v, args });
    }
    return mods;
  }

  // { count++  count = !count  count += 2 ... }
  private parseActionLambda(): Action[] {
    const actions: Action[] = [];
    if (!this.atPunc("{")) return actions;
    this.eatPunc("{");
    while (!this.atPunc("}") && this.peek()) {
      const idTok = this.peek();
      if (idTok?.k === "id") {
        const name = (this.next() as Tok).v;
        if (this.atPunc("++")) { this.next(); actions.push({ op: "inc", name }); }
        else if (this.atPunc("--")) { this.next(); actions.push({ op: "dec", name }); }
        else if (this.atPunc("+=")) { this.next(); const e = this.parseExpr(); actions.push({ op: "addAssign", name, value: e.t === "num" ? e.value : 0 }); }
        else if (this.atPunc("-=")) { this.next(); const e = this.parseExpr(); actions.push({ op: "subAssign", name, value: e.t === "num" ? e.value : 0 }); }
        else if (this.atPunc("=")) {
          this.next();
          if (this.atPunc("!")) { this.next(); this.next(); actions.push({ op: "toggle", name }); } // = !flag
          else actions.push({ op: "set", name, value: this.parseExpr() });
        }
      } else {
        this.next(); // skip anything unrecognised
      }
    }
    this.eatPunc("}");
    return actions;
  }

  private parseLambdaChildren(): Node[] {
    const children: Node[] = [];
    if (!this.atPunc("{")) return children;
    this.eatPunc("{");
    while (!this.atPunc("}") && this.peek()) {
      const before = this.p;
      const node = this.parseNode();
      if (node) children.push(node);
      if (this.p === before) this.next(); // guarantee progress
    }
    this.eatPunc("}");
    return children;
  }

  // a.isEmpty() || b.isEmpty() — left-associative, no precedence between
  // && and || (this subset never needs it); each side is a plain atom.
  private parseExpr(): Expr {
    let left = this.parseAtom();
    while (this.atPunc("||") || this.atPunc("&&")) {
      const op: "and" | "or" = (this.next() as Tok).v === "||" ? "or" : "and";
      left = { t: "logic", op, left, right: this.parseAtom() };
    }
    return left;
  }

  private parseAtom(): Expr {
    const t = this.peek();
    if (!t) return { t: "str", parts: [""] };
    if (t.k === "str") { this.next(); return { t: "str", parts: parseInterpolation(t.v) }; }
    if (t.k === "num") {
      this.next();
      let unit: "dp" | "sp" | undefined;
      if (this.atPunc(".") && (this.atId("dp", 1) || this.atId("sp", 1))) { this.next(); unit = (this.next() as Tok).v as "dp" | "sp"; }
      return { t: "num", value: parseFloat(t.v), unit };
    }
    if (t.k === "id") {
      if (t.v === "true" || t.v === "false") { this.next(); return { t: "bool", value: t.v === "true" }; }
      // Color(0xAARRGGBB) — a custom colour literal.
      if (t.v === "Color" && this.peek(1)?.k === "punc" && this.peek(1)?.v === "(") {
        this.next(); this.next(); // Color (
        const arg = this.peek();
        let hex = "";
        if (arg && arg.k === "num") { hex = arg.v; this.next(); }
        while (this.peek() && !this.atPunc(")")) this.next();
        if (this.atPunc(")")) this.next();
        return { t: "member", path: "ColorHex:" + hex };
      }
      // state-driven dimension: `size.dp` / `padding.sp` reads the number from state
      if (this.peek()?.k === "id" && this.atPunc(".", 1) && (this.atId("dp", 2) || this.atId("sp", 2))) {
        const ref = (this.next() as Tok).v;
        this.next(); // .
        const unit = (this.next() as Tok).v as "dp" | "sp";
        return { t: "num", value: 0, unit, ref };
      }
      // member path: Color.Green, Arrangement.spacedBy(8.dp), Alignment.CenterHorizontally
      let path = (this.next() as Tok).v;
      // Non-Color function call form we don't model — skip its args, keep the name.
      if (this.atPunc("(")) { this.skipParens(); return { t: "member", path }; }
      const isMember = this.atPunc(".");
      while (this.atPunc(".") && this.peek(1)?.k === "id") {
        this.next();
        path += "." + (this.next() as Tok).v;
        if (this.atPunc("(")) this.skipParens(); // e.g. spacedBy(8.dp) — arg ignored
      }
      return isMember ? { t: "member", path } : { t: "ident", name: path };
    }
    // Unrecognised — consume one token and yield empty string.
    this.next();
    return { t: "str", parts: [""] };
  }

  private skipParens() {
    if (!this.atPunc("(")) return;
    let depth = 0;
    do {
      const t = this.next();
      if (!t) break;
      if (t.k === "punc" && t.v === "(") depth++;
      else if (t.k === "punc" && t.v === ")") depth--;
    } while (depth > 0 && this.peek());
  }
  private skipBraces() {
    if (!this.atPunc("{")) return;
    let depth = 0;
    do {
      const t = this.next();
      if (!t) break;
      if (t.k === "punc" && t.v === "{") depth++;
      else if (t.k === "punc" && t.v === "}") depth--;
    } while (depth > 0 && this.peek());
  }
}

/** Split "Count: $count times ${n}" into literal + reference parts. */
function parseInterpolation(raw: string): (string | { ref: string })[] {
  // unescape \" and \n first
  const s = raw.replace(/\\"/g, '"').replace(/\\n/g, "\n").replace(/\\t/g, "\t");
  const parts: (string | { ref: string })[] = [];
  let i = 0;
  let buf = "";
  while (i < s.length) {
    if (s[i] === "$") {
      if (s[i + 1] === "{") {
        const end = s.indexOf("}", i + 2);
        if (end !== -1) {
          if (buf) { parts.push(buf); buf = ""; }
          parts.push({ ref: s.slice(i + 2, end).trim() });
          i = end + 1;
          continue;
        }
      } else if (/[A-Za-z_]/.test(s[i + 1] ?? "")) {
        let j = i + 1;
        while (j < s.length && /[A-Za-z0-9_]/.test(s[j])) j++;
        if (buf) { parts.push(buf); buf = ""; }
        parts.push({ ref: s.slice(i + 1, j) });
        i = j;
        continue;
      }
    }
    buf += s[i++];
  }
  if (buf) parts.push(buf);
  return parts;
}

export function parseCompose(src: string): Program {
  const parser = new Parser(tokenize(src));
  return parser.parseProgram();
}
