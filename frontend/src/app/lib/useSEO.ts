import { useEffect } from "react";

interface SEO {
  title: string;
  description?: string;
  image?: string;
}

function setMeta(name: string, content: string, attr: "name" | "property" = "name") {
  let el = document.head.querySelector<HTMLMetaElement>(`meta[${attr}="${name}"]`);
  if (!el) {
    el = document.createElement("meta");
    el.setAttribute(attr, name);
    document.head.appendChild(el);
  }
  el.setAttribute("content", content);
}

export function useSEO({ title, description, image }: SEO) {
  useEffect(() => {
    document.title = title;
    if (description) {
      setMeta("description", description);
      setMeta("og:description", description, "property");
      setMeta("twitter:description", description);
    }
    setMeta("og:title", title, "property");
    setMeta("twitter:title", title);
    setMeta("twitter:card", "summary_large_image");
    if (image) {
      setMeta("og:image", image, "property");
      setMeta("twitter:image", image);
    }
  }, [title, description, image]);
}
