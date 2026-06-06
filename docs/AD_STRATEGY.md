# Advertisement Integration Strategy

This document recommends how to monetise the FIFA World Cup '26 Predictor with ads **without**
hurting inference performance, page responsiveness, or the small GCP VM that hosts the app.

## TL;DR recommendation

| Decision | Recommendation |
| --- | --- |
| Network | **Google AdSense** to launch (zero ops, fills globally). Move to **Ad Manager / Ezoic / Mediavine** once traffic is meaningful. |
| Loading | **Client-side, lazy, async** — already wired in `AdSlot.tsx`. Never server-side render or block on ads. |
| Placement | A small number of **fixed, labelled, reserved** slots (leaderboard, in-article, rectangle). No interstitials/pop-ups. |
| Performance isolation | Ads run **entirely in the browser**; they never touch the FastAPI process, the ML engine, or the VM CPU. |
| Layout stability | Every slot has a **reserved height** so ads cannot cause layout shift (good CLS / good UX). |
| Consent | Add a **CMP / consent banner** before serving personalised ads in the EU/UK. |

## Why this is the right fit for a low-resource host

The single most important architectural point: **ad rendering is decoupled from prediction
compute.** The VM only serves a static JS bundle + cached JSON from FastAPI. Google's ad scripts
download from `pagead2.googlesyndication.com` and render in the visitor's browser. So:

- Ad traffic does **not** consume VM CPU, RAM, or the Monte-Carlo/inference budget.
- The 20-concurrent-user target is governed by the prediction cache (warm, O(1) hits), not by ads.
- If the ad network is slow or down, the app and predictions are unaffected (async, non-blocking).

## What is already implemented

`frontend/src/app/components/AdSlot.tsx` is production-ready:

- Renders a **labelled placeholder** until you configure a client id (AdSense policy-safe — no
  empty or accidental ad units).
- Injects the AdSense loader script **once**, **async**, only when a client id is present.
- Each slot has a **reserved size** (`leaderboard` 728×90, `rectangle` 300×250, `in-article`
  fluid) to prevent layout shift.
- Slots are clearly marked "Advertisement" and never overlap content.

### Turning ads on

Create `frontend/.env` (see `.env.example`) and rebuild:

```
VITE_ADSENSE_CLIENT=ca-pub-XXXXXXXXXXXXXXXX
VITE_AD_SLOT_LEADERBOARD=1234567890
VITE_AD_SLOT_RECTANGLE=2345678901
VITE_AD_SLOT_IN_ARTICLE=3456789012
```

No code change required — `AdSlot` flips from placeholder to live unit automatically.

## Placement plan (current pages)

| Page | Slot | Position | Notes |
| --- | --- | --- | --- |
| Home | leaderboard | after "How it works" | Above the fold-ish, high viewability |
| Home | rectangle | end of page | After fan vote / favourites |
| Predictions | leaderboard | mid-groups | One per long page |
| Predictions | in-article | between knockout rounds | Fluid, blends with content |
| Play | leaderboard / in-article | between stages | Never inside the interactive picker |

Keep **one ad per viewport height** as a rule of thumb. Resist adding more units; density hurts
both UX and long-term RPM/quality scores.

## Performance & UX guardrails (do / don't)

**Do**
- Lazy-load below-the-fold slots (defer the `adsbygoogle.push` until near-viewport if density grows).
- Reserve space for every unit (already done) to protect Core Web Vitals (CLS).
- Use `async` + `crossorigin` on the loader (already done).
- Serve ads over the same HTTPS origin behind the CDN/reverse proxy.

**Don't**
- No interstitials, vignettes, auto-playing video, or pop-ups (kills mobile UX and invites policy
  strikes).
- Don't render ad markup server-side or block first paint on the ad script.
- Don't place ads adjacent to clickable predictor controls (accidental-click policy risk).
- Don't ship personalised ads to EU/UK users without a consent signal.

## Compliance checklist

- [ ] Privacy Policy discloses third-party ad cookies and the opt-out link — **done** (see `/privacy`).
- [ ] "Entertainment only — not betting advice" disclaimer present — **done** (`/disclaimer`).
- [ ] Consent Management Platform (e.g. Google's CMP, Cookiebot, or Osano) for GDPR/UK GDPR.
- [x] `ads.txt` shipped as a template at `frontend/public/ads.txt` (served at `/ads.txt`) — fill in
      your real `pub-XXXX` id and uncomment the line once AdSense is approved.
- [ ] Avoid gambling-adjacent ad categories given the football/predictions context (block in console).

## Growth path

1. **Launch:** AdSense Auto-ads off, manual reserved slots only (predictable layout).
2. **Validate:** confirm viewability and CWV in PageSpeed/CrUX; tune slot count.
3. **Scale:** when sessions justify it, migrate to **Google Ad Manager** (header bidding via Open
   Bidding) or a managed partner (**Ezoic/Mediavine/Raptive**) for materially higher RPM, keeping
   the same client-side, non-blocking model.
