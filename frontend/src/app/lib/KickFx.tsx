import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { useLocation } from "react-router";

type Corner = "TL" | "TR" | "BL" | "BR";
const ALL_CORNERS: Corner[] = ["TL", "TR", "BL", "BR"];

interface Scene {
  id: number;
  goal: Corner;
  juggler: Corner;
}
interface Shot {
  id: number;
  sceneId: number;
  from: Corner;
  goal: Corner;
  style: 0 | 1 | 2 | 3; // outswing, inswing, s-curve, chip
  bounces: { x: number; y: number }[];
}

let counter = 0;
let lastFire = 0;
const listeners = new Set<() => void>();

/** Fire a shot toward the current scene's goal. Safe to call from anywhere. */
export function triggerKick() {
  if (typeof window === "undefined") return;
  if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
  listeners.forEach((l) => l());
}

// ---------- scene helpers ----------
function makeScene(prev?: Scene): Scene {
  const goalPool = prev ? ALL_CORNERS.filter((c) => c !== prev.goal) : ALL_CORNERS;
  const goal = goalPool[Math.floor(Math.random() * goalPool.length)];
  const jugglerPool = ALL_CORNERS.filter(
    (c) => c !== goal && (!prev || c !== prev.juggler),
  );
  const juggler =
    jugglerPool[Math.floor(Math.random() * jugglerPool.length)] ??
    ALL_CORNERS.filter((c) => c !== goal)[0];
  return { id: ++counter, goal, juggler };
}

function cornerXY(c: Corner, w: number, h: number, padX = 110, padY = 95) {
  return {
    x: c.endsWith("L") ? padX : w - padX,
    y: c.startsWith("T") ? padY : h - padY,
  };
}

function pickBounces(
  from: { x: number; y: number },
  to: { x: number; y: number },
  w: number,
  h: number,
) {
  // 0-2 deflection waypoints. We try to land them ON top of an actual UI element
  // so the ball visually "ricochets" off card edges / buttons / nav.
  const n = Math.random() < 0.35 ? 0 : Math.random() < 0.55 ? 1 : 2;
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const len = Math.hypot(dx, dy) || 1;
  const nx = -dy / len;
  const ny = dx / len;
  const pts: { x: number; y: number }[] = [];
  const slots = n === 1 ? [0.4 + Math.random() * 0.15] : [0.28 + Math.random() * 0.1, 0.62 + Math.random() * 0.1];
  for (const tSlot of slots.slice(0, n)) {
    const baseX = from.x + dx * tSlot;
    const baseY = from.y + dy * tSlot;
    let chosen: { x: number; y: number } | null = null;
    // probe a few offsets and prefer one that lands on a real DOM element (a UI card/button)
    for (let tries = 0; tries < 6 && !chosen; tries++) {
      const sign = Math.random() < 0.5 ? -1 : 1;
      const off = sign * (140 + Math.random() * 160);
      const px = baseX + nx * off;
      const py = baseY + ny * off - Math.random() * 70;
      if (typeof document !== "undefined" && px > 8 && px < w - 8 && py > 8 && py < h - 8) {
        const el = document.elementFromPoint(px, py) as HTMLElement | null;
        // skip our own overlay; prefer something visually solid
        if (el && !el.closest("[data-kickfx]")) {
          chosen = { x: px, y: py };
        }
      }
    }
    if (!chosen) {
      const sign = Math.random() < 0.5 ? -1 : 1;
      const off = sign * (160 + Math.random() * 140);
      chosen = {
        x: Math.max(20, Math.min(w - 20, baseX + nx * off)),
        y: Math.max(20, Math.min(h - 20, baseY + ny * off - 30)),
      };
    }
    pts.push(chosen);
  }
  return pts;
}

