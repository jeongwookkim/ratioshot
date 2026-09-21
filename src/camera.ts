import { isNative, saveToGallery } from "./native";
import { RATIOS, Ratio, RatioId, Rect, cropRect } from "./ratios";

export type Facing = "environment" | "user";

export async function openCamera(facing: Facing): Promise<MediaStream> {
  return navigator.mediaDevices.getUserMedia({
    audio: false,
    video: {
      facingMode: { ideal: facing },
      width: { ideal: 4096 },
      height: { ideal: 4096 },
    },
  });
}

/** Dev/test source when no camera is available (`?demo=1`): the sample photo if it loads, else a moving test pattern. */
export async function openDemoStream(): Promise<MediaStream> {
  const c = document.createElement("canvas");
  const ctx = c.getContext("2d")!;
  const photo = new Image();
  photo.src = "demo.jpg";
  const loaded = await new Promise<boolean>((res) => {
    photo.onload = () => res(true);
    photo.onerror = () => res(false);
  });
  c.width = loaded ? photo.naturalWidth : 1200;
  c.height = loaded ? photo.naturalHeight : 1600;
  let t = 0;
  const draw = () => {
    t += 1;
    if (loaded) {
      ctx.drawImage(photo, 0, 0);
    } else {
      const g = ctx.createLinearGradient(0, 0, c.width, c.height);
      g.addColorStop(0, "#1f2937");
      g.addColorStop(1, "#6b7280");
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, c.width, c.height);
      ctx.fillStyle = "#fbbf24";
      ctx.beginPath();
      ctx.arc(600 + Math.sin(t / 40) * 120, 700, 180, 0, Math.PI * 2);
      ctx.fill();
    }
    requestAnimationFrame(draw);
  };
  draw();
  return c.captureStream(30);
}

export interface Shot {
  canvas: HTMLCanvasElement;
  width: number;
  height: number;
  orientation: "portrait" | "landscape";
}

/** Grab the current full frame from the video element at stream resolution. */
export function captureFrame(video: HTMLVideoElement, mirror: boolean): Shot {
  const width = video.videoWidth;
  const height = video.videoHeight;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d")!;
  if (mirror) {
    ctx.translate(width, 0);
    ctx.scale(-1, 1);
  }
  ctx.drawImage(video, 0, 0, width, height);
  return { canvas, width, height, orientation: height >= width ? "portrait" : "landscape" };
}

export interface Crop {
  ratio: Ratio;
  rect: Rect;
  url: string;
  blob: Blob;
}

async function toBlob(canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("toBlob failed"))), type, quality),
  );
}

/** Produce one cropped JPEG per ratio from a shot. */
export async function cropAll(shot: Shot, ids: RatioId[]): Promise<Crop[]> {
  const out: Crop[] = [];
  for (const ratio of RATIOS.filter((r) => ids.includes(r.id))) {
    const rect = cropRect(shot.width, shot.height, ratio);
    const c = document.createElement("canvas");
    c.width = Math.round(rect.w);
    c.height = Math.round(rect.h);
    c.getContext("2d")!.drawImage(shot.canvas, rect.x, rect.y, rect.w, rect.h, 0, 0, c.width, c.height);
    const blob = await toBlob(c, "image/jpeg", 0.92);
    out.push({ ratio, rect, blob, url: URL.createObjectURL(blob) });
  }
  return out;
}

/** Save files: gallery album in the native app, share sheet on mobile web, download links elsewhere. */
export async function saveCrops(crops: Crop[]): Promise<"saved" | "shared" | "downloaded"> {
  const stamp = new Date().toISOString().replace(/[-:T]/g, "").slice(0, 14);
  const files = crops.map(
    (c) => new File([c.blob], `multishot_${stamp}_${c.ratio.id.replace(":", "x")}.jpg`, { type: "image/jpeg" }),
  );
  if (isNative) {
    await saveToGallery(files.map((f) => ({ blob: f, name: f.name })));
    return "saved";
  }
  const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
  if (nav.share && nav.canShare?.({ files })) {
    try {
      await nav.share({ files });
      return "shared";
    } catch (e) {
      if ((e as Error).name === "AbortError") throw e;
    }
  }
  for (const f of files) {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(f);
    a.download = f.name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 10_000);
  }
  return "downloaded";
}
