import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Crop,
  Facing,
  Shot,
  captureFrame,
  cropAll,
  openCamera,
  openDemoStream,
  saveCrops,
} from "./camera";
import { t } from "./i18n";
import { showBanner } from "./native";
import { packRows } from "./pack";
import {
  DEFAULT_ENABLED,
  RATIOS,
  RatioId,
  Rect,
  cropRect,
  frameName,
} from "./ratios";

const STORAGE_KEY = "ratioshot.enabled";

function loadEnabled(): RatioId[] {
  try {
    const v = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "null");
    if (Array.isArray(v) && v.length)
      return v.filter((id) => RATIOS.some((r) => r.id === id));
  } catch {
    /* ignore */
  }
  return DEFAULT_ENABLED;
}

export function App() {
  const [enabled, setEnabled] = useState<RatioId[]>(loadEnabled);
  const [shot, setShot] = useState<Shot | null>(null);
  const [lastSaved, setLastSaved] = useState<string | null>(null);

  useEffect(
    () => localStorage.setItem(STORAGE_KEY, JSON.stringify(enabled)),
    [enabled],
  );
  // Native banner ad sits below the web view; keep the bottom bars above it.
  useEffect(() => {
    showBanner((px) => document.documentElement.style.setProperty("--ad-bottom", `${px}px`)).catch(() => {});
  }, []);

  const toggle = (id: RatioId) =>
    setEnabled((cur) =>
      cur.includes(id)
        ? cur.length > 1
          ? cur.filter((x) => x !== id)
          : cur
        : [...cur, id],
    );

  if (shot) {
    return (
      <Review
        shot={shot}
        preselect={enabled}
        onBack={() => setShot(null)}
        onSaved={(url) => setLastSaved(url)}
      />
    );
  }
  return (
    <Camera
      enabled={enabled}
      onToggle={toggle}
      onShot={setShot}
      lastSaved={lastSaved}
    />
  );
}

/* ---------------- camera ---------------- */

interface CameraProps {
  enabled: RatioId[];
  onToggle: (id: RatioId) => void;
  onShot: (s: Shot) => void;
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

