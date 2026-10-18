import { describe, expect, it } from "vitest";
import { AttributeReader, classifyValue, parseAttributeList } from "./attributes";

function entries(input: string): [string, string, string][] {
  return [...parseAttributeList(input).values].map(([name, value]) => [
    name,
    value.type,
    value.text,
  ]);
}

function reader(input: string): { attributes: AttributeReader; problems: string[] } {
  const problems: string[] = [];
  const attributes = new AttributeReader(parseAttributeList(input).values, (message) => {
    problems.push(message);
  });
  return { attributes, problems };
}

describe("parseAttributeList", () => {
  it("reads every value type of RFC 8216 §4.2", () => {
    expect(
      entries(
        'BANDWIDTH=1280000,FRAME-RATE=29.970,CODECS="avc1.4d401f,mp4a.40.2",RESOLUTION=1280x720,IV=0x0A1b,TIME-OFFSET=-12.5,HDCP-LEVEL=TYPE-0',
      ),
    ).toEqual([
      ["BANDWIDTH", "decimal-integer", "1280000"],
      ["FRAME-RATE", "decimal-floating-point", "29.970"],
      ["CODECS", "quoted-string", "avc1.4d401f,mp4a.40.2"],
      ["RESOLUTION", "decimal-resolution", "1280x720"],
      ["IV", "hexadecimal-sequence", "0x0A1b"],
      ["TIME-OFFSET", "signed-decimal-floating-point", "-12.5"],
      ["HDCP-LEVEL", "enumerated-string", "TYPE-0"],
    ]);
  });

  it("keeps commas, equals signs and spaces inside quoted strings", () => {
    expect(entries('NAME="Director, commentary",URI="a.m3u8?x=1&y=2",X-TITLE=" padded "')).toEqual([
      ["NAME", "quoted-string", "Director, commentary"],
      ["URI", "quoted-string", "a.m3u8?x=1&y=2"],
      ["X-TITLE", "quoted-string", " padded "],
    ]);
  });

  it("keeps empty quoted strings and unknown attributes", () => {
    expect(entries('CODECS="",X-COM-EXAMPLE-AD=YES')).toEqual([
      ["CODECS", "quoted-string", ""],
      ["X-COM-EXAMPLE-AD", "enumerated-string", "YES"],
    ]);
  });

  it("tolerates spaces around names and values and stray commas", () => {
    const list = parseAttributeList(
      ' BANDWIDTH = 800000 , ,RESOLUTION=640x360,  CODECS= "mp4a.40.2",',
    );
    expect([...list.values.keys()]).toEqual(["BANDWIDTH", "RESOLUTION", "CODECS"]);
    expect(list.values.get("CODECS")?.text).toBe("mp4a.40.2");
    expect(list.errors).toEqual([]);
  });

  it("reports an unclosed quote and keeps the rest of the line as the value", () => {
    const list = parseAttributeList('METHOD=AES-128,URI="key.bin,IV=0x1234');
    expect(list.values.get("URI")?.text).toBe("key.bin,IV=0x1234");
    expect(list.values.has("IV")).toBe(false);
    expect(list.errors).toEqual(["URI has no closing quote."]);
  });

  it("reports text after a closing quote", () => {
    const list = parseAttributeList('NAME="English"x,DEFAULT=YES');
    expect(list.values.get("NAME")?.text).toBe("English");
    expect(list.values.get("DEFAULT")?.text).toBe("YES");
    expect(list.errors).toEqual(["NAME has unexpected text after its closing quote: x"]);
  });

  it("reports names without values, empty values and missing names", () => {
    expect(parseAttributeList("AUTOSELECT,DEFAULT=,=YES").errors).toEqual([
      "AUTOSELECT has no value.",
      "DEFAULT has an empty value.",
      "An attribute has no name.",
    ]);
  });

  it("keeps the first of repeated names", () => {
    const list = parseAttributeList("BANDWIDTH=1,BANDWIDTH=2");
    expect(list.values.get("BANDWIDTH")?.text).toBe("1");
    expect(list.errors).toEqual(["BANDWIDTH appears more than once; the first value is used."]);
  });

  it("reports names outside A–Z, 0–9 and hyphens but keeps them", () => {
    const list = parseAttributeList("bandwidth=1");
    expect(list.values.get("bandwidth")?.text).toBe("1");
    expect(list.errors).toEqual([
      '"bandwidth" isn\'t a valid attribute name; names use A–Z, 0–9 and hyphens.',
    ]);
  });

  it("returns nothing for empty input", () => {
    expect(parseAttributeList("")).toEqual({ values: new Map(), errors: [] });
  });
});

