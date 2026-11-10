import { describe, expect, it } from "vitest";
import { extractRexToken, parseRexKind } from "./tokens";

describe("extractRexToken", () => {
  it("returns empty token right after the prefix", () => {
    expect(extractRexToken("@rex:")).toBe("");
    expect(extractRexToken("see @rex:")).toBe("");
  });

  it("returns the typed token", () => {
    expect(extractRexToken("@rex:session:hom")).toBe("session:hom");
    expect(extractRexToken("x @rex:block:block:01a")).toBe("block:block:01a");
  });

  it("returns undefined when no prefix at cursor", () => {
    expect(extractRexToken("hello world")).toBeUndefined();
    expect(extractRexToken("@rex: done")).toBeUndefined();
  });

  it("returns undefined inside a code span", () => {
    expect(extractRexToken("run `@rex:")).toBeUndefined();
  });
});

describe("parseRexKind", () => {
  it("parses kinds", () => {
    expect(parseRexKind("session:h")).toBe("session");
    expect(parseRexKind("block:")).toBe("block");
    expect(parseRexKind("hom")).toBeUndefined();
    expect(parseRexKind("")).toBeUndefined();
  });
});
