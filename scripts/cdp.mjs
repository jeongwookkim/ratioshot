// CDP driver for Chrome started with --remote-debugging-port=9222.
//   node scripts/cdp.mjs eval "<js>"     (TARGET=url-fragment env picks the tab)
//   node scripts/cdp.mjs type "<text>"
//   node scripts/cdp.mjs key Enter
//   node scripts/cdp.mjs shot out.png
//   node scripts/cdp.mjs newtab <url>
import { writeFileSync } from "node:fs";
const [cmd, ...rest] = process.argv.slice(2);
const frag = process.env.TARGET ?? "chatgpt.com";

if (cmd === "newtab") {
  const r = await fetch(`http://localhost:9222/json/new?${rest[0]}`, { method: "PUT" });
  console.log(JSON.stringify(await r.json()));
  process.exit(0);
}

const targets = await (await fetch("http://localhost:9222/json/list")).json();
const page = targets.find((t) => t.type === "page" && (process.env.TID ? t.id === process.env.TID : t.url.includes(frag)));
if (!page) { console.error("no page target for " + frag); process.exit(1); }

const ws = new WebSocket(page.webSocketDebuggerUrl);
let id = 0;
const pending = new Map();
const send = (method, params = {}) => {
  const msgId = ++id;
  ws.send(JSON.stringify({ id: msgId, method, params }));
  return new Promise((resolve) => pending.set(msgId, resolve));
};
ws.addEventListener("message", (e) => {
  const m = JSON.parse(e.data);
  if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
});
await new Promise((r) => ws.addEventListener("open", r));

if (cmd === "eval") {
  const res = await send("Runtime.evaluate", {
    expression: `(async () => { ${rest[0]} })()`,
    awaitPromise: true, returnByValue: true, userGesture: true,
  });
  if (res.result?.exceptionDetails) {
    console.error("EXCEPTION:", res.result.exceptionDetails.exception?.description);
    process.exit(2);
  }
  const v = res.result?.result?.value;
  console.log(typeof v === "string" ? v : JSON.stringify(v, null, 2));
} else if (cmd === "type") {
  await send("Input.insertText", { text: rest[0] });
  console.log("typed");
} else if (cmd === "key") {
  const key = { key: "Enter", code: "Enter", windowsVirtualKeyCode: 13, nativeVirtualKeyCode: 13, text: "\r" };
  await send("Input.dispatchKeyEvent", { type: "keyDown", ...key });
  await send("Input.dispatchKeyEvent", { type: "keyUp", ...key });
  console.log("key sent");
} else if (cmd === "nav-insecure") {
  // Ignore self-signed cert (vite basic-ssl) — session-scoped, so navigate within the same session.
  await send("Security.setIgnoreCertificateErrors", { ignore: true });
  await send("Page.enable");
  await send("Page.navigate", { url: rest[0] });
  await new Promise((r) => setTimeout(r, 2500));
  const r = await send("Runtime.evaluate", { expression: "location.href", returnByValue: true });
  console.log(r.result.result.value);
} else if (cmd === "call") {
  const res = await send(rest[0], rest[1] ? JSON.parse(rest[1]) : {});
  console.log(JSON.stringify(res.result ?? res.error));
} else if (cmd === "shot") {
  // W/H/DPR env: emulate a phone viewport for this capture (emulation is per-session).
  if (process.env.W) {
    await send("Emulation.setDeviceMetricsOverride", { width: +process.env.W, height: +process.env.H, deviceScaleFactor: +(process.env.DPR || 3), mobile: true });
    await new Promise((r) => setTimeout(r, 600));
  }
  await send("Page.bringToFront");
  const res = await send("Page.captureScreenshot", { format: "png" });
  writeFileSync(rest[0], Buffer.from(res.result.data, "base64"));
  console.log("saved " + rest[0]);
} else if (cmd === "download") {
  // download newest image in main (optional src fragment rest[1])
  const expression = `(async () => {
    const wanted = ${JSON.stringify(rest[1] ?? "")};
    let sources = [...new Set([...document.querySelectorAll('main img')].map((i) => i.src))];
    if (wanted) sources = sources.filter((s) => s.includes(wanted));
    if (!sources.length) return JSON.stringify({error: 'no image'});
    const src = sources[sources.length - 1];
    const buf = new Uint8Array(await (await fetch(src)).arrayBuffer());
    let bin = ''; for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode(...buf.subarray(i, i + 0x8000));
    return JSON.stringify({src, b64: btoa(bin)});
  })()`;
  const res = await send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
  const p = JSON.parse(res.result.result.value);
  if (p.error) { console.error(p.error); process.exit(3); }
  writeFileSync(rest[0], Buffer.from(p.b64, "base64"));
  console.log("saved " + rest[0] + " from " + p.src.slice(0, 80));
}
else if (cmd === "grab") {
  // Fetch newest main img via Network domain (fetch() is blocked by CORS on ChatGPT CDN).
  const events = [];
  ws.addEventListener("message", (e) => { const m = JSON.parse(e.data); if (m.method === "Network.responseReceived") events.push(m.params); });
  await send("Network.enable");
  const r = await send("Runtime.evaluate", { expression: `(() => { const s=[...new Set([...document.querySelectorAll('main img')].map(i=>i.src))]; const src=s[s.length-1]; const u=new URL(src); u.searchParams.set('cdpgrab', Date.now()); const i=new Image(); i.src=u.toString(); return u.toString(); })()`, returnByValue: true });
  const url = r.result.result.value;
  for (let i = 0; i < 100; i++) {
    const ev = events.find((p) => p.response.url === url);
    if (ev) {
      await new Promise((r) => setTimeout(r, 500));
      const body = await send("Network.getResponseBody", { requestId: ev.requestId });
      writeFileSync(rest[0], Buffer.from(body.result.body, "base64"));
      console.log("saved " + rest[0] + " " + ev.response.mimeType);
      ws.close(); process.exit(0);
    }
    await new Promise((r) => setTimeout(r, 200));
  }
  console.error("timeout waiting for image"); process.exit(4);
}
ws.close(); process.exit(0);