function makePath(
  from: { x: number; y: number },
  to: { x: number; y: number },
  style: 0 | 1 | 2 | 3,
  bounces: { x: number; y: number }[],
  N = 56,
) {
  // Polyline through (from, ...bounces, to). Each segment gets a small lateral
  // curve (according to style) and a gentle arc lift.
  const waypoints = [from, ...bounces, to];
  const segLens: number[] = [];
  let total = 0;
  for (let i = 0; i < waypoints.length - 1; i++) {
    const l = Math.hypot(
      waypoints[i + 1].x - waypoints[i].x,
      waypoints[i + 1].y - waypoints[i].y,
    );
    segLens.push(l);
    total += l;
  }
  const xs: number[] = [];
  const ys: number[] = [];
  for (let i = 0; i <= N; i++) {
    const t = i / N;
    const target = t * total;
    let acc = 0;
    let seg = 0;
    while (seg < segLens.length - 1 && acc + segLens[seg] < target) {
      acc += segLens[seg];
      seg++;
    }
    const sT = segLens[seg] > 0 ? (target - acc) / segLens[seg] : 0;
    const a = waypoints[seg];
    const b = waypoints[seg + 1];
    const sdx = b.x - a.x;
    const sdy = b.y - a.y;
    const sl = Math.hypot(sdx, sdy) || 1;
    const snx = -sdy / sl;
    const sny = sdx / sl;
    let lateral = 0;
    let lift = 0;
    if (style === 0) {
      lateral = 70 * Math.sin(sT * Math.PI);
      lift = -90 * Math.sin(sT * Math.PI);
    } else if (style === 1) {
      lateral = -70 * Math.sin(sT * Math.PI);
      lift = -90 * Math.sin(sT * Math.PI);
    } else if (style === 2) {
      lateral = 90 * Math.sin(sT * Math.PI * 2);
      lift = -110 * Math.sin(sT * Math.PI);
    } else {
      lateral = 25 * Math.sin(sT * Math.PI);
      lift = -200 * Math.sin(sT * Math.PI);
    }
    xs.push(a.x + sdx * sT + snx * lateral);
    ys.push(a.y + sdy * sT + sny * lateral + lift);
  }
  return { xs, ys };
}

// ---------- sketch SVGs ----------
function SketchBall({ size = 34 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <circle cx="32" cy="32" r="25" />
      <circle cx="32" cy="32" r="25" opacity="0.4" transform="translate(0.7 -0.4)" />
      <polygon points="32,17 22.5,24.2 26.4,36.2 37.6,36.2 41.5,24.2" />
      <path d="M32 17 L32 8" />
      <path d="M22.5 24.2 L13 21" />
      <path d="M41.5 24.2 L51 21" />
      <path d="M26.4 36.2 L21.5 48" />
      <path d="M37.6 36.2 L42.5 48" />
    </svg>
  );
}

function SketchBoot({ size = 86 }: { size?: number }) {
  // Soccer cleat silhouette. Toe at right (~80, 28). Anchor by transform.
  return (
    <svg
      width={size}
      height={(size * 50) / 90}
      viewBox="0 0 90 50"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      {/* ankle / sock cuff */}
      <path d="M58 8 Q66 4, 74 8 L75 22 Q70 24, 62 22 Z" />
      {/* boot body — heel left, pointed toe right */}
      <path d="M10 30 C 6 26, 8 20, 14 18 L 30 16 L 50 15 L 68 18 L 80 24 Q 84 28, 80 32 L 70 34 L 20 34 C 12 34, 10 33, 10 30 Z" />
      <path
        d="M10 30 C 6 26, 8 20, 14 18 L 30 16 L 50 15 L 68 18 L 80 24 Q 84 28, 80 32 L 70 34 L 20 34 C 12 34, 10 33, 10 30 Z"
        opacity="0.35"
        transform="translate(0.6 -0.4)"
      />
      {/* laces (Xs) */}
      <path d="M30 19 L38 27 M38 19 L30 27" strokeWidth="1.4" />
      <path d="M42 18 L50 26 M50 18 L42 26" strokeWidth="1.4" />
      {/* toe cap stitch */}
      <path d="M72 24 Q 78 28, 72 30" opacity="0.55" strokeWidth="1.3" />
      {/* sole studs */}
      <path d="M16 34 L16 38 M28 34 L28 38 M40 34 L40 38 M52 34 L52 38 M64 34 L64 38 M74 34 L74 38" />
    </svg>
  );
}

