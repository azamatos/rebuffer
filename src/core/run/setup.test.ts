import { describe, expect, it } from "vitest";
import { DEFAULT_STREAM } from "@/core/samples";
import { readStreamLink, runSearchFor } from "./setup";

describe("runSearchFor", () => {
  it("leaves the defaults out, so the link stays short", () => {
    expect(
      runSearchFor({ streamUrl: DEFAULT_STREAM.url, networkId: "tunnel", playerId: "defaults" }),
    ).toEqual({});
  });

  it("carries every choice that isn't a default, and asks the screen to start", () => {
    expect(
      runSearchFor(
        { streamUrl: "https://media.example/a.m3u8", networkId: "lift", playerId: "fast-start" },
        { start: true },
      ),
    ).toEqual({
      stream: "https://media.example/a.m3u8",
      network: "lift",
      player: "fast-start",
      start: "now",
    });
  });
});

describe("readStreamLink", () => {
  it("accepts a web address and tidies it", () => {
    expect(readStreamLink("  https://media.example/a b.m3u8 ", "https:")).toEqual({
      ok: true,
      url: "https://media.example/a%20b.m3u8",
    });
  });

  it("explains what's wrong with anything else", () => {
    expect(readStreamLink(" ", "https:")).toEqual({
      ok: false,
      error: "Paste the link to an HLS playlist; it usually ends in .m3u8.",
    });
    expect(readStreamLink("media.example/a.m3u8", "https:")).toMatchObject({
      ok: false,
      error: expect.stringContaining("isn't a web address") as unknown,
    });
    expect(readStreamLink("ftp://media.example/a.m3u8", "https:")).toEqual({
      ok: false,
      error: "The link must start with https://.",
    });
  });

  it("refuses an http:// stream on a secure page, but not on a plain one", () => {
    expect(readStreamLink("http://media.example/a.m3u8", "https:")).toMatchObject({ ok: false });
    expect(readStreamLink("http://localhost:4013/a.m3u8", "http:")).toEqual({
      ok: true,
      url: "http://localhost:4013/a.m3u8",
    });
  });
});
