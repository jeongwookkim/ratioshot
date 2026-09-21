import { describe, expect, it } from "vitest";
import { RATIOS, cropRect, frameName } from "./ratios";

const r = (id: string) => RATIOS.find((x) => x.id === id)!;

describe("cropRect", () => {
  it("1:1 from portrait 3024x4032 is width-limited and centered", () => {
    expect(cropRect(3024, 4032, r("1:1"))).toEqual({ x: 0, y: 504, w: 3024, h: 3024 });
  });
  it("16:9 stays wide even from a portrait frame", () => {
    const c = cropRect(3024, 4032, r("16:9"));
    expect(c.w).toBe(3024);
    expect(c.h).toBe(1701);
    expect(c.y).toBeCloseTo(1165.5);
  });
  it("9:16 from portrait frame is height-limited", () => {
    const c = cropRect(3024, 4032, r("9:16"));
    expect(c.h).toBe(4032);
    expect(c.w).toBe(2268);
    expect(c.x).toBe(378);
  });
  it("orig is identity", () => {
    expect(cropRect(4032, 3024, r("orig"))).toEqual({ x: 0, y: 0, w: 4032, h: 3024 });
  });
  it("4:5 from landscape frame is height-limited", () => {
    const c = cropRect(4032, 3024, r("4:5"));
    expect(c.h).toBe(3024);
    expect(c.w).toBeCloseTo(2419.2);
  });
});

describe("frameName", () => {
  it("reduces sensor dimensions", () => {
    expect(frameName(3024, 4032)).toBe("3:4");
    expect(frameName(1920, 1080)).toBe("16:9");
  });
});