function SketchGoal({ size = 200 }: { size?: number }) {
  // viewBox 220x140. Frame is the bold outline; netting is light.
  const w = size;
  const h = (size * 140) / 220;
  return (
    <svg
      width={w}
      height={h}
      viewBox="0 0 220 140"
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      {/* back netting perspective */}
      <path
        d="M30 115 L30 35 L15 22 L205 22 L190 35 L190 115 Z"
        strokeWidth="1"
        opacity="0.2"
      />
      {/* back diagonals */}
      <path d="M30 35 L190 115" strokeWidth="1" opacity="0.28" />
      <path d="M190 35 L30 115" strokeWidth="1" opacity="0.28" />
      {/* back verticals */}
      <path d="M70 35 L70 115" strokeWidth="1" opacity="0.22" />
      <path d="M110 35 L110 115" strokeWidth="1" opacity="0.22" />
      <path d="M150 35 L150 115" strokeWidth="1" opacity="0.22" />
      {/* back horizontals */}
      <path d="M30 55 L190 55" strokeWidth="1" opacity="0.22" />
      <path d="M30 80 L190 80" strokeWidth="1" opacity="0.22" />
      <path d="M30 105 L190 105" strokeWidth="1" opacity="0.22" />
      {/* frame */}
      <path d="M30 115 L30 35 L190 35 L190 115" strokeWidth="2.6" />
      <path
        d="M30 115 L30 35 L190 35 L190 115"
        strokeWidth="2.6"
        opacity="0.4"
        transform="translate(0.8 -0.5)"
      />
      {/* ground line */}
      <path d="M5 117 L215 117" strokeWidth="1.6" />
      <path d="M5 117 L215 117" strokeWidth="1" opacity="0.3" transform="translate(1 1)" />
    </svg>
  );
}

// ---------- corner placement helpers ----------
function cornerStyle(c: Corner): React.CSSProperties {
  const base: React.CSSProperties = { position: "absolute" };
  if (c === "TL") return { ...base, top: 12, left: 12 };
  if (c === "TR") return { ...base, top: 12, right: 12 };
  if (c === "BL") return { ...base, bottom: 12, left: 12 };
  return { ...base, bottom: 12, right: 12 };
}

// ---------- juggling boot at a corner ----------
function JugglingBoot({
  corner,
  kicking,
  compact,
}: {
  corner: Corner;
  kicking: boolean;
  compact: boolean;
}) {
  const facesRight = corner.endsWith("L");
  const containerW = compact ? 78 : 110;
  const containerH = compact ? 96 : 130;
  const ballSize = compact ? 18 : 26;
  const bootSize = compact ? 50 : 70;
  const jumpFrom = compact ? 44 : 60;
  return (
    <div
      style={{
        ...cornerStyle(corner),
        width: containerW,
        height: containerH,
        color: "currentColor",
      }}
      className={compact ? "text-foreground/15" : "text-foreground/25"}
      aria-hidden
    >
      {!kicking && (
        <motion.div
          className="absolute"
          style={{
            left: facesRight ? containerW * 0.35 : containerW * 0.4,
            top: 0,
            width: ballSize,
            height: ballSize,
            mixBlendMode: "multiply",
          }}
          initial={{ y: jumpFrom }}
          animate={{
            y: [jumpFrom, 0, jumpFrom, 0, jumpFrom],
            rotate: [0, 180, 360, 540, 720],
          }}
          transition={{
            duration: 3.0,
            repeat: Infinity,
            ease: "easeInOut",
            times: [0, 0.25, 0.5, 0.75, 1],
          }}
        >
          <SketchBall size={ballSize} />
        </motion.div>
      )}
      <motion.div
        className="absolute"
        style={{
          bottom: 0,
          left: facesRight ? 0 : "auto",
          right: facesRight ? "auto" : 0,
          width: bootSize,
          transformOrigin: facesRight
            ? `${bootSize - 10}px ${bootSize * 0.34}px`
            : `10px ${bootSize * 0.34}px`,
          mixBlendMode: "multiply",
          transform: facesRight ? undefined : "scaleX(-1)",
        }}
        initial={{ rotate: -10 }}
        animate={{ rotate: [-10, -26, -10, -26, -10] }}
        transition={{
          duration: 3.0,
          repeat: Infinity,
          ease: "easeInOut",
          times: [0, 0.25, 0.5, 0.75, 1],
        }}
      >
        <SketchBoot size={bootSize} />
      </motion.div>
    </div>
  );
}

