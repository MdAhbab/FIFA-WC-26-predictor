import { useCallback, useEffect, useState } from "react";
import { ExternalLink, Loader2, Newspaper, RotateCw } from "lucide-react";
import { api } from "../lib/api";
import type { NewsItem } from "../lib/types";

/**
 * Vertically scrollable "Recent Football News" rail (single column) shown below the hero.
 * The backend returns a shuffled 5–10 item set on each request, and the refresh button
 * re-pulls a freshly shuffled set so the rail feels alive on repeat visits.
 */
export function RecentNews() {
  const [items, setItems] = useState<NewsItem[]>([]);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");

  const load = useCallback(() => {
    setStatus("loading");
    api
      .news(8)
      .then((d) => {
        setItems(d.items);
        setStatus("ready");
      })
      .catch(() => setStatus("error"));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  if (status === "error") return null; // fail quietly — never block the page on the news rail

  return (
    <section className="mt-4 rounded-[14px] border-2 border-foreground/15 bg-card p-5 sm:p-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="display tracking-wide flex items-center gap-2">
          <Newspaper className="size-5" style={{ color: "var(--foil-magenta)" }} />
          RECENT FOOTBALL NEWS
        </h2>
        <button
          type="button"
          onClick={load}
          aria-label="Shuffle news"
          className="inline-flex items-center gap-1.5 rounded-md border-2 border-foreground/20 px-2.5 py-1.5 text-[10px] mono uppercase tracking-wider text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
        >
          <RotateCw className="size-3.5" /> Shuffle
        </button>
      </div>

      {status === "loading" ? (
        <div className="flex items-center justify-center gap-2 py-10 text-muted-foreground">
          <Loader2 className="size-5 animate-spin" /> Loading the latest…
        </div>
      ) : (
        <div className="max-h-[460px] overflow-y-auto pr-1 space-y-3 custom-scrollbar">
          {items.map((n) => (
            <a
              key={n.id}
              href={n.url}
              target="_blank"
              rel="noreferrer"
              className="block rounded-[12px] border border-foreground/10 bg-background/60 px-4 py-3 hover:border-foreground/30 hover:translate-y-[-1px] transition-all"
            >
              <div className="flex items-center gap-2 mb-1">
                {n.tag && (
                  <span className="stamp" style={{ color: "var(--stamp-red)" }}>
                    {n.tag}
                  </span>
                )}
                {n.live && (
                  <span className="mono text-[9px] uppercase tracking-wider text-[var(--foil-magenta)]">
                    Live
                  </span>
                )}
                <span className="ml-auto mono text-[10px] uppercase tracking-wider text-muted-foreground">
                  {n.date}
                </span>
              </div>
              <div className="text-sm font-medium flex items-start gap-1.5">
                <span className="flex-1">{n.title}</span>
                <ExternalLink className="size-3.5 mt-0.5 shrink-0 text-muted-foreground" />
              </div>
              <p className="text-xs text-muted-foreground mt-1 leading-relaxed">{n.summary}</p>
              <div className="mono text-[10px] uppercase tracking-wider text-muted-foreground mt-1.5">
                {n.source}
              </div>
            </a>
          ))}
        </div>
      )}
    </section>
  );
}
