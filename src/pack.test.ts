import { describe, expect, it } from "vitest";
import { packRows } from "./pack";

describe("packRows", () => {
  const aspects = [0.8, 1, 16 / 9, 9 / 16, 1.5, 0.75];

  it("leaves no gaps: every row spans full width and rows stack without overlap", () => {
    const tiles = packRows(aspects, (a) => a, 390, 600);
    const rows = new Map<number, typeof tiles>();
    for (const t of tiles) rows.set(t.y, [...(rows.get(t.y) ?? []), t]);
    for (const row of rows.values()) {
      const width = row.reduce((s, t) => s + t.w, 0);
      expect(width).toBeCloseTo(390, 6);
      for (const t of row) expect(t.h).toBeCloseTo(row[0].h, 6);
    }
    const ys = [...rows.keys()].sort((a, b) => a - b);
    for (let i = 1; i < ys.length; i++) expect(ys[i]).toBeCloseTo(ys[i - 1] + rows.get(ys[i - 1])![0].h, 6);
  });

  it("keeps each tile's aspect ratio exactly", () => {
    for (const t of packRows(aspects, (a) => a, 390, 600)) expect(t.w / t.h).toBeCloseTo(t.item, 9);
  });

  it("total height lands near the available height", () => {
    const tiles = packRows(aspects, (a) => a, 390, 600);
    const total = tiles.reduce((m, t) => Math.max(m, t.y + t.h), 0);
    expect(Math.abs(total - 600)).toBeLessThan(60);
  });

  it("places every item once", () => {
    const tiles = packRows(aspects, (a) => a, 390, 600);
    expect(tiles.map((t) => t.item).sort()).toEqual([...aspects].sort());
  });
});
