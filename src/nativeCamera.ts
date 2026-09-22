// Native camera preview (Capacitor plugin) rendered behind a transparent web view. Starts in a
// fraction of the time getUserMedia needs in a WebView and captures at full sensor resolution.
import { Capacitor } from "@capacitor/core";
import { CameraPreview } from "@capacitor-community/camera-preview";
import type { Facing, Shot } from "./camera";

/** Sensor aspect assumed for the overlay before the first capture: every phone's max-res still is 4:3. */
export const NATIVE_FRAME = { w: 3, h: 4 };

let running = false;

/** Start the preview inside `el`'s box (CSS px). */
export async function startNative(el: HTMLElement, facing: Facing): Promise<void> {
  const r = el.getBoundingClientRect();
  // Only stop a preview the plugin still owns: stop() on a paused activity throws on the Java side.
  if (running && (await nativeRunning())) await CameraPreview.stop().catch(() => {});
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
    // Skip the plugin's own decode-rotate-re-encode of the full JPEG (seconds on a 12MP shot); the
    // camera writes the orientation into EXIF and the browser honours it when decoding.
    disableExifHeaderStripping: true,
    // Return a file path instead of pushing megabytes of base64 across the JS bridge.
    storeToFile: true,
  });
  running = true;
}

export async function stopNative(): Promise<void> {
  if (!running) return;
  running = false;
  if (await nativeRunning()) await CameraPreview.stop().catch(() => {});
}

export async function flipNative(): Promise<void> {
  await CameraPreview.flip();
}

/** True when the plugin still holds the camera (it drops it if the activity was paused). */
export async function nativeRunning(): Promise<boolean> {
  return (await CameraPreview.isCameraStarted().catch(() => ({ value: false }))).value;
}

/** Full-resolution JPEG from the native camera, decoded into a canvas. Slow-ish (decode of a 12MP JPEG). */
export async function captureNative(): Promise<Shot> {
  const { value } = await CameraPreview.capture({ quality: 90 });
  if (!value.startsWith("/")) return shotFromImage("data:image/jpeg;base64," + value);
  // Only the upright dimensions are needed here; the crops are cut natively from the file.
  const shot = await shotFromImage(Capacitor.convertFileSrc(value), true);
  return { ...shot, file: value };  // fileOffsetX is set by shotFromImage when the file is landscape
}

/** A preview-resolution frame, returned in well under a second: enough to show the pick screen at once. */
export async function captureSampleNative(): Promise<Shot> {
  const { value } = await CameraPreview.captureSample({ quality: 85 });
  return shotFromImage("data:image/jpeg;base64," + value);
}

async function shotFromImage(src: string, dimsOnly = false): Promise<Shot> {
  const img = new Image();
  img.src = src;
  await img.decode();
  // The preview box is portrait 3:4 and shows the sensor frame center-cropped to it. If the JPEG
  // comes back landscape (no EXIF rotation, as on some devices and the emulator), take the same
  // centered portrait crop so what is saved is what was framed.
  let sx = 0;
  let sw = img.naturalWidth;
  const sh = img.naturalHeight;
  if (sw > sh) {
    sw = Math.round((sh * NATIVE_FRAME.w) / NATIVE_FRAME.h);
    sx = Math.round((img.naturalWidth - sw) / 2);
  }
  const canvas = document.createElement("canvas");
  if (!dimsOnly) {
    canvas.width = sw;
    canvas.height = sh;
    canvas.getContext("2d")!.drawImage(img, sx, 0, sw, sh, 0, 0, sw, sh);
  }
  return { canvas, width: sw, height: sh, orientation: "portrait", fileOffsetX: sx };
}
