import { useEffect, useRef, useState } from "react";
import { Download, Instagram, Loader2, Share2 } from "lucide-react";
import {
  downloadBlob,
  generateStoryImage,
  shareStoryImage,
  shareToFacebook,
  shareToInstagram,
  shareToWhatsApp,
  shareToX,
  shortRefUrl,
} from "../lib/share";

interface Props {
  userName: string;
  championName: string;
  championIso: string;
  championElo: number | null;
  voteId: number;
}

/**
 * Post-game share card. Builds a themed 1080x1920 "champion" story image (crown + flag + reached Elo
 * + player name + QR/short link) and offers story sharing: the native share sheet on mobile (best for
 * Instagram/Facebook stories with the image), plus per-platform actions for Instagram, Facebook and
 * WhatsApp that open the app on mobile / the web story link on desktop.
 */
export function ShareStory({ userName, championName, championIso, championElo, voteId }: Props) {
  const [img, setImg] = useState<{ blob: Blob; dataUrl: string } | null>(null);
  const [status, setStatus] = useState<"building" | "ready" | "error">("building");
  const [hint, setHint] = useState("");
  const reqId = useRef(0);

  const shortUrl = shortRefUrl(voteId);
  const shareText = `${userName} simulated the FIFA World Cup '26 and crowned ${championName} champion! Play your own bracket:`;

  useEffect(() => {
    const id = ++reqId.current;
    setStatus("building");
    generateStoryImage({ userName, championName, championIso, championElo, shortUrl })
      .then((out) => {
        if (id !== reqId.current) return;
        setImg(out);
        setStatus("ready");
      })
      .catch(() => id === reqId.current && setStatus("error"));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userName, championName, championIso, championElo, voteId]);

  async function onShare() {
    if (!img) return;
    const res = await shareStoryImage(img.blob, shareText, shortUrl);
    if (res === "unsupported") {
      downloadBlob(img.blob);
      setHint("Image saved — add it to your Instagram/Facebook story, then paste your link.");
    } else if (res === "shared") {
      setHint("Shared! 🎉");
    }
  }

  async function onInstagram() {
    if (!img) return;
    setHint(await shareToInstagram(img.blob, shareText, shortUrl));
  }

  const ready = status === "ready" && !!img;

  return (
    <section className="mt-6 rounded-[14px] border-2 border-foreground bg-card p-5 shadow-[4px_4px_0_var(--foil-magenta)]">
      <h3 className="display tracking-wide text-center font-bold">SHARE YOUR CHAMPION</h3>
      <p className="text-xs text-muted-foreground text-center mt-1 mb-4">
        Post your result as a story — friends scan the code to play their own bracket.
      </p>

      <div className="grid sm:grid-cols-[200px_1fr] gap-5 items-start">
        {/* Preview */}
        <div className="mx-auto w-[180px] aspect-[9/16] rounded-lg border-2 border-foreground/20 overflow-hidden bg-background/50 flex items-center justify-center">
          {ready ? (
            <img src={img!.dataUrl} alt="Your shareable champion story" className="w-full h-full object-cover" />
          ) : status === "error" ? (
            <span className="text-[10px] text-muted-foreground px-2 text-center">Preview unavailable</span>
          ) : (
            <Loader2 className="size-6 animate-spin text-muted-foreground" />
          )}
        </div>

        {/* Actions */}
        <div className="space-y-2.5">
          <button
            type="button"
            onClick={onShare}
            disabled={!ready}
            className="w-full inline-flex items-center justify-center gap-2 rounded-md bg-gradient-to-r from-[var(--foil-blue)] to-[var(--foil-magenta)] text-white display uppercase tracking-wider px-5 py-3 font-bold disabled:opacity-40 hover:enabled:translate-y-[-1px] transition-transform"
          >
            <Share2 className="size-4" /> Share to story
          </button>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <button
              type="button"
              onClick={onInstagram}
              disabled={!ready}
              className="inline-flex items-center justify-center gap-1.5 rounded-md border-2 border-foreground/20 px-2 py-2.5 text-xs display uppercase tracking-wider hover:bg-muted transition-colors disabled:opacity-40"
            >
              <Instagram className="size-3.5" /> Instagram
            </button>
            <button
              type="button"
              onClick={() => shareToFacebook(shortUrl)}
              className="inline-flex items-center justify-center rounded-md border-2 border-foreground/20 px-2 py-2.5 text-xs display uppercase tracking-wider hover:bg-muted transition-colors"
            >
              Facebook
            </button>
            <button
              type="button"
              onClick={() => shareToWhatsApp(shareText, shortUrl)}
              className="inline-flex items-center justify-center rounded-md border-2 border-foreground/20 px-2 py-2.5 text-xs display uppercase tracking-wider hover:bg-muted transition-colors"
            >
              WhatsApp
            </button>
            <button
              type="button"
              onClick={() => shareToX(shareText, shortUrl)}
              className="inline-flex items-center justify-center rounded-md border-2 border-foreground/20 px-2 py-2.5 text-xs display uppercase tracking-wider hover:bg-muted transition-colors"
            >
              X
            </button>
          </div>

          <button
            type="button"
            onClick={() => img && downloadBlob(img.blob)}
            disabled={!ready}
            className="w-full inline-flex items-center justify-center gap-1.5 rounded-md border-2 border-foreground/20 px-2 py-2 text-xs display uppercase tracking-wider hover:bg-muted transition-colors disabled:opacity-40"
          >
            <Download className="size-3.5" /> Save image
          </button>

          <div className="mono text-[10px] text-muted-foreground break-all pt-1">{shortUrl}</div>
          {hint && <p className="text-[11px] text-[var(--pitch)] font-medium">{hint}</p>}
        </div>
      </div>
    </section>
  );
}
