import { describe, expect, it } from "vitest";
import { describeCodec, describeCodecs } from "./codecs";

function label(codec: string): string {
  return describeCodec(codec).label;
}

describe("describeCodec: H.264", () => {
  it("names the profile and level", () => {
    expect(describeCodec("avc1.640028")).toEqual({
      codec: "avc1.640028",
      kind: "video",
      name: "H.264",
      profile: "High",
      level: "4.0",
      label: "H.264 High 4.0",
    });
    expect(label("avc1.64001f")).toBe("H.264 High 3.1");
    expect(label("avc1.4d401e")).toBe("H.264 Main 3.0");
    expect(label("avc1.58A01E")).toBe("H.264 Extended 3.0");
    expect(label("avc1.6e0033")).toBe("H.264 High 10 5.1");
    expect(label("avc1.7a0034")).toBe("H.264 High 4:2:2 5.2");
    expect(label("avc1.f40033")).toBe("H.264 High 4:4:4 5.1");
  });

  it("tells Constrained Baseline from Baseline by constraint_set1", () => {
    expect(label("avc1.42e01e")).toBe("H.264 Constrained Baseline 3.0");
    expect(label("avc1.42401e")).toBe("H.264 Constrained Baseline 3.0");
    expect(label("avc1.42001e")).toBe("H.264 Baseline 3.0");
  });

  it("reads level 1b", () => {
    expect(label("avc1.42e009")).toBe("H.264 Constrained Baseline 1b");
    expect(label("avc1.4d500b")).toBe("H.264 Main 1b");
    expect(label("avc1.64000b")).toBe("H.264 High 1.1");
  });

  it("reads avc3 and the legacy decimal form", () => {
    expect(label("avc3.640028")).toBe("H.264 High 4.0");
    expect(label("avc1.66.30")).toBe("H.264 Baseline 3.0");
    expect(label("avc1.77.31")).toBe("H.264 Main 3.1");
  });

  it("keeps an unknown profile number", () => {
    expect(describeCodec("avc1.760028")).toMatchObject({
      kind: "video",
      profile: undefined,
      level: "4.0",
      label: "H.264 profile 118, level 4.0",
    });
  });
});

describe("describeCodec: HEVC", () => {
  it("names the profile, level and tier", () => {
    expect(describeCodec("hvc1.2.4.L153.B0")).toEqual({
      codec: "hvc1.2.4.L153.B0",
      kind: "video",
      name: "HEVC",
      profile: "Main 10",
      level: "5.1",
      label: "HEVC Main 10 5.1",
    });
    expect(label("hvc1.2.4.H153.90")).toBe("HEVC Main 10 5.1 (High tier)");
    expect(label("hev1.1.6.L93.B0")).toBe("HEVC Main 3.1");
    expect(label("hvc1.1.6.L120.90")).toBe("HEVC Main 4.0");
    expect(label("hvc1.3.E.L93.B0")).toBe("HEVC Main Still Picture 3.1");
    expect(label("hvc1.4.10.L123.9C.88")).toBe("HEVC RExt 4.1");
    expect(label("hvc1.A1.6.L186.B0")).toBe("HEVC Main 6.2");
  });
});

describe("describeCodec: AV1", () => {
  it("names the profile, level, tier and bit depth", () => {
    expect(describeCodec("av01.0.08M.10")).toEqual({
      codec: "av01.0.08M.10",
      kind: "video",
      name: "AV1",
      profile: "Main",
      level: "4.0",
      label: "AV1 Main 4.0, 10-bit",
    });
    expect(label("av01.0.04M.08")).toBe("AV1 Main 3.0, 8-bit");
    expect(label("av01.0.13H.10.0.110.09.16.09.0")).toBe("AV1 Main 5.1 (High tier), 10-bit");
    expect(label("av01.1.00M.10")).toBe("AV1 High 2.0, 10-bit");
    expect(label("av01.2.23M.12")).toBe("AV1 Professional 7.3, 12-bit");
  });

  it("leaves out the level for seq_level_idx 31 (no constraints)", () => {
    expect(describeCodec("av01.0.31M.08")).toMatchObject({
      level: undefined,
      label: "AV1 Main, 8-bit",
    });
  });
});

describe("describeCodec: VP9 and VP8", () => {
  it("names the VP9 profile, level and bit depth", () => {
    expect(describeCodec("vp09.02.10.10.01.09.16.09.01")).toMatchObject({
      kind: "video",
      name: "VP9",
      profile: "Profile 2",
      level: "1.0",
      label: "VP9 Profile 2 1.0, 10-bit",
    });
    expect(label("vp09.00.41.08")).toBe("VP9 Profile 0 4.1, 8-bit");
  });

  it("accepts the short WebM names", () => {
    expect(label("vp9")).toBe("VP9");
    expect(describeCodec("vp8")).toMatchObject({ kind: "video", label: "VP8" });
  });
});