// ---------- goal post at a corner ----------
function GoalAtCorner({ corner, compact }: { corner: Corner; compact: boolean }) {
  const flipY = corner.startsWith("T");
  const flipX = corner.endsWith("R");
  const size = compact ? 140 : 210;
  return (
    <div
      style={{
        ...cornerStyle(corner),
        width: size,
        color: "currentColor",
        transform: `${flipX ? "scaleX(-1)" : ""} ${flipY ? "scaleY(-1)" : ""}`.trim(),
      }}
      className={compact ? "text-foreground/18" : "text-foreground/28"}
      aria-hidden
    >
      <SketchGoal size={size} />
    </div>
  );
}

// ---------- one shot animation ----------
function ShotBall({
  shot,
  dims,
  compact,
}: {
  shot: Shot;
  dims: { w: number; h: number };
  compact: boolean;
}) {
  const ballSize = compact ? 24 : 34;
  const maxOpacity = compact ? 0.38 : 0.5;
  const from = useMemo(() => cornerXY(shot.from, dims.w, dims.h), [shot.from, dims]);
  const to = useMemo(() => cornerXY(shot.goal, dims.w, dims.h, 140, 110), [shot.goal, dims]);
  const path = useMemo(
    () => makePath(from, to, shot.style, shot.bounces),
    [from, to, shot.style, shot.bounces],
  );

  const N = path.xs.length;
  const rotateTotal = shot.style === 1 ? -720 : shot.style === 2 ? 540 : 720;
  const rotates = useMemo(
    () => Array.from({ length: N }, (_, i) => (rotateTotal * i) / (N - 1)),
    [N, rotateTotal],
  );
  const scales = useMemo(() => {
    return Array.from({ length: N }, (_, i) => {
      const t = i / (N - 1);
      // small grows past apex, shrinks into goal
      return 0.75 + 0.35 * Math.sin(t * Math.PI) - 0.25 * t;
    });
  }, [N]);
  const opacities = useMemo(() => {
    return Array.from({ length: N }, (_, i) => {
      const t = i / (N - 1);
      if (t < 0.05) return 0;
      if (t < 0.12) return maxOpacity;
      if (t > 0.95) return 0;
      return maxOpacity;
    });
  }, [N, maxOpacity]);

  const duration = shot.style === 3 ? 1.7 : shot.style === 2 ? 1.55 : 1.35;

  return (
    <>
      <motion.div
        className="absolute top-0 left-0 text-foreground"
        style={{
          width: ballSize,
          height: ballSize,
          marginLeft: -ballSize / 2,
          marginTop: -ballSize / 2,
          mixBlendMode: "multiply",
        }}
        initial={{ x: from.x, y: from.y, opacity: 0, scale: 0.7, rotate: 0 }}
        animate={{
          x: path.xs,
          y: path.ys,
          rotate: rotates,
          scale: scales,
          opacity: opacities,
        }}
        transition={{
          duration,
          ease: "linear",
          scale: { duration, ease: "easeOut" },
          opacity: { duration, ease: "linear" },
        }}
      >
        <SketchBall size={ballSize} />
      </motion.div>

      {/* GOAL — net shake on arrival */}
      <motion.div
        className="absolute pointer-events-none"
        style={{ ...cornerStyle(shot.goal), width: 0, height: 0 }}
        aria-hidden
      >
        <motion.div
          style={{
            position: "absolute",
            left: shot.goal.endsWith("R") ? -210 : 0,
            top: shot.goal.startsWith("T") ? 12 : -130,
            width: 210,
            color: "currentColor",
            mixBlendMode: "multiply",
          }}
          className="text-foreground"
          initial={{ scale: 1, opacity: 0 }}
          animate={{ scale: [1, 1.06, 1, 1.03, 1], opacity: [0, 0.4, 0.55, 0.4, 0] }}
          transition={{
            duration: 0.55,
            delay: duration - 0.05,
            times: [0, 0.25, 0.5, 0.75, 1],
            ease: "easeOut",
          }}
        >
          <svg
            width="210"
            height="134"
            viewBox="0 0 220 140"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.3"
            strokeLinecap="round"
            aria-hidden
          >
            <path d="M40 50 L60 65 M70 45 L88 62 M110 42 L110 64 M150 45 L132 62 M180 50 L160 65" />
          </svg>
        </motion.div>
      </motion.div>
    </>
  );
}

