import { useEffect, useRef } from "react";

interface Props {
  variant?: "leaderboard" | "rectangle" | "in-article";
  label?: string;
  className?: string;
  /** AdSense ad-unit slot id; falls back to a per-variant env var. */
  slot?: string;
}

const SIZES: Record<NonNullable<Props["variant"]>, { w: number; h: number }> = {
  leaderboard: { w: 728, h: 90 },
  rectangle: { w: 300, h: 250 },
  "in-article": { w: 0, h: 160 },
};

// Configure ads by setting these in app/frontend/.env (see README):
//   VITE_ADSENSE_CLIENT=ca-pub-XXXXXXXXXXXXXXXX
//   VITE_AD_SLOT_LEADERBOARD / VITE_AD_SLOT_RECTANGLE / VITE_AD_SLOT_IN_ARTICLE = <unit id>
const CLIENT = import.meta.env.VITE_ADSENSE_CLIENT as string | undefined;
const SLOTS: Record<NonNullable<Props["variant"]>, string | undefined> = {
  leaderboard: import.meta.env.VITE_AD_SLOT_LEADERBOARD,
  rectangle: import.meta.env.VITE_AD_SLOT_RECTANGLE,
  "in-article": import.meta.env.VITE_AD_SLOT_IN_ARTICLE,
};

let scriptInjected = false;
function ensureAdScript() {
  if (scriptInjected || !CLIENT || typeof document === "undefined") return;
  scriptInjected = true;
  // index.html already ships the AdSense loader for site verification — don't add a second copy
  // (a duplicate adsbygoogle.js tag triggers console errors and can break ad fill).
  if (document.querySelector('script[src*="adsbygoogle.js"]')) return;
  const s = document.createElement("script");
  s.async = true;
  s.src = `https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${CLIENT}`;
  s.crossOrigin = "anonymous";
  document.head.appendChild(s);
}

export function AdSlot({
  variant = "in-article",
  label = "Advertisement",
  className = "",
  slot,
}: Props) {
  const { w, h } = SIZES[variant];
  const adRef = useRef<HTMLModElement>(null);
  const unit = slot || SLOTS[variant];
  const live = Boolean(CLIENT && unit);

  useEffect(() => {
    if (!live) return;
    ensureAdScript();
    try {
      // @ts-expect-error adsbygoogle is injected by Google's script
      (window.adsbygoogle = window.adsbygoogle || []).push({});
    } catch {
      /* ignore until the script loads */
    }
  }, [live]);

  if (live) {
    return (
      <div
        className={`mx-auto my-8 ${className}`}
        style={{ width: w ? `min(100%, ${w}px)` : "100%", minHeight: h }}
      >
        <ins
          ref={adRef}
          className="adsbygoogle"
          style={{ display: "block", width: "100%", height: h }}
          data-ad-client={CLIENT}
          data-ad-slot={unit}
          data-ad-format={variant === "in-article" ? "fluid" : "auto"}
          data-full-width-responsive="true"
        />
      </div>
    );
  }

  // Placeholder (shown until AdSense client + slot ids are configured).
  return (
    <div
      role="complementary"
      aria-label={label}
      className={`relative mx-auto my-8 ticket flex flex-col items-center justify-center bg-card text-xs text-muted-foreground border-2 border-dashed border-foreground/20 ${className}`}
      style={{ width: w ? `min(100%, ${w}px)` : "100%", height: h }}
    >
      <span className="absolute top-2 left-3 text-[9px] display tracking-[0.25em] uppercase opacity-60">
        Advertisement
      </span>
      <span className="opacity-50 mono uppercase tracking-wider">
        {label} · {w || "fluid"}×{h}
      </span>
    </div>
  );
}
