import { describe, expect, it } from "vitest";
import { dayBounds } from "../src/home/app-home.js";

describe("dayBounds", () => {
  it("spans the whole local day", () => {
    const { start, end } = dayBounds(new Date(2026, 10, 2, 15, 30));
    expect(new Date(start)).toEqual(new Date(2026, 10, 2, 0, 0, 0, 0));
    expect(new Date(end)).toEqual(new Date(2026, 10, 2, 23, 59, 59, 999));
  });
});
