import { describe, it, expect } from "vitest";
import { parseCompose, ComposeParseError } from "./composeInterpreter";
import type { Node } from "./composeInterpreter";

describe("parseCompose", () => {
  it("parses a state decl and a Column with a Text child", () => {
    const program = parseCompose(`var count by remember { mutableStateOf(0) }\nColumn {\n  Text("Hello")\n}`);

    expect(program.state).toEqual([{ name: "count", init: 0 }]);

    expect(program.tree).toHaveLength(1);
    const [column] = program.tree;
    expect(column.kind).toBe("container");
    expect((column as Extract<Node, { kind: "container" }>).name).toBe("Column");

    const children = (column as Extract<Node, { kind: "container" }>).children;
    expect(children).toHaveLength(1);
    const [text] = children;
    expect(text.kind).toBe("text");
    expect((text as Extract<Node, { kind: "text" }>).value).toEqual({ t: "str", parts: ["Hello"] });
  });

  it("keeps a spacedBy argument instead of discarding it", () => {
    // Regression: the parser used to skip a member call's arguments outright, so every
    // `spacedBy(N.dp)` reached the renderer as a bare `Arrangement.spacedBy` and drew a hardcoded
    // 8px gap whatever N said. The Counter preset declares 12.dp and rendered at 8.
    const program = parseCompose(`Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {\n  Text("a")\n}`);

    const row = program.tree[0] as Extract<Node, { kind: "container" }>;
    expect(row.name).toBe("Row");
    expect(row.named.horizontalArrangement).toEqual({ t: "member", path: "Arrangement.spacedBy:12" });
  });

  it("leaves a member call with no numeric argument unsuffixed", () => {
    // The colon encoding must not fire for calls that carry nothing to keep — `endsWith` matching
    // elsewhere in the renderer depends on those paths staying clean.
    const program = parseCompose(`Column(verticalArrangement = Arrangement.Center) {\n  Text("a")\n}`);

    const col = program.tree[0] as Extract<Node, { kind: "container" }>;
    expect(col.named.verticalArrangement).toEqual({ t: "member", path: "Arrangement.Center" });
  });

  it("never throws on unknown input, and yields an unknown node instead", () => {
    let program: ReturnType<typeof parseCompose> | undefined;
    expect(() => {
      program = parseCompose("Wobble(???)");
    }).not.toThrow();

    expect(program!.state).toEqual([]);
    expect(program!.tree).toEqual([{ kind: "unknown", name: "Wobble" }]);
  });

  it("throws a ComposeParseError with a resolvable line and column", () => {
    // Line 1 is the state decl, line 2 opens Column, line 3 is the unclosed
    // Button lambda — the missing "}" is only discovered at end of source,
    // which is exactly the case a bare token offset can't resolve without
    // the fallback to the last token.
    const src = `var count by remember { mutableStateOf(0) }\nColumn {\n  Button(onClick = { count++ }) { Text("tap") }\n`;
    let caught: unknown;
    try {
      parseCompose(src);
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(ComposeParseError);
    const err = caught as ComposeParseError;
    expect(err.line).toBeGreaterThan(0);
    expect(err.col).toBeGreaterThan(0);
    expect(err.message).toContain('Expected "}"');
  });

  it("tracks line/col past a newline, not just from position 0", () => {
    // Line 1 is a complete, valid node. Line 2 opens a container that never
    // closes — the failure must land on line 2, not line 1, which is exactly
    // what a naive "count characters from the start" implementation gets
    // wrong the moment a newline is involved.
    const src = `Text("a")\nColumn(`;
    let err: ComposeParseError | undefined;
    try {
      parseCompose(src);
    } catch (e) {
      err = e as ComposeParseError;
    }
    expect(err).toBeInstanceOf(ComposeParseError);
    expect(err!.line).toBe(2);
    expect(err!.col).toBe(7); // "Column(" — the "(" sits at column 7
  });
});
