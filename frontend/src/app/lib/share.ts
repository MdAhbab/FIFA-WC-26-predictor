// Social-share utilities: compact referral links + a themed, story-format (1080x1920) result image,
// plus platform-aware "share to story" actions.
//
// Reality of story sharing from the web (researched):
//   * Instagram: there is NO web URL that puts an image into a story (the instagram-stories:// path is
//     native-app-only, needs a Facebook App ID + pasteboard). The only browser path to an IG story is
//     the native Web Share sheet on mobile -> user picks Instagram -> Story. On desktop we can only
//     save the image and open instagram.com for a manual upload.
//   * Facebook: facebook.com/sharer/sharer.php?u=<link> (desktop) / m.facebook.com/sharer.php (mobile)
//     lets the user choose "Your Story" — a link->story path (image->story needs FB Login + Stories API).
//   * WhatsApp: wa.me / whatsapp:// share text+link to a chat (Status can't be pre-filled by anyone).
import QRCode from "qrcode";

// ---------- Compact referral links ----------
const B62 = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";

export function base62(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return "0";
  let s = "";
  let x = Math.floor(n);
  while (x > 0) {
    s = B62[x % 62] + s;
    x = Math.floor(x / 62);
  }
  return s;
}

/** Short, shareable referral URL for a vote id, e.g. https://host/s/3d7 */
export function shortRefUrl(voteId: number): string {
  return `${window.location.origin}/s/${base62(voteId)}`;
}

export function isMobile(): boolean {
  return /android|iphone|ipad|ipod|mobile/i.test(navigator.userAgent || "");
}

// ---------- Theme (mirrors the site's "ticket" look, with champion gold) ----------
const THEME = {
  bg: "#F1E7CF",
  ink: "#18120E",
  card: "#FBF4E1",
  blue: "#2E6BFF",
  magenta: "#E5247A",
  gold: "#FFC23C",
  goldDeep: "#C8901F",
  red: "#C8362F",
  muted: "#6b5e49",
  display: "'Anton', 'Bebas Neue', Impact, system-ui, sans-serif",
  body: "'Inter', system-ui, sans-serif",
  mono: "'DM Mono', ui-monospace, monospace",
};

export interface StoryOpts {
  userName: string;
  championName: string;
  championIso: string;
  championElo: number | null;
  shortUrl: string;
}

