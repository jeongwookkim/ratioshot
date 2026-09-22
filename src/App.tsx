import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Facing, Preview, Shot, captureFrame, cropAll, makePreviews, openCamera, openDemoStream, saveCrops, thumbnail } from "./camera";
import { t } from "./i18n";
import { isNative, showBanner } from "./native";
import { NATIVE_FRAME, captureNative, captureSampleNative, flipNative, startNative, stopNative } from "./nativeCamera";
import { packRows } from "./pack";
import { DEFAULT_ENABLED, RATIOS, RatioId, Rect, cropRect, frameName } from "./ratios";

const STORAGE_KEY = "ratioshot.enabled";

function loadEnabled(): RatioId[] {
  try {
    const v = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "null");
    if (Array.isArray(v) && v.length) return v.filter((id) => RATIOS.some((r) => r.id === id));
  } catch {
    /* ignore */
  }
  return DEFAULT_ENABLED;
}

interface Taken {
  /** What the pick screen shows: the full shot on the web, a quick preview-resolution frame in the app. */
  previews: Preview[];
  /** The full-resolution shot; in the app it may still be decoding while the user picks ratios. */
  full: Promise<Shot>;
}

export function App() {
  const [enabled, setEnabled] = useState<RatioId[]>(loadEnabled);
  const [taken, setTaken] = useState<Taken | null>(null);
  const [lastSaved, setLastSaved] = useState<string | null>(null);

  useEffect(() => localStorage.setItem(STORAGE_KEY, JSON.stringify(enabled)), [enabled]);
  // Native banner ad sits below the web view; keep the bottom bars above it.
  useEffect(() => {
    showBanner((px) => document.documentElement.style.setProperty("--ad-bottom", `${px}px`)).catch(() => {});
  }, []);

  const toggle = (id: RatioId) =>
    setEnabled((cur) => (cur.includes(id) ? (cur.length > 1 ? cur.filter((x) => x !== id) : cur) : [...cur, id]));

  // The camera stays mounted underneath the pick screen so the stream never restarts.
  return (
    <>
      <Camera
        enabled={enabled}
        onToggle={toggle}
        onShot={(quick, full) => setTaken({ previews: makePreviews(quick), full: full ?? Promise.resolve(quick) })}
        lastSaved={lastSaved}
      />
      {taken && <Review taken={taken} preselect={enabled} onBack={() => setTaken(null)} onSaved={setLastSaved} />}
    </>
  );
}

/* ---------------- camera ---------------- */

interface CameraProps {
  enabled: RatioId[];
  onToggle: (id: RatioId) => void;
  onShot: (quick: Shot, full?: Promise<Shot>) => void;
  lastSaved: string | null;
}

