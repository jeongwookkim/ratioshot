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
  // LOCALE=en-US: make navigator.language report that locale for this navigation.
  if (process.env.LOCALE) {
    const ua = (await send("Browser.getVersion")).result.userAgent;
    await send("Emulation.setUserAgentOverride", { userAgent: ua, acceptLanguage: process.env.LOCALE });
    await send("Emulation.setLocaleOverride", { locale: process.env.LOCALE });
  }
  await send("Page.navigate", { url: rest[0] });
  await new Promise((r) => setTimeout(r, 2500));
  const r = await send("Runtime.evaluate", { expression: "location.href", returnByValue: true });
  console.log(r.result.result.value);
} else if (cmd === "upload") {
  // upload "<button text>" <nth> <file...>: click the nth button with that text, catch the file
  // chooser it opens, and hand it the files.
  const [text, nth, ...files] = rest;
  const chosen = new Promise((resolve) => ws.addEventListener("message", (e) => { const m = JSON.parse(e.data); if (m.method === "Page.fileChooserOpened") resolve(m.params); }));
  await send("Page.enable");
  await send("Page.setInterceptFileChooserDialog", { enabled: true });
  // A file chooser needs a real (trusted) click, so click through the input domain.
  const r = await send("Runtime.evaluate", { expression: `(() => { const b=[...document.querySelectorAll('button')].filter(e=>e.innerText.trim()===${JSON.stringify(text)})[${+nth}]; b.scrollIntoView({block:'center'}); const q=b.getBoundingClientRect(); return JSON.stringify({x:q.x+q.width/2,y:q.y+q.height/2}); })()`, returnByValue: true });
  const { x, y } = JSON.parse(r.result.result.value);
  await new Promise((r) => setTimeout(r, 300));
  await send("Input.dispatchMouseEvent", { type: "mouseMoved", x, y });
  await send("Input.dispatchMouseEvent", { type: "mousePressed", x, y, button: "left", clickCount: 1 });
  await send("Input.dispatchMouseEvent", { type: "mouseReleased", x, y, button: "left", clickCount: 1 });
  const ev = await Promise.race([chosen, new Promise((r) => setTimeout(() => r(null), 8000))]);
  if (!ev) { console.error("no file chooser opened"); process.exit(5); }
  await send("DOM.setFileInputFiles", { files: files.map((f) => f.startsWith("/") ? f : process.cwd() + "/" + f), backendNodeId: ev.backendNodeId });
  await send("Page.setInterceptFileChooserDialog", { enabled: false });
  console.log(`uploaded ${files.length} file(s) (${ev.mode})`);
} else if (cmd === "setfile") {
  // setfile <nth input[type=file]> <file...>: hand files straight to an existing file input.
  const [nth, ...files] = rest;
  const doc = await send("DOM.getDocument", { depth: 0 });
  const q = await send("DOM.querySelectorAll", { nodeId: doc.result.root.nodeId, selector: "input[type=file]" });
  const nodeId = q.result.nodeIds[+nth];
  if (!nodeId) { console.error("no such file input"); process.exit(6); }
  await send("DOM.setFileInputFiles", { nodeId, files: files.map((f) => f.startsWith("/") ? f : process.cwd() + "/" + f) });
  console.log(`set ${files.length} file(s) on input #${nth}`);
} else if (cmd === "asset") {
  // asset <nth "애셋 추가" button> <file...>: Play Console asset library flow — open the panel with a
  // trusted click, upload each file through its file input, select them all, press 추가.
  const [nth, ...files] = rest;
  const click = async (x, y) => {
    await send("Input.dispatchMouseEvent", { type: "mouseMoved", x, y });
    await send("Input.dispatchMouseEvent", { type: "mousePressed", x, y, button: "left", clickCount: 1 });
    await send("Input.dispatchMouseEvent", { type: "mouseReleased", x, y, button: "left", clickCount: 1 });
  };
  const evalJson = async (expr) => JSON.parse((await send("Runtime.evaluate", { expression: expr, returnByValue: true })).result.result.value);
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const btn = await evalJson(`(() => { const b=[...document.querySelectorAll('button')].filter(e=>e.innerText.trim()==='애셋 추가')[${+nth}]; b.scrollIntoView({block:'center'}); const q=b.getBoundingClientRect(); return JSON.stringify({x:q.x+q.width/2,y:q.y+q.height/2}); })()`);
  await sleep(300);
  await click(btn.x, btn.y);
  await sleep(1500);
  const doc = await send("DOM.getDocument", { depth: 0 });
  const names = [];
  for (const f of files) {
    const q = await send("DOM.querySelectorAll", { nodeId: doc.result.root.nodeId, selector: "input[type=file]" });
    const nodeId = q.result.nodeIds[0];
    if (!nodeId) { console.error("no file input in asset panel"); process.exit(6); }
    await send("DOM.setFileInputFiles", { nodeId, files: [f.startsWith("/") ? f : process.cwd() + "/" + f] });
    names.push(f.split("/").pop());
    await sleep(4000);
  }
  // Select every uploaded card: hover its thumbnail, click the selection circle at its top-left.
  for (const name of names) {
    const img = await evalJson(`(() => { const t=[...document.querySelectorAll('*')].find(e=>e.childElementCount===0 && e.innerText && e.innerText.trim()===${JSON.stringify(name)}); if(!t) return 'null'; const card=t.closest('[role=listitem], li, div'); const im=[...card.parentElement.querySelectorAll('img')][0] || card.querySelector('img'); const q=(im||card).getBoundingClientRect(); return JSON.stringify({x:q.x+q.width/2,y:q.y+q.height/2,w:q.width,h:q.height}); })()`);
    if (!img) { console.error("card not found: " + name); process.exit(7); }
    await send("Input.dispatchMouseEvent", { type: "mouseMoved", x: img.x, y: img.y });
    await sleep(400);
    await click(img.x - 21, img.y - 21); // selection circle at the thumbnail top-left
    await sleep(500);
  }
  const add = await evalJson(`(() => { const b=[...document.querySelectorAll('button')].find(e=>e.getAttribute('aria-label')==='추가'); if(!b) return 'null'; const q=b.getBoundingClientRect(); return JSON.stringify({x:q.x+q.width/2,y:q.y+q.height/2}); })()`);
  if (!add) { console.error("no 추가 button (selection failed)"); process.exit(8); }
  await click(add.x, add.y);
  await sleep(2500);
  console.log(`placed ${names.length} asset(s) into slot #${nth}`);
} else if (cmd === "click") {
  // click "<exact text>" [nth] [selector]: trusted mouse click on the nth element with that text.
  const [text, nth = "0", sel = "button, a, [role=option], [role=menuitem], [role=radio], [role=checkbox], label, span, div"] = rest;
  const r = await send("Runtime.evaluate", { expression: `(() => { const all=[...document.querySelectorAll(${JSON.stringify(sel)})].filter(e=>e.innerText && e.innerText.trim()===${JSON.stringify(text)} && e.getBoundingClientRect().width>0); const b=all[${+nth}]; if(!b) return 'null'; b.scrollIntoView({block:'center'}); const q=b.getBoundingClientRect(); return JSON.stringify({x:q.x+q.width/2,y:q.y+q.height/2,n:all.length}); })()`, returnByValue: true });
  const v = JSON.parse(r.result.result.value);
  if (!v) { console.error("not found: " + text); process.exit(9); }
  await new Promise((r) => setTimeout(r, 250));
  await send("Input.dispatchMouseEvent", { type: "mouseMoved", x: v.x, y: v.y });
  await send("Input.dispatchMouseEvent", { type: "mousePressed", x: v.x, y: v.y, button: "left", clickCount: 1 });
  await send("Input.dispatchMouseEvent", { type: "mouseReleased", x: v.x, y: v.y, button: "left", clickCount: 1 });
  console.log(`clicked "${text}" (${v.n} match)`);
} else if (cmd === "choose") {
  // choose <radio|checkbox> "<label prefix>": trusted click on the control whose nearby text starts with it.
  const [kind, text] = rest;
  const r = await send("Runtime.evaluate", { expression: `(() => { const ins=[...document.querySelectorAll('input[type=${kind}]')].filter(i=>i.getBoundingClientRect().width>0 || true); for (const i of ins) { let p=i; for(let k=0;k<7;k++){ p=p.parentElement; if(p && (p.innerText||'').trim()) break; } if ((p.innerText||'').trim().startsWith(${JSON.stringify(text)})) { p.scrollIntoView({block:'center'}); const q=(i.getBoundingClientRect().width>0? i : p).getBoundingClientRect(); return JSON.stringify({x:q.x+Math.min(q.width/2,12),y:q.y+Math.min(q.height/2,12), was:i.checked}); } } return 'null'; })()`, returnByValue: true });
  const v = JSON.parse(r.result.result.value);
  if (!v) { console.error("no control: " + text); process.exit(9); }
  await new Promise((r) => setTimeout(r, 250));
  await send("Input.dispatchMouseEvent", { type: "mouseMoved", x: v.x, y: v.y });
  await send("Input.dispatchMouseEvent", { type: "mousePressed", x: v.x, y: v.y, button: "left", clickCount: 1 });
  await send("Input.dispatchMouseEvent", { type: "mouseReleased", x: v.x, y: v.y, button: "left", clickCount: 1 });
  console.log(`chose "${text}"`);
} else if (cmd === "section") {
  // section "<heading>" "<button text>": click the first button with that text after the heading (DOM order).
  const [heading, text] = rest;
  const r = await send("Runtime.evaluate", { expression: `(() => { const all=[...document.querySelectorAll('*')]; const h=all.find(e=>e.childElementCount<=1 && e.innerText && e.innerText.trim().startsWith(${JSON.stringify(heading)}) && e.innerText.trim().length < ${JSON.stringify(heading)}.length + 12); if(!h) return 'null'; const btns=[...document.querySelectorAll('button, a')].filter(b=>b.innerText.trim()===${JSON.stringify(text)}); const b=btns.find(b=>h.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING); if(!b) return 'null'; b.scrollIntoView({block:'center'}); const q=b.getBoundingClientRect(); return JSON.stringify({x:q.x+q.width/2,y:q.y+q.height/2}); })()`, returnByValue: true });
  const v = JSON.parse(r.result.result.value);
  if (!v) { console.error("not found: " + heading + " / " + text); process.exit(9); }
  await new Promise((r) => setTimeout(r, 250));
  await send("Input.dispatchMouseEvent", { type: "mouseMoved", x: v.x, y: v.y });
  await send("Input.dispatchMouseEvent", { type: "mousePressed", x: v.x, y: v.y, button: "left", clickCount: 1 });
  await send("Input.dispatchMouseEvent", { type: "mouseReleased", x: v.x, y: v.y, button: "left", clickCount: 1 });
  console.log(`clicked "${text}" under "${heading}"`);
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
