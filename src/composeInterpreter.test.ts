import { describe, it, expect } from "vitest";
import { parseCompose } from "./composeInterpreter";
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

  it("never throws on unknown input, and yields an unknown node instead", () => {
    let program: ReturnType<typeof parseCompose> | undefined;
    expect(() => {
      program = parseCompose("Wobble(???)");
    }).not.toThrow();

    expect(program!.state).toEqual([]);
    expect(program!.tree).toEqual([{ kind: "unknown", name: "Wobble" }]);
  });
});
