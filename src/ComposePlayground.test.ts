import { describe, it, expect } from "vitest";
import { MAX_SCENARIO_CHARS, buildGenPrompt, decodeShare, encodeShare, extractFencedCode, validateComposeCode } from "./ComposePlayground.tsx";
import { parseCompose, type Node } from "./composeInterpreter.ts";

/** Every construct the generator prompt (api/_lib/compose-prompt.ts) tells the
 *  model it may emit, in one program. */
const GRAMMAR_SAMPLE = `
var count by remember { mutableStateOf(0) }
var expanded by remember { mutableStateOf(false) }
var username by remember { mutableStateOf("") }
var password by remember { mutableStateOf("") }
Column(modifier = Modifier.fillMaxSize().padding(16.dp).background(Color(0xFF0B0F0D)), verticalArrangement = Arrangement.spacedBy(12.dp), horizontalAlignment = Alignment.CenterHorizontally) {
    Text("Signed in $count times", color = Color.Green, fontSize = 18.sp, fontWeight = FontWeight.Bold)
    Card(modifier = Modifier.fillMaxWidth().clip(RoundedCornerShape(12.dp))) {
        TextField(value = username, onValueChange = { username = it }, modifier = Modifier.fillMaxWidth())
        Spacer(Modifier.height(8.dp))
        TextField(value = password, onValueChange = { password = it }, modifier = Modifier.fillMaxWidth())
    }
    AnimatedVisibility(visible = username.isEmpty() || password.isEmpty()) {
        Text("Fill both fields", color = Color.Red)
    }
    Row(modifier = Modifier.fillMaxWidth().height(56.dp), horizontalArrangement = Arrangement.SpaceBetween) {
        Box(modifier = Modifier.weight(1.dp).size(count.dp).background(Color.Magenta).clip(CircleShape))
        Button(onClick = { count++ }) { Text("Sign in") }
        Button(onClick = { expanded = !expanded }) { Text("More") }
    }
}`;

function flatten(nodes: Node[]): Node[] {
  return nodes.flatMap((n) => ("children" in n ? [n, ...flatten(n.children)] : [n]));
}

describe("the AI scenario prompt", () => {
  it("never builds a user turn past the server's per-message cap", () => {
    expect(buildGenPrompt("x".repeat(10_000)).length).toBeLessThanOrEqual(2000);
  });

  it("sends the scenario and nothing else — the grammar lives server-side now", () => {
    // Regression guard for the bug that made "AI generate" 400 on anything
    // specific: the 1870-char grammar used to ride inside this 2000-char turn,
    // leaving ~130 chars for the actual request.
    const scenario =
      "a settings screen with toggles for notifications and dark mode, plus a sign out button, " +
      "a header card showing the signed-in email, and a footer with an app version string";
    expect(scenario.length).toBeGreaterThan(133); // would have been rejected before
    expect(scenario.length).toBeLessThanOrEqual(MAX_SCENARIO_CHARS);
    expect(buildGenPrompt(scenario)).toBe(scenario);
  });
});

// cv-fallback-honesty: a deviating model's reply gets caught before it ever
// reaches the interpreter, so `generate()` (ComposePlayground.tsx) knows to
// retry once instead of silently rendering a wall of "not supported yet".
describe("extractFencedCode", () => {
  it("pulls the code out of a ```kotlin fence", () => {
    expect(extractFencedCode("Sure!\n```kotlin\nText(\"hi\")\n```\n")).toBe('Text("hi")');
  });

  it("is null when the reply never fenced anything — the actual bug this guards", () => {
    expect(extractFencedCode("Sure, here's a login screen: it has a text field and a button.")).toBeNull();
  });

  it("is null on a fence that never closed", () => {
    expect(extractFencedCode("```kotlin\nText(\"hi\")")).toBeNull();
  });
});

describe("validateComposeCode", () => {
  it("accepts a well-formed program", () => {
    expect(validateComposeCode('Text("hi")')).toEqual({ ok: true });
  });

  it("rejects a syntax error the tokenizer/parser can't get past", () => {
    const result = validateComposeCode("Column( { Text(");
    expect(result.ok).toBe(false);
  });

  it("accepts an unrecognised call as a plain 'unknown' node, not a rejection — the interpreter's own forgiving-by-design behaviour, not the bug being guarded against", () => {
    expect(validateComposeCode("SomeFutureComposable()")).toEqual({ ok: true });
  });
});

describe("share link round-trip", () => {
  it("decodes exactly what it encoded, including unicode and newlines", () => {
    const code = 'Text("emoji rocket 🚀 works")\nColumn {\n  Text("second line")\n}';
    expect(decodeShare(encodeShare(code))).toBe(code);
  });

  it("is URL-safe — no raw +, / or padding = survives", () => {
    // Base64's own alphabet uses three characters a URL query param treats
    // specially; the whole point of the -/_ swap and the trimmed padding is
    // that none of them show up in the encoded output.
    const encoded = encodeShare("a".repeat(200)); // long enough to force padding in plain base64
    expect(encoded).not.toMatch(/[+/=]/);
  });

  it("returns null on a malformed param instead of throwing", () => {
    expect(decodeShare("not valid base64!!!")).toBeNull();
  });
});

describe("the grammar the server's generator prompt advertises", () => {
  it("parses into a runnable program — no unknown nodes", () => {
    const program = parseCompose(GRAMMAR_SAMPLE);

    expect(program.state).toEqual([
      { name: "count", init: 0 },
      { name: "expanded", init: false },
      { name: "username", init: "" },
      { name: "password", init: "" },
    ]);
    // An "unknown" node means the rules promise the model something the
    // interpreter can't render — the two have drifted apart.
    expect(flatten(program.tree).filter((n) => n.kind === "unknown")).toEqual([]);

    const fields = flatten(program.tree).filter((n) => n.kind === "textfield");
    expect(fields.map((f) => (f as Extract<Node, { kind: "textfield" }>).bindTo)).toEqual(["username", "password"]);
  });
});
