import { useEffect } from "react";

interface SEO {
  title: string;
  description?: string;
  image?: string;
}

const SITE_NAME = "FIFA Worldcup Predictor";
const DEFAULT_IMAGE = "/og-image.png";

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

/** Keeps per-route <title>, meta description, canonical and Open Graph / Twitter tags in sync. */
export function useSEO({ title, description, image }: SEO) {
  useEffect(() => {
    document.title = title;

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
    setMeta("og:title", title, "property");
    setMeta("og:type", "website", "property");
    setMeta("og:site_name", SITE_NAME, "property");
    setMeta("og:url", url, "property");
    setMeta("og:image", img, "property");
    setMeta("twitter:title", title);
    setMeta("twitter:card", "summary_large_image");
    setMeta("twitter:image", img);
    setCanonical(url);
  }, [title, description, image]);
}
