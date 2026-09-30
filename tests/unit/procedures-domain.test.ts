import { describe, expect, it } from "vitest";
import { parseLineList } from "@/modules/procedures/domain";

describe("parseLineList", () => {
  it("returns one trimmed item per non-empty line, in order", () => {
    expect(parseLineList("  Parte de baja \r\n\n DNI\n")).toEqual(["Parte de baja", "DNI"]);
  });

  it("drops exact duplicates, keeping the first occurrence", () => {
    expect(parseLineList("DNI\nNómina\nDNI")).toEqual(["DNI", "Nómina"]);
  });

  it("returns an empty list for blank input", () => {
    expect(parseLineList("  \n \n")).toEqual([]);
  });
});
