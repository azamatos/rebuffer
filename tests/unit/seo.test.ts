import { describe, expect, it } from "vitest";
import { headTags, PAGES, sitemap } from "../../src/seo";

describe("the pages' heads", () => {
  it("keep titles and descriptions to what search results show", () => {
    for (const page of Object.values(PAGES)) {
      expect(page.title.length).toBeLessThanOrEqual(60);
      expect(page.description.length).toBeGreaterThanOrEqual(70);
      expect(page.description.length).toBeLessThanOrEqual(170);
    }
  });

  it("escape what they quote", () => {
    const tags = headTags({ path: "/x", file: "x.html", title: 'A "b" & <c>', description: "d" });
    expect(tags).toContain("<title>A &quot;b&quot; &amp; &lt;c&gt;</title>");
    expect(tags).toContain(
      '<meta property="og:title" content="A &quot;b&quot; &amp; &lt;c&gt;" />',
    );
  });

  it("list the pages worth finding in the sitemap, not this browser's runs", () => {
    expect(sitemap()).toContain("<loc>https://rebuffer.azamatos.com/about</loc>");
    expect(sitemap()).not.toContain("/runs");
  });
});