function Camera({ enabled, onToggle, onShot, lastSaved }: CameraProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const [facing, setFacing] = useState<Facing>("environment");
  const [error, setError] = useState<string | null>(null);
  const [frame, setFrame] = useState<{ w: number; h: number } | null>(null);
  const [box, setBox] = useState<{ w: number; h: number }>({ w: 0, h: 0 });
  const [flash, setFlash] = useState(false);
  const demo = new URLSearchParams(location.search).has("demo");
  const mirror = facing === "user" && !demo;

  const native = isNative && !demo;

  useEffect(() => {
    let stream: MediaStream | null = null;
    let cancelled = false;
    setError(null);
    setFrame(null);
    (async () => {
      try {
        if (native) {
          // Native preview sits behind the transparent web view, sized to the stage box.
          document.documentElement.classList.add("native-cam");
          await startNative(stageRef.current!, facing);
          if (cancelled) return;
          setFrame({ w: NATIVE_FRAME.w, h: NATIVE_FRAME.h });
          return;
        }
        stream = demo ? await openDemoStream() : await openCamera(facing);
        if (cancelled) {
          stream.getTracks().forEach((tr) => tr.stop());
          return;
        }
        const v = videoRef.current!;
        v.srcObject = stream;
        await v.play();
        setFrame({ w: v.videoWidth, h: v.videoHeight });
      } catch (e) {
        setError((e as Error).name === "NotAllowedError" ? t.cameraDenied : (e as Error).message);
      }
    })();
    return () => {
      cancelled = true;
      stream?.getTracks().forEach((tr) => tr.stop());
      if (native) void stopNative();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [native ? "native" : facing, demo]);

  useEffect(() => {
    const ro = new ResizeObserver(([e]) => setBox({ w: e.contentRect.width, h: e.contentRect.height }));
    ro.observe(stageRef.current!);
    return () => ro.disconnect();
  }, []);

  // object-fit: contain mapping from sensor px to stage px
  const layout = useMemo(() => {
    if (!frame || !box.w || !box.h) return null;
    const s = Math.min(box.w / frame.w, box.h / frame.h);
    return { s, ox: (box.w - frame.w * s) / 2, oy: (box.h - frame.h * s) / 2 };
  }, [frame, box]);

  const frames = useMemo(() => {
    if (!frame || !layout) return [];
    return RATIOS.filter((r) => enabled.includes(r.id))
      .map((r) => ({ r, rect: cropRect(frame.w, frame.h, r) }))
      .sort((a, b) => b.rect.w * b.rect.h - a.rect.w * a.rect.h); // biggest first so small frames paint on top
  }, [frame, layout, enabled]);

  const [capturing, setCapturing] = useState(false);
  const shoot = useCallback(async () => {
    if (!frame || capturing) return;
    setFlash(true);
    if (native) {
      setCapturing(true);
      try {
        // A preview-resolution frame first (fast) so the pick screen opens at once, then the
        // full-resolution capture, which the save step waits for. Sequential on purpose: the
        // Camera1 API misbehaves when a preview grab and a still capture overlap.
        const quick = await captureSampleNative();
        const full = captureNative();
        full.catch(() => {});
        onShot(quick, full);
      } catch (e) {
        setError((e as Error).message);
      } finally {
        setCapturing(false);
      }
      return;
    }
    const v = videoRef.current;
    if (!v) return;
    const s = captureFrame(v, mirror);
    // let the flash paint before the (synchronous) preview work
    requestAnimationFrame(() => requestAnimationFrame(() => onShot(s)));
  }, [frame, mirror, onShot, native, capturing]);

  const flip = () => {
    if (native) void flipNative();
    else setFacing((f) => (f === "user" ? "environment" : "user"));
  };

  const toScreen = (rect: Rect) =>
    layout
      ? { left: layout.ox + rect.x * layout.s, top: layout.oy + rect.y * layout.s, width: rect.w * layout.s, height: rect.h * layout.s }
      : {};

  return (
    <div className="cam">
      <div className="cam-top">
        <span className="title">RatioShot</span>
        <span className="res">{frame ? frameName(frame.w, frame.h) : "· · ·"}</span>
      </div>

      <div className="stage" ref={stageRef}>
        {!native && <video ref={videoRef} playsInline muted autoPlay className={mirror ? "mirror" : undefined} />}
        <div className="frames">
          {frames.map(({ r, rect }, i) => (
            <div key={r.id} className="frame" style={{ ...toScreen(rect), "--c": r.color, zIndex: i + 1 }}>
              {r.id !== "orig" && (
                <span className="chip">
                  {r.name} {t.short[r.label]}
                </span>
              )}
            </div>
          ))}
        </div>
        {!frame && !error && (
          <div className="starting">
            <span className="spinner" />
            {t.starting}
          </div>
        )}
        <div className={`flash${flash ? " on" : ""}`} onAnimationEnd={() => setFlash(false)} />
        {capturing && (
          <div className="busy">
            <span className="spinner" />
          </div>
        )}
        {error && (
          <div className="cam-error">
            <div>
              <b>{t.cameraError}</b>
              {error}
            </div>
          </div>
        )}
      </div>

      <div className="controls">
        <div className="chips">
          {RATIOS.map((r) => {
            const on = enabled.includes(r.id);
            return (
              <button key={r.id} className={`chipbtn${on ? " on" : ""}`} style={{ "--c": r.color }} onClick={() => onToggle(r.id)} aria-pressed={on}>
                <span className="r">{r.id === "orig" ? t.full : r.name}</span>
                <span className="l">{t.short[r.label]}</span>
              </button>
            );
          })}
        </div>
        <div className="bar">
          <div className="thumb">{lastSaved && <img src={lastSaved} alt="" />}</div>
          <button className="shutter" onClick={shoot} disabled={!frame || capturing} aria-label={t.shoot}>
            <span />
          </button>
          <button className="flip" onClick={flip} aria-label={t.flip}>
            <FlipIcon />
          </button>
        </div>
      </div>
    </div>
  );
}

/* ---------------- review ---------------- */

interface ReviewProps {
  taken: Taken;
  preselect: RatioId[];
  onBack: () => void;
  onSaved: (thumbUrl: string) => void;
}

function Review({ taken, preselect, onBack, onSaved }: ReviewProps) {
  const [selected, setSelected] = useState<Set<RatioId>>(() => new Set(preselect));
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const toggle = (id: RatioId) =>
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  const save = async () => {
    if (!selected.size || busy) return;
    setBusy(true);
    try {
      // Full-resolution encode happens here, only for what is being saved.
      const picked = await cropAll(await taken.full, [...selected]);
      const how = await saveCrops(picked);
      onSaved(thumbnail(taken.previews.find((p) => p.ratio.id === picked[0].ratio.id) ?? taken.previews[0]));
      setToast(how === "shared" ? t.sharedN(picked.length) : t.savedN(picked.length));
    } catch (e) {
      if ((e as Error).name !== "AbortError") setToast(t.saveFailed + (e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="review">
      <div className="rv-top">
        <button className="icon" onClick={onBack} aria-label={t.back}>
          <BackIcon />
        </button>
        <div>
          <h1>{t.pickTitle}</h1>
          <p>{t.pickSub}</p>
        </div>
        <button className="icon" onClick={onBack} aria-label={t.discard}>
          <TrashIcon />
        </button>
      </div>

      <Mosaic previews={taken.previews} selected={selected} onToggle={toggle} />

      <div className="rv-actions">
        <button className="btn secondary" onClick={onBack} disabled={busy}>
          {t.retake}
        </button>
        <button className="btn primary" onClick={save} disabled={busy || !selected.size}>
          {selected.size ? t.saveN(selected.size) : t.pickOne}
        </button>
      </div>
      {busy && (
        <div className="busy">
          <span className="spinner" />
          {t.saving}
        </div>
      )}
      {toast && (
        <div className="toast" onAnimationEnd={() => setToast(null)}>
          {toast}
        </div>
      )}
    </div>
  );
}

function Mosaic({ previews, selected, onToggle }: { previews: Preview[]; selected: Set<RatioId>; onToggle: (id: RatioId) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState({ w: 0, h: 0 });
  useEffect(() => {
    const ro = new ResizeObserver(([e]) => setBox({ w: e.contentRect.width, h: e.contentRect.height }));
    ro.observe(ref.current!);
    return () => ro.disconnect();
  }, []);
  // Fill the available area exactly: tiles keep their crop aspect, rows span full width.
  const tiles = useMemo(
    () => (box.w && previews.length ? packRows(previews, (p) => p.rect.w / p.rect.h, box.w, box.h) : []),
    [previews, box],
  );
  const height = tiles.reduce((m, tile) => Math.max(m, tile.y + tile.h), 0);
  return (
    <div className="mosaic-wrap" ref={ref}>
      <div className="mosaic" style={{ height }}>
        {tiles.map(({ item: p, x, y, w, h }) => {
          const on = selected.has(p.ratio.id);
          return (
            <button
              key={p.ratio.id}
              className={`tile ${on ? "on" : "off"}`}
              style={{ left: x, top: y, width: w, height: h, "--c": p.ratio.color }}
              onClick={() => onToggle(p.ratio.id)}
              aria-pressed={on}
              aria-label={p.ratio.name}
            >
              <span
                className="pic"
                ref={(el) => {
                  if (el && el.firstChild !== p.canvas) el.replaceChildren(p.canvas);
                }}
              />
              <span className="check">
                <CheckIcon />
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

/* ---------------- icons ---------------- */

const FlipIcon = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M3 12a9 9 0 0 1 15.5-6.3L21 8" />
    <path d="M21 3v5h-5" />
    <path d="M21 12a9 9 0 0 1-15.5 6.3L3 16" />
    <path d="M3 21v-5h5" />
  </svg>
);
const BackIcon = () => (
  <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M15 5l-7 7 7 7" />
  </svg>
);
const TrashIcon = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M3 6h18" />
    <path d="M8 6V4h8v2" />
    <path d="M19 6l-1 14H6L5 6" />
    <path d="M10 11v6M14 11v6" />
  </svg>
);
const CheckIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M5 12l5 5L20 7" />
  </svg>
);
