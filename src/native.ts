// Native (Capacitor) integrations. Every function is a no-op in a plain browser.
import { Capacitor } from "@capacitor/core";
import { AdMob, BannerAdPosition, BannerAdSize, BannerAdPluginEvents } from "@capacitor-community/admob";
import { Media } from "@capacitor-community/media";

export const isNative = Capacitor.isNativePlatform();

import { t } from "./i18n";

const ALBUM = t.album;
// Google's test banner unit unless a real one is injected by scripts/release-android.mjs.
const BANNER_ID = import.meta.env.VITE_ADMOB_BANNER || "ca-app-pub-3940256099942544/6300978111";
const BANNER_IS_TEST = !import.meta.env.VITE_ADMOB_BANNER;

/** Save JPEG blobs to the photo gallery (album "RatioShot"). */
export async function saveToGallery(files: { blob: Blob; name: string }[]): Promise<void> {
  let album = (await Media.getAlbums()).albums.find((a) => a.name === ALBUM);
  if (!album) {
    await Media.createAlbum({ name: ALBUM });
    album = (await Media.getAlbums()).albums.find((a) => a.name === ALBUM);
  }
  for (const f of files) {
    const dataUrl = await new Promise<string>((res, rej) => {
      const r = new FileReader();
      r.onload = () => res(r.result as string);
      r.onerror = () => rej(r.error);
      r.readAsDataURL(f.blob);
    });
    await Media.savePhoto({ path: dataUrl, albumIdentifier: album?.identifier, fileName: f.name.replace(/\.jpg$/, "") });
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
