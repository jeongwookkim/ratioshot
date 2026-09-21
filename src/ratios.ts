import type { LabelKey } from "./i18n";

export type RatioId = "orig" | "3:2" | "4:5" | "1:1" | "16:9" | "9:16";

export interface Ratio {
  id: RatioId;
  /** Fixed orientation: 16:9 is always wide, 9:16 always tall. `orig` follows the sensor frame. */
  w: number;
  h: number;
  name: string;
  /** i18n key for the usage label (see i18n.ts). */
  label: LabelKey;
  color: string;
}

export const RATIOS: Ratio[] = [
  { id: "4:5", w: 4, h: 5, name: "4:5", label: "feed", color: "#ff5fa8" },
  { id: "1:1", w: 1, h: 1, name: "1:1", label: "profile", color: "#3ddc97" },
  { id: "16:9", w: 16, h: 9, name: "16:9", label: "thumbnail", color: "#3b9dff" },
  { id: "9:16", w: 9, h: 16, name: "9:16", label: "story", color: "#a76bff" },
  { id: "3:2", w: 3, h: 2, name: "3:2", label: "photo", color: "#ffc233" },
  { id: "orig", w: 0, h: 0, name: "FULL", label: "full", color: "#9a9aa0" },
];

export const DEFAULT_ENABLED: RatioId[] = ["4:5", "1:1", "16:9", "9:16"];

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Largest centered rect of `ratio` inside a `srcW x srcH` frame. The sensor frame is the source; every ratio is a centered crop. */
export function cropRect(srcW: number, srcH: number, ratio: Ratio): Rect {
  if (ratio.id === "orig") return { x: 0, y: 0, w: srcW, h: srcH };
  const target = ratio.w / ratio.h;
  const w = srcW / srcH > target ? srcH * target : srcW;
  const h = srcW / srcH > target ? srcH : srcW / target;
  return { x: (srcW - w) / 2, y: (srcH - h) / 2, w, h };
}

/** Human-readable aspect for the `orig` entry, e.g. "3:4" for a portrait 3024x4032 frame. */
export function frameName(w: number, h: number): string {
  const g = (a: number, b: number): number => (b ? g(b, a % b) : a);
  const d = g(w, h) || 1;
  return `${w / d}:${h / d}`;
}
