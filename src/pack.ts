/**
 * Gapless "justified rows" packing: every row spans the full width, so tiles with fixed aspect
 * ratios tile the container with no empty space. Tries every order and row split of the items
 * and keeps the layout whose total height is closest to `targetH` (the space available), with a
 * small penalty on uneven row heights.
 */
export interface Tile<T> {
  item: T;
  x: number;
  y: number;
  w: number;
  h: number;
}

export function packRows<T>(items: T[], aspect: (t: T) => number, width: number, targetH: number): Tile<T>[] {
  let best: { cost: number; rows: T[][] } | null = null;
  for (const order of permutations(items)) {
    for (let mask = 0; mask < 1 << (order.length - 1); mask++) {
      const rows: T[][] = [[]];
      order.forEach((it, i) => {
        rows[rows.length - 1].push(it);
        if (i < order.length - 1 && mask & (1 << i)) rows.push([]);
      });
      const heights = rows.map((row) => rowHeight(row, aspect, width));
      const total = heights.reduce((a, b) => a + b, 0);
      const mean = total / heights.length;
      const cost = Math.abs(total - targetH) + 0.1 * heights.reduce((c, h) => c + Math.abs(h - mean), 0);
      if (!best || cost < best.cost) best = { cost, rows };
    }
  }
  const out: Tile<T>[] = [];
  let y = 0;
  for (const row of best!.rows) {
    const h = rowHeight(row, aspect, width);
    let x = 0;
    for (const item of row) {
      const w = h * aspect(item);
      out.push({ item, x, y, w, h });
      x += w;
    }
    y += h;
  }
  return out;
}

function rowHeight<T>(row: T[], aspect: (t: T) => number, width: number): number {
  return width / row.reduce((s, t) => s + aspect(t), 0);
}

function* permutations<T>(arr: T[]): Generator<T[]> {
  if (arr.length <= 1) {
    yield arr;
    return;
  }
  for (let i = 0; i < arr.length; i++) {
    const rest = [...arr.slice(0, i), ...arr.slice(i + 1)];
    for (const p of permutations(rest)) yield [arr[i], ...p];
  }
}
