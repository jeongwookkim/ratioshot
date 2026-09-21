// One command for a Play build: web release build → Capacitor sync → signed .aab.
//
//   node scripts/release-android.mjs          app bundle for Google Play
//   node scripts/release-android.mjs --apk    an apk to install on a phone directly
//
// Signing: the keystore is ~/ratioshot-release.jks and its password lives in the macOS Keychain
// (added once with `security add-generic-password -a ratioshot -s ratioshot-keystore -U -w`).
// Without both, the build is signed with the debug key and Play will refuse it.
//
// AdMob: ids come from admob.env (not committed). Without it the app serves Google's test ads,
// which pay nothing — fine for a phone check, wrong for a store build. The build says which it used.
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, rmSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const apk = process.argv.includes("--apk");

const keystore = join(homedir(), "ratioshot-release.jks");
let signing = {};
if (existsSync(keystore)) {
  try {
    const pw = execFileSync("security", ["find-generic-password", "-a", "ratioshot", "-s", "ratioshot-keystore", "-w"], { encoding: "utf8" }).trim();
    if (pw) signing = { RATIOSHOT_KEYSTORE: keystore, RATIOSHOT_KEYSTORE_PASSWORD: pw, RATIOSHOT_KEY_ALIAS: "ratioshot" };
  } catch {
    /* no Keychain entry */
  }
}
console.log(`Signing: ${Object.keys(signing).length ? "release key from the Keychain" : "DEBUG KEY — Play will refuse this bundle"}`);

const admob = {};
const envFile = join(root, "admob.env");
if (existsSync(envFile)) {
  for (const line of readFileSync(envFile, "utf8").split("\n")) {
    const m = /^\s*([A-Z_]+)\s*=\s*(\S+)\s*$/.exec(line);
    if (m) admob[m[1]] = m[2];
  }
}
const appIdOk = /^ca-app-pub-\d{16}~\d{10}$/.test(admob.ADMOB_APP_ID ?? "");
const bannerOk = /^ca-app-pub-\d{16}\/\d{10}$/.test(admob.ADMOB_BANNER ?? "");
if ((admob.ADMOB_APP_ID && !appIdOk) || (admob.ADMOB_BANNER && !bannerOk)) throw new Error("admob.env: id does not look like an AdMob id");
const real = appIdOk && bannerOk;
console.log(real ? "AdMob: real ad units" : "AdMob: Google TEST ads (fill admob.env for a store build — test ads earn nothing)");

// Capacitor 8 compiles for Java 21. Prefer a JDK 21+ from java_home, else Android Studio's bundled runtime.
let javaHome = process.env.JAVA_HOME;
try { javaHome = execFileSync("/usr/libexec/java_home", ["-v", "21"], { encoding: "utf8" }).trim(); } catch { /* none registered */ }
const jbr = "/Applications/Android Studio.app/Contents/jbr/Contents/Home";
if (!javaHome && existsSync(jbr)) javaHome = jbr;
if (javaHome) console.log(`JAVA_HOME: ${javaHome}`);

const env = { ...process.env, ...signing, ...(javaHome ? { JAVA_HOME: javaHome } : {}), ...(real ? { ADMOB_APP_ID: admob.ADMOB_APP_ID, VITE_ADMOB_BANNER: admob.ADMOB_BANNER } : {}) };
const run = (cmd, args, cwd = root) => execFileSync(cmd, args, { cwd, stdio: "inherit", env });

run("npm", ["run", "build"]);
rmSync(join(root, "dist/demo.jpg"), { force: true }); // sample photo is for screenshots only
run("npx", ["cap", "sync", "android"]);
run("./gradlew", [apk ? "assembleRelease" : "bundleRelease", "-q"], join(root, "android"));

const out = apk ? "android/app/build/outputs/apk/release/app-release.apk" : "android/app/build/outputs/bundle/release/app-release.aab";
console.log(`\n${out}`);
