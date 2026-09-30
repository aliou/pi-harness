import { describe, expect, it } from "vitest";
import { withoutUndefined } from "./object";

describe("withoutUndefined", () => {
  it("drops undefined fields and keeps key order", () => {
    const result = withoutUndefined({ a: 1, b: undefined, c: null, d: "x" });

    expect(result).toEqual({ a: 1, c: null, d: "x" });
    expect(Object.keys(result)).toEqual(["a", "c", "d"]);
  });

  it("keeps falsy values that are not undefined", () => {
    expect(withoutUndefined({ a: 0, b: "", c: false })).toEqual({
      a: 0,
      b: "",
      c: false,
    });
  });
});