// ---------- root overlay ----------
export function KickStage() {
  const [scene, setScene] = useState<Scene>(() => makeScene());
  const [shots, setShots] = useState<Shot[]>([]);
  const [bounds, setBounds] = useState({ top: 0, bottom: 0 });
  const [dims, setDims] = useState(() =>
    typeof window === "undefined"
      ? { w: 1200, h: 800 }
      : { w: window.innerWidth, h: window.innerHeight },
  );

  useEffect(() => {
    if (typeof window === "undefined") return;
    const update = () => {
      const header = document.querySelector("header");
      const footer = document.querySelector("footer");
      const winH = window.innerHeight;
      const top = header ? Math.max(0, header.getBoundingClientRect().bottom) : 0;
      const footerTop = footer ? footer.getBoundingClientRect().top : winH;
      const bottom = footerTop < winH ? Math.max(0, winH - footerTop) : 0;
      setBounds({ top, bottom });
      setDims({ w: window.innerWidth, h: Math.max(120, winH - top - bottom) });
    };
    update();
    window.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);
    return () => {
      window.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
    };
  }, []);

  const sceneRef = useRef(scene);
  useEffect(() => {
    sceneRef.current = scene;
  }, [scene]);

  const fire = useCallback(() => {
    if (typeof window === "undefined") return;
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    const now = Date.now();
    if (now - lastFire < 160) return; // debounce click-vs-trigger duplicates
    lastFire = now;

    const cur = sceneRef.current;
    const style = Math.floor(Math.random() * 4) as 0 | 1 | 2 | 3;
    const header = document.querySelector("header");
    const footer = document.querySelector("footer");
    const winH = window.innerHeight;
    const topOff = header ? Math.max(0, header.getBoundingClientRect().bottom) : 0;
    const footerTop = footer ? footer.getBoundingClientRect().top : winH;
    const bottomOff = footerTop < winH ? Math.max(0, winH - footerTop) : 0;
    const w = window.innerWidth;
    const h = Math.max(120, winH - topOff - bottomOff);
    const fromXY = cornerXY(cur.juggler, w, h);
    const toXY = cornerXY(cur.goal, w, h, 140, 110);
    const bounces = pickBounces(fromXY, toXY, w, h);
    const shot: Shot = {
      id: ++counter,
      sceneId: cur.id,
      from: cur.juggler,
      goal: cur.goal,
      style,
      bounces,
    };

    setShots((arr) => [...arr.slice(-1), shot]);
    window.setTimeout(() => {
      setShots((arr) => arr.filter((s) => s.id !== shot.id));
    }, 2400);

    // Every click reshuffles goal + boot to new corners.
    window.setTimeout(() => setScene((s) => makeScene(s)), 1500);
  }, []);

  useEffect(() => {
    listeners.add(fire);
    const onResize = () => setDims({ w: window.innerWidth, h: window.innerHeight });
    window.addEventListener("resize", onResize);
    return () => {
      listeners.delete(fire);
      window.removeEventListener("resize", onResize);
    };
  }, [fire]);

  // Fire on route changes (every page/section navigation).
  const location = useLocation();
  useEffect(() => {
    fire();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname]);

  return (
    <div
      aria-hidden
      data-kickfx
      className="fixed left-0 right-0 pointer-events-none z-[30] overflow-hidden"
      style={{ top: bounds.top, bottom: bounds.bottom }}
    >
      <AnimatePresence mode="sync">
        <motion.div
          key={scene.id}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.5 }}
          className="absolute inset-0"
        >
          <GoalAtCorner corner={scene.goal} compact={dims.w < 640} />
          <JugglingBoot
            corner={scene.juggler}
            kicking={shots.length > 0}
            compact={dims.w < 640}
          />
        </motion.div>
      </AnimatePresence>
      {shots.map((s) => (
        <ShotBall key={s.id} shot={s} dims={dims} compact={dims.w < 640} />
      ))}
    </div>
  );
}