describe("describeCodec: audio", () => {
  it("names AAC flavours", () => {
    expect(describeCodec("mp4a.40.2")).toEqual({
      codec: "mp4a.40.2",
      kind: "audio",
      name: "AAC",
      profile: "LC",
      level: undefined,
      label: "AAC-LC",
    });
    expect(label("mp4a.40.5")).toBe("HE-AAC");
    expect(label("mp4a.40.29")).toBe("HE-AAC v2");
    expect(label("mp4a.40.02")).toBe("AAC-LC");
    expect(label("mp4a.40.42")).toBe("xHE-AAC");
    expect(label("mp4a.67")).toBe("AAC-LC");
  });

  it("names MP3 in all its spellings", () => {
    expect(label("mp4a.40.34")).toBe("MP3");
    expect(label("mp4a.6B")).toBe("MP3");
    expect(label("mp4a.6b")).toBe("MP3");
    expect(label("mp4a.69")).toBe("MP3");
    expect(label("mp3")).toBe("MP3");
  });

  it("names Dolby, Opus and FLAC", () => {
    expect(describeCodec("ac-3")).toMatchObject({
      kind: "audio",
      name: "Dolby Digital",
      label: "Dolby Digital (AC-3)",
    });
    expect(label("ec-3")).toBe("Dolby Digital Plus (E-AC-3)");
    expect(label("mp4a.a6")).toBe("Dolby Digital Plus (E-AC-3)");
    expect(label("ac-4.02.01.03")).toBe("Dolby AC-4");
    expect(label("Opus")).toBe("Opus");
    expect(label("opus")).toBe("Opus");
    expect(label("fLaC")).toBe("FLAC");
  });

  it("keeps an unknown MPEG-4 audio object type as audio", () => {
    expect(describeCodec("mp4a.40.99")).toMatchObject({
      kind: "audio",
      label: "MPEG-4 Audio (object type 99)",
    });
  });
});

describe("describeCodec: Dolby Vision and text", () => {
  it("names the Dolby Vision profile and level", () => {
    expect(describeCodec("dvh1.05.06")).toEqual({
      codec: "dvh1.05.06",
      kind: "video",
      name: "Dolby Vision",
      profile: "Profile 5",
      level: "6",
      label: "Dolby Vision Profile 5, level 6",
    });
    expect(label("dvhe.08.07")).toBe("Dolby Vision Profile 8, level 7");
    expect(label("dvh1.08.06/db4h")).toBe("Dolby Vision Profile 8, level 6");
    expect(describeCodec("dvh1.08.06/db4h").codec).toBe("dvh1.08.06/db4h");
    expect(label("dav1.10.09")).toBe("Dolby Vision Profile 10, level 9");
  });

  it("names WebVTT and TTML", () => {
    expect(describeCodec("wvtt")).toMatchObject({ kind: "text", label: "WebVTT" });
    expect(describeCodec("stpp.ttml.im1t")).toMatchObject({
      kind: "text",
      name: "TTML",
      profile: "IMSC1 Text",
      label: "TTML",
    });
    expect(describeCodec("stpp")).toMatchObject({
      kind: "text",
      profile: undefined,
      label: "TTML",
    });
  });
});

describe("describeCodec: unknown and malformed strings", () => {
  it.each([
    "",
    "xyz1.2.3",
    "avc1",
    "avc1.6400",
    "avc1.zz0028",
    "hvc1.2.4",
    "hvc1.x.4.L153",
    "av01.0.08",
    "av01.0.08X.10",
    "vp09.0.10.08",
    "mp4a",
    "mp4a.40",
    "mp4a.40.x",
    "mp4a.ff",
    "dvh1.5.6",
    "constructor",
  ])("returns %j as unknown, labelled as written", (codec) => {
    expect(describeCodec(codec)).toEqual({
      codec,
      kind: "unknown",
      name: codec,
      profile: undefined,
      level: undefined,
      label: codec,
    });
  });

  it("trims whitespace", () => {
    expect(describeCodec(" mp4a.40.2 ").codec).toBe("mp4a.40.2");
  });
});

describe("describeCodecs", () => {
  it("splits a CODECS value", () => {
    expect(describeCodecs("avc1.640028, mp4a.40.2,,").map((codec) => codec.label)).toEqual([
      "H.264 High 4.0",
      "AAC-LC",
    ]);
    expect(describeCodecs("")).toEqual([]);
  });
});
