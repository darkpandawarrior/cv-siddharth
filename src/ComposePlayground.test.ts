import { describe, it, expect } from "vitest";
import { buildGenPrompt, MAX_SCENARIO_CHARS } from "./ComposePlayground.tsx";
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