async function loadImage(url: string): Promise<ImageBitmap | null> {
  try {
    const r = await fetch(url, { mode: "cors" });
    if (!r.ok) return null;
    return await createImageBitmap(await r.blob());
  } catch {
    return null;
  }
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function wrapCenter(ctx: CanvasRenderingContext2D, text: string, cx: number, y: number, maxW: number, lh: number): number {
  const words = text.split(" ");
  let line = "";
  const lines: string[] = [];
  for (const w of words) {
    const test = line ? `${line} ${w}` : w;
    if (ctx.measureText(test).width > maxW && line) {
      lines.push(line);
      line = w;
    } else {
      line = test;
    }
  }
  if (line) lines.push(line);
  lines.forEach((l, i) => ctx.fillText(l, cx, y + i * lh));
  return y + lines.length * lh;
}

function goldGrad(ctx: CanvasRenderingContext2D, x0: number, y0: number, x1: number, y1: number) {
  const g = ctx.createLinearGradient(x0, y0, x1, y1);
  g.addColorStop(0, THEME.goldDeep);
  g.addColorStop(0.5, THEME.gold);
  g.addColorStop(1, THEME.goldDeep);
  return g;
}

/** A regal 5-point crown with jewels, centred on (cx) sitting with its base at baseY. */
function drawCrown(ctx: CanvasRenderingContext2D, cx: number, baseY: number, w: number) {
  const n = 5;
  const x0 = cx - w / 2;
  const step = w / n;
  const peakY = baseY - w * 0.62;
  const bandTop = baseY - w * 0.18;
  ctx.save();
  ctx.fillStyle = goldGrad(ctx, x0, peakY, x0 + w, baseY);
  ctx.strokeStyle = THEME.ink;
  ctx.lineWidth = 4;
  // crown body: zig-zag peaks down to a band
  ctx.beginPath();
  ctx.moveTo(x0, bandTop);
  for (let i = 0; i < n; i++) {
    ctx.lineTo(x0 + step * i + step / 2, peakY);
    ctx.lineTo(x0 + step * (i + 1), bandTop);
  }
  ctx.lineTo(x0 + w, baseY);
  ctx.lineTo(x0, baseY);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  // peak jewels
  for (let i = 0; i < n; i++) {
    ctx.beginPath();
    ctx.arc(x0 + step * i + step / 2, peakY, w * 0.045, 0, Math.PI * 2);
    ctx.fillStyle = THEME.gold;
    ctx.fill();
    ctx.stroke();
  }
  // band jewels (alternating red/blue)
  for (let i = 0; i < n; i++) {
    ctx.beginPath();
    ctx.arc(x0 + step * i + step / 2, (bandTop + baseY) / 2, w * 0.03, 0, Math.PI * 2);
    ctx.fillStyle = i % 2 ? THEME.blue : THEME.red;
    ctx.fill();
  }
  ctx.restore();
}

function drawDiamond(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, fill: string) {
  ctx.save();
  ctx.fillStyle = fill;
  ctx.strokeStyle = THEME.ink;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(cx, cy - r);
  ctx.lineTo(cx + r, cy);
  ctx.lineTo(cx, cy + r);
  ctx.lineTo(cx - r, cy);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

/**
 * Render the 1080x1920 share story (PNG blob + data URL preview). Cream/ink "ticket" theme dressed
 * with a gold majestic frame and a crown to celebrate the champion: flag, reached Elo, the player's
 * name, and a QR + short link so anyone scanning can play their own bracket.
 */
export async function generateStoryImage(opts: StoryOpts): Promise<{ blob: Blob; dataUrl: string }> {
  const W = 1080;
  const H = 1920;
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d")!;
  try {
    await (document as any).fonts?.ready;
  } catch {
    /* ignore */
  }

  const cx = W / 2;

  // Background + halftone texture
  ctx.fillStyle = THEME.bg;
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = THEME.ink;
  ctx.globalAlpha = 0.05;
  for (let y = 40; y < H; y += 34) {
    for (let x = 40; x < W; x += 34) {
      ctx.beginPath();
      ctx.arc(x, y, 3, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.globalAlpha = 1;

  // Majestic gold double frame + corner diamonds
  ctx.strokeStyle = goldGrad(ctx, 0, 0, W, H);
  ctx.lineWidth = 18;
  ctx.strokeRect(24, 24, W - 48, H - 48);
  ctx.strokeStyle = THEME.ink;
  ctx.lineWidth = 5;
  ctx.strokeRect(46, 46, W - 92, H - 92);
  for (const [dx, dy] of [[46, 46], [W - 46, 46], [46, H - 46], [W - 46, H - 46]] as const) {
    drawDiamond(ctx, dx, dy, 26, THEME.gold);
  }

  ctx.textAlign = "center";

  // Masthead
  ctx.fillStyle = THEME.ink;
  ctx.font = `60px ${THEME.display}`;
  ctx.fillText("FIFA WORLD CUP '26", cx, 168);
  const grad = ctx.createLinearGradient(cx - 280, 0, cx + 280, 0);
  grad.addColorStop(0, THEME.blue);
  grad.addColorStop(1, THEME.magenta);
  ctx.fillStyle = grad;
  ctx.font = `112px ${THEME.display}`;
  ctx.fillText("PREDICTOR", cx, 282);

  // Headline
  ctx.fillStyle = THEME.muted;
  ctx.font = `34px ${THEME.body}`;
  const headBottom = wrapCenter(
    ctx,
    `${opts.userName || "A fan"} simulated the bracket and crowned their champion`,
    cx,
    372,
    W - 220,
    46,
  );

  // ----- Champion ticket. Coordinates are computed so the content is centred and the card wraps
  // it snugly (no dead space), with a clear gap above for the crown so it never covers the headline.
  const cardX = 110;
  const cardW = W - 220;
  const crownW = 184;
  const cardY = headBottom + 150;          // gap clears the crown peaks (which rise above the card)
  const eyebrowY = cardY + 100;
  const flagW = 450;
  const flagH = 300;
  const fx = cx - flagW / 2;
  const fy = cardY + 140;
  const nameY = fy + flagH + 110;          // text baseline
  const eloLabelY = nameY + 62;
  const eloY = eloLabelY + 86;
  const cardH = eloY + 64 - cardY;         // snug bottom padding

  // card shadow + body
  ctx.save();
  ctx.shadowColor = "rgba(24,18,14,0.35)";
  ctx.shadowOffsetX = 12;
  ctx.shadowOffsetY = 14;
  ctx.fillStyle = THEME.card;
  roundRect(ctx, cardX, cardY, cardW, cardH, 28);
  ctx.fill();
  ctx.restore();
  // gold + ink frame
  ctx.strokeStyle = goldGrad(ctx, cardX, cardY, cardX + cardW, cardY + cardH);
  ctx.lineWidth = 12;
  roundRect(ctx, cardX, cardY, cardW, cardH, 28);
  ctx.stroke();
  ctx.strokeStyle = THEME.ink;
  ctx.lineWidth = 4;
  roundRect(ctx, cardX + 14, cardY + 14, cardW - 28, cardH - 28, 20);
  ctx.stroke();

  // Crown straddling the top edge (its peaks rise into the clear gap above the card)
  drawCrown(ctx, cx, cardY + 8, crownW);

  // "CHAMPION" eyebrow
  ctx.fillStyle = THEME.muted;
  ctx.textAlign = "center";
  ctx.font = `32px ${THEME.mono}`;
  ctx.fillText("· CHAMPION ·", cx, eyebrowY);

  // Radial gold glow behind the flag
  const glow = ctx.createRadialGradient(cx, fy + flagH / 2, 30, cx, fy + flagH / 2, flagW * 0.9);
  glow.addColorStop(0, "rgba(255,194,60,0.45)");
  glow.addColorStop(1, "rgba(255,194,60,0)");
  ctx.fillStyle = glow;
  ctx.fillRect(cardX + 16, fy - 50, cardW - 32, flagH + 100);

  // Flag
  const flag = await loadImage(`https://flagcdn.com/w640/${opts.championIso}.png`);
  if (flag) {
    ctx.drawImage(flag, fx, fy, flagW, flagH);
  } else {
    ctx.fillStyle = "#ddd";
    ctx.fillRect(fx, fy, flagW, flagH);
  }
  ctx.strokeStyle = THEME.ink;
  ctx.lineWidth = 6;
  ctx.strokeRect(fx, fy, flagW, flagH);
  for (const [dx, dy] of [[fx, fy], [fx + flagW, fy], [fx, fy + flagH], [fx + flagW, fy + flagH]] as const) {
    drawDiamond(ctx, dx, dy, 13, THEME.gold);
  }

  // Champion name
  ctx.fillStyle = THEME.ink;
  ctx.font = `92px ${THEME.display}`;
  ctx.fillText(opts.championName.toUpperCase(), cx, nameY);

  // Elo reached (clean — no decorative arcs)
  if (opts.championElo != null) {
    ctx.fillStyle = THEME.muted;
    ctx.font = `30px ${THEME.mono}`;
    ctx.fillText("ELO REACHED", cx, eloLabelY);
    ctx.fillStyle = THEME.red;
    ctx.font = `84px ${THEME.display}`;
    ctx.fillText(String(opts.championElo), cx, eloY);
  }

  // "PREDICTED" stamp (rotated, top-right of card)
  ctx.save();
  ctx.translate(cardX + cardW - 92, cardY + 84);
  ctx.rotate((-12 * Math.PI) / 180);
  ctx.strokeStyle = THEME.red;
  ctx.fillStyle = THEME.red;
  ctx.lineWidth = 4;
  ctx.font = `36px ${THEME.display}`;
  ctx.textAlign = "center";
  const stampW = ctx.measureText("PREDICTED").width + 28;
  roundRect(ctx, -stampW / 2, -34, stampW, 50, 8);
  ctx.stroke();
  ctx.fillText("PREDICTED", 0, 1);
  ctx.restore();

  // ----- QR + short link footer, vertically centred in the space below the card -----
  ctx.textAlign = "center";
  const qr = await loadImage(
    await QRCode.toDataURL(opts.shortUrl, {
      margin: 1,
      width: 260,
      color: { dark: THEME.ink, light: THEME.card },
    }),
  );
  const qrSize = 240;
  const footerTop = cardY + cardH;
  const footerBottom = H - 72;
  const blockH = qrSize + 132;             // QR box + two text lines
  const qrY = Math.max(footerTop + 40, footerTop + (footerBottom - footerTop - blockH) / 2);
  if (qr) {
    ctx.fillStyle = THEME.card;
    roundRect(ctx, cx - qrSize / 2 - 18, qrY - 18, qrSize + 36, qrSize + 36, 16);
    ctx.fill();
    ctx.strokeStyle = goldGrad(ctx, cx - qrSize / 2, qrY, cx + qrSize / 2, qrY + qrSize);
    ctx.lineWidth = 6;
    roundRect(ctx, cx - qrSize / 2 - 18, qrY - 18, qrSize + 36, qrSize + 36, 16);
    ctx.stroke();
    ctx.drawImage(qr, cx - qrSize / 2, qrY, qrSize, qrSize);
  }
  ctx.fillStyle = THEME.ink;
  ctx.font = `36px ${THEME.display}`;
  ctx.fillText("SCAN TO PLAY YOUR OWN", cx, qrY + qrSize + 62);
  ctx.fillStyle = THEME.blue;
  ctx.font = `30px ${THEME.mono}`;
  ctx.fillText(opts.shortUrl.replace(/^https?:\/\//, ""), cx, qrY + qrSize + 104);

  const dataUrl = canvas.toDataURL("image/png");
  const blob: Blob = await new Promise((res) => canvas.toBlob((b) => res(b!), "image/png"));
  return { blob, dataUrl };
}

// ---------- Sharing ----------
export type ShareResult = "shared" | "cancelled" | "unsupported";

/** Native share sheet with the image file (mobile: Instagram Stories / WhatsApp / Facebook / ...). */
export async function shareStoryImage(
  blob: Blob,
  text: string,
  url: string,
  fileName = "wc26-prediction.png",
): Promise<ShareResult> {
  const nav = navigator as Navigator & { canShare?: (data?: ShareData) => boolean };
  try {
    const file = new File([blob], fileName, { type: "image/png" });
    if (nav.canShare && nav.canShare({ files: [file] })) {
      await navigator.share({ files: [file], text, url });
      return "shared";
    }
  } catch (e) {
    if (e instanceof DOMException && e.name === "AbortError") return "cancelled";
  }
  return "unsupported";
}

export function downloadBlob(blob: Blob, fileName = "wc26-prediction.png") {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}

function openUrl(url: string, sameTab = false) {
  if (sameTab) window.location.href = url;
  else window.open(url, "_blank", "noopener");
}

/** WhatsApp: mobile app deep link, desktop WhatsApp Web — shares the link to a chat. */
export function shareToWhatsApp(text: string, url: string) {
  const msg = encodeURIComponent(`${text} ${url}`);
  if (isMobile()) openUrl(`whatsapp://send?text=${msg}`, true);
  else openUrl(`https://wa.me/?text=${msg}`);
}

/** X (Twitter): tweet intent — opens the app on mobile / web composer on desktop. */
export function shareToX(text: string, url: string) {
  openUrl(`https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}`);
}

/** Facebook: the sharer lets the user choose "Your Story" (mobile app / desktop web). */
export function shareToFacebook(url: string) {
  const u = encodeURIComponent(url);
  if (isMobile()) openUrl(`https://m.facebook.com/sharer.php?u=${u}`, true);
  else openUrl(`https://www.facebook.com/sharer/sharer.php?u=${u}`);
}

/**
 * Instagram has no web story link. Best effort: mobile -> native share sheet (pick Instagram -> Story
 * with the image); if unavailable, save the image and open the IG story camera. Desktop -> save the
 * image and open instagram.com for a manual story upload. Returns a hint to show the user.
 */
export async function shareToInstagram(blob: Blob, text: string, url: string): Promise<string> {
  if (isMobile()) {
    const res = await shareStoryImage(blob, text, url);
    if (res === "shared") return "Shared! 🎉";
    if (res === "cancelled") return "";
    downloadBlob(blob);
    openUrl("instagram://story-camera", true);
    return "Image saved — add it in the Instagram story camera.";
  }
  downloadBlob(blob);
  openUrl("https://www.instagram.com/");
  return "Image saved — upload it as your Instagram story (Instagram has no desktop story link).";
}
