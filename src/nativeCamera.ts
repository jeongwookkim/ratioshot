// Native camera preview (Capacitor plugin) rendered behind a transparent web view. Starts in a
// fraction of the time getUserMedia needs in a WebView and captures at full sensor resolution.
import { CameraPreview } from "@capacitor-community/camera-preview";
import type { Facing, Shot } from "./camera";

/** Sensor aspect assumed for the overlay before the first capture: every phone's max-res still is 4:3. */
export const NATIVE_FRAME = { w: 3, h: 4 };

let running = false;

/** Start the preview inside `el`'s box (CSS px). */
export async function startNative(el: HTMLElement, facing: Facing): Promise<void> {
  const r = el.getBoundingClientRect();
  if (running) await CameraPreview.stop().catch(() => {});
  await CameraPreview.start({
    position: facing === "user" ? "front" : "rear",
    x: Math.round(r.left),
    y: Math.round(r.top),
    width: Math.round(r.width),
    height: Math.round(r.height),
    toBack: true,
    disableAudio: true,
    enableHighResolution: true,
    lockAndroidOrientation: true,
  });
  running = true;
}

export async function stopNative(): Promise<void> {
  if (!running) return;
  running = false;
  await CameraPreview.stop().catch(() => {});
}

export async function flipNative(): Promise<void> {
  await CameraPreview.flip();
}

/** Full-resolution JPEG from the native camera, decoded into a canvas. */
export async function captureNative(): Promise<Shot> {
  const { value } = await CameraPreview.capture({ quality: 92 });
  const img = new Image();
  img.src = "data:image/jpeg;base64," + value;
  await img.decode();
  // The preview box is portrait 3:4 and shows the sensor frame center-cropped to it. If the JPEG
  // comes back landscape (no EXIF rotation, as on some devices and the emulator), take the same
  // centered portrait crop so what is saved is what was framed.
  let sx = 0;
  let sy = 0;
  let sw = img.naturalWidth;
  let sh = img.naturalHeight;
  if (sw > sh) {
    sw = Math.round((sh * NATIVE_FRAME.w) / NATIVE_FRAME.h);
    sx = Math.round((img.naturalWidth - sw) / 2);
  }
  const canvas = document.createElement("canvas");
  canvas.width = sw;
  canvas.height = sh;
  canvas.getContext("2d")!.drawImage(img, sx, sy, sw, sh, 0, 0, sw, sh);
  return { canvas, width: sw, height: sh, orientation: "portrait" };
}
