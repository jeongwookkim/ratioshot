import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.ratioshot.camera",
  appName: "RatioShot",
  webDir: "dist",
  backgroundColor: "#000000",
  android: { backgroundColor: "#000000" },
  ios: { backgroundColor: "#000000", contentInset: "never" },
};

export default config;
