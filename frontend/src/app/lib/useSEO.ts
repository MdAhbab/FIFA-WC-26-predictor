import { useEffect } from "react";

interface SEO {
  title: string;
  description?: string;
  image?: string;
}

const SITE_NAME = "FIFA Worldcup 2026 Match Predictor";
const DEFAULT_IMAGE = "/og-image.png";
// Short, constant browser-tab title (no page prefix, no champion reveal).
const TAB_TITLE = "FIFA 26 Predictor";
// Title used for shared-link previews (Open Graph / Twitter) — never reveals the predicted winner.
const LINK_TITLE = "FIFA Worldcup 2026 Match Predictor";

function setMeta(name: string, content: string, attr: "name" | "property" = "name") {
  let el = document.head.querySelector<HTMLMetaElement>(`meta[${attr}="${name}"]`);
  if (!el) {
    el = document.createElement("meta");
    el.setAttribute(attr, name);
    document.head.appendChild(el);
  }
  el.setAttribute("content", content);
}

function setCanonical(href: string) {
  let el = document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]');
  if (!el) {
    el = document.createElement("link");
    el.setAttribute("rel", "canonical");
    document.head.appendChild(el);
  }
  el.setAttribute("href", href);
}

/** Keeps the <title>, meta description, canonical and Open Graph / Twitter tags in sync. The browser
 *  tab is a constant short brand; the shared-link title is a constant that never reveals the winner.
 *  (`title` is kept in the signature so callers stay unchanged, but the tab no longer varies by page.) */
export function useSEO({ description, image }: SEO) {
  useEffect(() => {
    document.title = TAB_TITLE;

    const origin = window.location.origin;
    const url = origin + window.location.pathname;
    const img = (image || DEFAULT_IMAGE).startsWith("http")
      ? image || DEFAULT_IMAGE
      : origin + (image || DEFAULT_IMAGE);

    if (description) {
      setMeta("description", description);
      setMeta("og:description", description, "property");
      setMeta("twitter:description", description);
    }
    setMeta("og:title", LINK_TITLE, "property");
    setMeta("og:type", "website", "property");
    setMeta("og:site_name", SITE_NAME, "property");
    setMeta("og:url", url, "property");
    setMeta("og:image", img, "property");
    setMeta("twitter:title", LINK_TITLE);
    setMeta("twitter:card", "summary_large_image");
    setMeta("twitter:image", img);
    setCanonical(url);
  }, [description, image]);
}
