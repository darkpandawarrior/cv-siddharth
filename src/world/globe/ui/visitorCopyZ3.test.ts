import { readFileSync } from "node:fs";
import { expect, it } from "vitest";

it("keeps the Z3 visitor strings free of em dashes", () => {
  for (const file of ["ShareView.tsx", "DaylightReadout.tsx", "streetPhotoViewer.tsx", "sceneSummaryText.ts"]) {
    const source = readFileSync(new URL(file, import.meta.url), "utf8");
    const code = source.replace(/\/\*[\s\S]*?\*\//g, "").split("\n").filter(line => !line.trimStart().startsWith("//")).join("\n");
    expect(code, file).not.toContain("—");
  }
});
