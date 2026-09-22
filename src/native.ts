// Native (Capacitor) integrations. Every function is a no-op in a plain browser.
import { Capacitor, registerPlugin } from "@capacitor/core";
import type { Crop } from "./camera";
import type { Ratio, Rect } from "./ratios";
import { AdMob, BannerAdPosition, BannerAdSize, BannerAdPluginEvents } from "@capacitor-community/admob";
import { Media } from "@capacitor-community/media";

export const isNative = Capacitor.isNativePlatform();

import { t } from "./i18n";

const ALBUM = t.album;
// Google's test banner unit unless a real one is injected by scripts/release-android.mjs.
const BANNER_ID = import.meta.env.VITE_ADMOB_BANNER || "ca-app-pub-3940256099942544/6300978111";
const BANNER_IS_TEST = !import.meta.env.VITE_ADMOB_BANNER;

interface RatioCropPlugin {
  crop(o: { path: string; quality: number; crops: { id: string; x: number; y: number; w: number; h: number }[] }): Promise<{
    files: { id: string; path: string; width: number; height: number }[];
  }>;
}
const RatioCrop = registerPlugin<RatioCropPlugin>("RatioCrop");

/** Cut the ratio crops out of the captured JPEG natively (android/.../RatioCropPlugin.java). */
export async function cropNative(file: string, wanted: { ratio: Ratio; rect: Rect }[], offsetX = 0): Promise<Crop[]> {
  const { files } = await RatioCrop.crop({
    path: file,
    quality: 92,
    crops: wanted.map(({ ratio, rect }) => ({ id: ratio.id, x: Math.round(rect.x + offsetX), y: Math.round(rect.y), w: Math.round(rect.w), h: Math.round(rect.h) })),
  });
  return wanted.map(({ ratio, rect }) => {
    const f = files.find((x) => x.id === ratio.id)!;
    return { ratio, rect, path: f.path, url: Capacitor.convertFileSrc(f.path) };
  });
}

/** Save photos to the gallery (album "RatioShot"): native file paths or web blobs. */
export async function saveToGallery(files: { blob?: Blob; path?: string; name: string }[]): Promise<void> {
  let album = (await Media.getAlbums()).albums.find((a) => a.name === ALBUM);
  if (!album) {
    await Media.createAlbum({ name: ALBUM });
    album = (await Media.getAlbums()).albums.find((a) => a.name === ALBUM);
  }
  for (const f of files) {
    const path =
      f.path ??
      (await new Promise<string>((res, rej) => {
        const r = new FileReader();
        r.onload = () => res(r.result as string);
        r.onerror = () => rej(r.error);
        r.readAsDataURL(f.blob!);
      }));
    await Media.savePhoto({ path, albumIdentifier: album?.identifier, fileName: f.name.replace(/\.jpg$/, "") });
  }
}

/** Anchored adaptive banner at the bottom. Reports its height so the UI can keep clear of it. */
export async function showBanner(onHeight: (px: number) => void): Promise<void> {
  if (!isNative) return;
  await AdMob.initialize();
  AdMob.addListener(BannerAdPluginEvents.SizeChanged, (size: { height: number }) => onHeight(size.height));
  await AdMob.showBanner({
    adId: BANNER_ID,
    adSize: BannerAdSize.ADAPTIVE_BANNER,
    position: BannerAdPosition.BOTTOM_CENTER,
    margin: 0,
    isTesting: BANNER_IS_TEST,
  });
}
