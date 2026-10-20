import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { THEME_KEY } from "../../src/ui/theme/theme";

const read = (path: string) => readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");

describe("the theme script in index.html", () => {
  const html = read("index.html");
  const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(
    (match) => match[1] ?? "",
  );

  it("is allowed by its hash in the CSP", () => {
    const csp = /Content-Security-Policy: (.*)/.exec(read("public/_headers"))?.[1] ?? "";
    const scriptSrc = csp.split(";").find((part) => part.trim().startsWith("script-src")) ?? "";
    expect(scripts).toHaveLength(1);
    for (const script of scripts) {
      const hash = createHash("sha256").update(script).digest("base64");
      expect(scriptSrc).toContain(`'sha256-${hash}'`);
    }
  });

  it("reads the key the app writes", () => {
    expect(scripts[0]).toContain(`"${THEME_KEY}"`);
  });
});