  useEffect(() => {
    let stream: MediaStream | null = null;
    let cancelled = false;
    setError(null);
    setFrame(null);
    (async () => {
      try {
        stream = demo ? await openDemoStream() : await openCamera(facing);
        if (cancelled) return;
        const v = videoRef.current!;
        v.srcObject = stream;
        await v.play();
        setFrame({ w: v.videoWidth, h: v.videoHeight });
      } catch (e) {
        setError(
          (e as Error).name === "NotAllowedError"
            ? t.cameraDenied
            : (e as Error).message,
        );
      }
    })();
    return () => {
      cancelled = true;
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, [facing, demo]);

  useEffect(() => {
    const el = stageRef.current!;
    const ro = new ResizeObserver(([e]) =>
      setBox({ w: e.contentRect.width, h: e.contentRect.height }),
    );
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // object-fit: contain mapping from sensor px to viewport px
  const layout = useMemo(() => {
    if (!frame || !box.w || !box.h) return null;
    const s = Math.min(box.w / frame.w, box.h / frame.h);
    return { s, ox: (box.w - frame.w * s) / 2, oy: (box.h - frame.h * s) / 2 };
  }, [frame, box]);

  const frames = useMemo(() => {
    if (!frame || !layout) return [];
    const list = RATIOS.filter((r) => enabled.includes(r.id)).map((r) => ({
      r,
      rect: cropRect(frame.w, frame.h, r),
    }));
    // biggest first so small frames paint on top
    return list.sort((a, b) => b.rect.w * b.rect.h - a.rect.w * a.rect.h);
  }, [frame, layout, enabled]);

  const shoot = useCallback(() => {
    const v = videoRef.current;
    if (!v || !frame) return;
    setFlash(true);
    const s = captureFrame(v, mirror);
    setTimeout(() => onShot(s), 180);
  }, [frame, mirror, onShot]);

  const toScreen = (rect: Rect) =>
    layout
      ? {
          left: layout.ox + rect.x * layout.s,
          top: layout.oy + rect.y * layout.s,
          width: rect.w * layout.s,
          height: rect.h * layout.s,
        }
      : {};

  return (
    <div className="cam">
      <div className="cam-top">
        <span className="icon" aria-hidden>
          <GearIcon />
        </span>
        <span className="title">RatioShot</span>
        <span className="res">
          {frame ? frameName(frame.w, frame.h) : "--"}
        </span>
      </div>

      <div className="viewport">
        <div className="stage" ref={stageRef}>
          <video
            ref={videoRef}
            playsInline
            muted
            autoPlay
            className={mirror ? "mirror" : undefined}
          />
          <div className="frames">
            {frames.map(({ r, rect }, i) => (
              <div
                key={r.id}
                className="frame"
                style={{ ...toScreen(rect), "--c": r.color, zIndex: i + 1 }}
              >
                {r.id !== "orig" && (
                  <span className="chip">
                    {r.name} {t.short[r.label]}
                  </span>
                )}
              </div>
            ))}
          </div>
          <div
            className={`flash${flash ? " on" : ""}`}
            onAnimationEnd={() => setFlash(false)}
          />
        </div>

        <div className="pills">
          {RATIOS.map((r) => (
            <button
              key={r.id}
              className={`pill${enabled.includes(r.id) ? "" : " off"}`}
              style={{ "--c": r.color }}
              onClick={() => onToggle(r.id)}
              aria-pressed={enabled.includes(r.id)}
            >
              <span className="r">{r.id === "orig" ? t.full : r.name}</span>
              <span className="l">
                {t.short[r.label]}
              </span>
            </button>
          ))}
        </div>

        {error && (
          <div className="cam-error">
            <div>
              <b>{t.cameraError}</b>
              {error}
            </div>
          </div>
        )}
      </div>

      <div className="cam-bottom">
        <div className="thumb">
          {lastSaved && <img src={lastSaved} alt="" />}
        </div>
        <button
          className="shutter"
          onClick={shoot}
          disabled={!frame}
          aria-label={t.shoot}
        />
        <button
          className="flip"
          onClick={() =>
            setFacing((f) => (f === "user" ? "environment" : "user"))
          }
          aria-label={t.flip}
        >
          <FlipIcon />
        </button>
        <div className="modes">
          <span className="on">{t.modePhoto}</span>
        </div>
      </div>
    </div>
  );
}

/* ---------------- review ---------------- */

interface ReviewProps {
  shot: Shot;
  preselect: RatioId[];
  onBack: () => void;
  onSaved: (thumbUrl: string) => void;
}

function Review({ shot, preselect, onBack, onSaved }: ReviewProps) {
  const [crops, setCrops] = useState<Crop[] | null>(null);
  const [selected, setSelected] = useState<Set<RatioId>>(
    () => new Set(preselect),
  );
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    cropAll(
      shot,
      RATIOS.map((r) => r.id),
    ).then((c) => alive && setCrops(c));
    return () => {
      alive = false;
    };
  }, [shot]);

  const toggle = (id: RatioId) =>
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  const save = async () => {
    if (!crops || !selected.size) return;
    setBusy(true);
    try {
      const picked = crops.filter((c) => selected.has(c.ratio.id));
      const how = await saveCrops(picked);
      onSaved(picked[0].url);
      setToast(
        how === "shared"
          ? t.sharedN(picked.length)
          : t.savedN(picked.length),
      );
    } catch (e) {
      if ((e as Error).name !== "AbortError")
        setToast(t.saveFailed + (e as Error).message);
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

      <Mosaic crops={crops ?? []} selected={selected} onToggle={toggle} />

      <div className="rv-actions">
        <button
          className="btn primary"
          onClick={save}
          disabled={!crops || busy || !selected.size}
        >
          {selected.size ? t.saveN(selected.size) : t.pickOne}
        </button>
        <button className="btn secondary" onClick={onBack}>
          {t.retake}
        </button>
      </div>
      {toast && (
        <div className="toast" onAnimationEnd={() => setToast(null)}>
          {toast}
        </div>
      )}
    </div>
  );
}

function Mosaic({
  crops,
  selected,
  onToggle,
}: {
  crops: Crop[];
  selected: Set<RatioId>;
  onToggle: (id: RatioId) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState({ w: 0, h: 0 });
  useEffect(() => {
    const ro = new ResizeObserver(([e]) =>
      setBox({ w: e.contentRect.width, h: e.contentRect.height }),
    );
    ro.observe(ref.current!);
    return () => ro.disconnect();
  }, []);
  // Fill the available area exactly: tiles keep their crop aspect, rows span full width.
  const tiles = useMemo(
    () =>
      box.w && crops.length
        ? packRows(crops, (c) => c.rect.w / c.rect.h, box.w, box.h)
        : [],
    [crops, box],
  );
  const height = tiles.reduce((m, t) => Math.max(m, t.y + t.h), 0);
  return (
    <div className="mosaic-wrap" ref={ref}>
      <div className="mosaic" style={{ height }}>
        {tiles.map(({ item: c, x, y, w, h }) => {
          const on = selected.has(c.ratio.id);
          return (
            <button
              key={c.ratio.id}
              className={`tile ${on ? "on" : "off"}`}
              style={{
                left: x,
                top: y,
                width: w,
                height: h,
                "--c": c.ratio.color,
              }}
              onClick={() => onToggle(c.ratio.id)}
              aria-pressed={on}
              aria-label={c.ratio.name}
            >
              <img src={c.url} alt="" />
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

const GearIcon = () => (
  <svg
    width="22"
    height="22"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" />
  </svg>
);
const FlipIcon = () => (
  <svg
    width="24"
    height="24"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M3 12a9 9 0 0 1 15.5-6.3L21 8" />
    <path d="M21 3v5h-5" />
    <path d="M21 12a9 9 0 0 1-15.5 6.3L3 16" />
    <path d="M3 21v-5h5" />
  </svg>
);
const BackIcon = () => (
  <svg
    width="26"
    height="26"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2.2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M15 5l-7 7 7 7" />
  </svg>
);
const TrashIcon = () => (
  <svg
    width="22"
    height="22"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M3 6h18" />
    <path d="M8 6V4h8v2" />
    <path d="M19 6l-1 14H6L5 6" />
    <path d="M10 11v6M14 11v6" />
  </svg>
);
const CheckIcon = () => (
  <svg
    width="16"
    height="16"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="3.5"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M5 12l5 5L20 7" />
  </svg>
);