describe("classifyValue", () => {
  it("tells numbers, hex, resolutions and enumerated strings apart", () => {
    expect(classifyValue("0")).toBe("decimal-integer");
    expect(classifyValue("6.")).toBe("decimal-floating-point");
    expect(classifyValue(".5")).toBe("decimal-floating-point");
    expect(classifyValue("-0.5")).toBe("signed-decimal-floating-point");
    expect(classifyValue("0XFF")).toBe("hexadecimal-sequence");
    expect(classifyValue("0x")).toBe("enumerated-string");
    expect(classifyValue("1920x1080")).toBe("decimal-resolution");
    expect(classifyValue("1e6")).toBe("enumerated-string");
    expect(classifyValue("PQ")).toBe("enumerated-string");
  });
});

describe("AttributeReader", () => {
  it("reads typed values", () => {
    const { attributes, problems } = reader(
      'BANDWIDTH=800000,FRAME-RATE=23.976,RESOLUTION=640x360,IV=0x01,DEFAULT=YES,FORCED=NO,TYPE=AUDIO,NAME="English",TIME-OFFSET=-3',
    );
    expect(attributes.integer("BANDWIDTH")).toBe(800000);
    expect(attributes.float("FRAME-RATE")).toBe(23.976);
    expect(attributes.float("BANDWIDTH")).toBe(800000);
    expect(attributes.float("TIME-OFFSET", true)).toBe(-3);
    expect(attributes.resolution("RESOLUTION")).toEqual({ width: 640, height: 360 });
    expect(attributes.hex("IV")).toBe("0x01");
    expect(attributes.yesNo("DEFAULT")).toBe(true);
    expect(attributes.yesNo("FORCED")).toBe(false);
    expect(attributes.enumerated("TYPE", ["AUDIO", "VIDEO"])).toBe("AUDIO");
    expect(attributes.quoted("NAME")).toBe("English");
    expect(attributes.quoted("MISSING")).toBeUndefined();
    expect(problems).toEqual([]);
  });

  it("uses a misquoted value and reports it", () => {
    const { attributes, problems } = reader('CODECS=mp4a.40.2,RESOLUTION="1280x720",BANDWIDTH="5"');
    expect(attributes.quoted("CODECS")).toBe("mp4a.40.2");
    expect(attributes.resolution("RESOLUTION")).toEqual({ width: 1280, height: 720 });
    expect(attributes.integer("BANDWIDTH")).toBe(5);
    expect(problems).toEqual([
      "CODECS should be in quotes.",
      "RESOLUTION shouldn't be in quotes.",
      "BANDWIDTH shouldn't be in quotes.",
    ]);
  });

  it("drops values of the wrong type and reports them", () => {
    const { attributes, problems } = reader(
      "BANDWIDTH=1.5e6,FRAME-RATE=-30,RESOLUTION=1280*720,IV=1234,DEFAULT=TRUE,TYPE=MUSIC",
    );
    expect(attributes.integer("BANDWIDTH")).toBeUndefined();
    expect(attributes.float("FRAME-RATE")).toBeUndefined();
    expect(attributes.resolution("RESOLUTION")).toBeUndefined();
    expect(attributes.hex("IV")).toBeUndefined();
    expect(attributes.yesNo("DEFAULT")).toBeUndefined();
    expect(attributes.enumerated("TYPE", ["AUDIO", "VIDEO", "SUBTITLES"])).toBeUndefined();
    expect(problems).toEqual([
      'BANDWIDTH should be a whole number; found "1.5e6".',
      'FRAME-RATE should be a positive number; found "-30".',
      'RESOLUTION should look like 1920x1080; found "1280*720".',
      'IV should be a hexadecimal number like 0x1A2B; found "1234".',
      'DEFAULT should be YES or NO; found "TRUE".',
      'TYPE should be AUDIO, VIDEO or SUBTITLES; found "MUSIC".',
    ]);
  });

  it("reports missing required attributes", () => {
    const { attributes, problems } = reader("TYPE=AUDIO");
    expect(attributes.require("TYPE")).toBe(true);
    expect(attributes.require("GROUP-ID")).toBe(false);
    expect(problems).toEqual(["GROUP-ID is missing; it's required."]);
  });

  it("returns every attribute as written", () => {
    const { attributes } = reader('BANDWIDTH=800000,X-CUSTOM="a,b",FRAME-RATE=25.000');
    expect(attributes.record()).toEqual({
      BANDWIDTH: "800000",
      "X-CUSTOM": "a,b",
      "FRAME-RATE": "25.000",
    });
  });
});
