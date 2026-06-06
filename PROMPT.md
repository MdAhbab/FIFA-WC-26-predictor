# Claude Code prompt — FIFA World Cup 2026 Predictor web app

Copy everything in the fenced block below into **Claude Code (Opus)** with your terminal `cd`'d into
this `app/` folder. The prediction data already exists at `public/data/predictions.json` — the app must
read from it, not invent data.

---

```
You are building a production-quality, ad-monetized SHOWCASE website for a machine-learning "FIFA World
Cup 2026 Predictor". This is NOT a betting site and NOT the data-science competition — it is a fast,
beautiful, SEO-friendly content site whose predictions come from a pre-computed JSON file. The goal is
high engagement + clean ad placements (Google AdSense) for passive revenue.

WORKING DIRECTORY
- Build the entire app INSIDE the current folder (app/). Do not modify or read anything in the parent
  directory. Initialize a fresh project here.

TECH STACK (use exactly this)
- React 18 + Vite + TypeScript
- Tailwind CSS for styling (with a small custom theme), plus CSS variables for the palette
- react-router-dom for routing
- recharts for the title-race chart
- framer-motion for subtle, tasteful animations (no gaudy motion)
- react-helmet-async for per-page SEO meta tags
- No backend. All data is static.

DATA (already present — DO NOT regenerate)
- Read `public/data/predictions.json`. Load it once at startup (fetch from `/data/predictions.json`) and
  share via React context. Its schema:
  {
    "meta": { "host": str, "champion": str, "champion_iso": str,
              "finalists": [str,str], "semi_winners": [str,str], "n_teams": 48, "n_matches": 104 },
    "groups": { "A": [ { "team", "iso", "elo", "pos"(1-4), "qualified"(bool), "best_third_pool"(bool) } ... ] ... },  // 12 groups
    "group_matches": [ { "match_id","group","date","venue","home","away","home_iso","away_iso",
                         "home_goals","away_goals","winner"("home"|"away"|"draw"),"corners","yellows","reds" } ],  // 72
    "knockout": [ { "match_id","round","multiplier","date","venue","home","away","home_iso","away_iso",
                    "home_goals","away_goals","winner"("home"|"away"),"penalties"(bool),
                    "corners","yellows","reds","slot_home","slot_away","feeds_home","feeds_away" } ],  // 32
    "title_race": [ { "team","iso","champion"(0..1),"final"(0..1),"semi"(0..1) } ]  // top 16, desc by champion
  }
- Country flags: use `https://flagcdn.com/w80/{iso}.png` (the `iso` field already handles England=gb-eng,
  Scotland=gb-sct, etc.). Build a reusable <TeamBadge name iso size /> component (flag + name, with a
  graceful fallback when iso is empty).

THEME (well-organized, well-themed)
- Mood: modern, energetic, "tri-nation 2026" (USA · Canada · Mexico). Default DARK theme with a light
  toggle (persist in localStorage; respect prefers-color-scheme on first load).
- Palette via CSS variables: deep midnight base (#0B1020), card surface (#141A2E), vibrant accent gradient
  (electric blue #2E6BFF → magenta #E5247A → warm gold #FFC23C). Pitch-green success (#19C37D) for
  qualifiers, amber (#F5A524) for best-third, muted for eliminated.
- Typography: a strong geometric display font for headings (e.g., "Sora" or "Space Grotesk" via Google
  Fonts) and a clean sans (Inter) for body. Big confident headlines, generous spacing, rounded-2xl cards,
  soft shadows, subtle glassmorphism on the hero only.
- Fully responsive, mobile-first. Accessible (semantic HTML, aria labels, focus states, color contrast AA).

PAGES / ROUTES
1. "/" Home
   - Hero: "Our AI's World Cup 2026 Prediction" with the predicted CHAMPION (big flag + name), the two
     finalists, and the semi-finalists. Animated reveal. A short one-line "how it works" + CTA buttons to
     Groups and Bracket.
   - Title Race: recharts horizontal bar chart of `title_race` champion probabilities (top 10), with flags.
   - "Predicted Final" highlight card (score, who lifts the trophy).
   - Teaser strips linking to Groups and the Bracket.
2. "/groups" Group Stage
   - 12 group cards (A–L). Each shows the predicted final table (pos, flag+team, elo, qualified/third/out
     color coding) and, expandable, that group's 6 match predictions (score, winner, corners, cards) as
     compact MatchCards.
3. "/bracket" Knockout Bracket
   - Render the full bracket as a responsive tree from Round of 32 → Final using `knockout` + `feeds_home`
     /`feeds_away` to wire connectors. Each node = MatchCard (both teams w/ flags, predicted score,
     highlight the predicted winner, "(pens)" badge if penalties). On desktop show the classic left/right
     converging tree; on mobile fall back to a clean round-by-round vertical list. Show round multipliers.
   - A prominent "Predicted Champion" banner at the convergence.
4. "/methodology" About / How it works
   - Plain-English explanation: trained on 11,700+ internationals (2014–2026), Elo + form + FIFA points,
     a Poisson goal model, expected-value optimisation. Note it's for entertainment, not betting.
5. (Optional, stretch) "/build" Build-Your-Bracket
   - Client-side ONLY (no ML): start from the predicted bracket; let the user click to change knockout
     winners and watch later rounds update; "share" generates a URL with the picks encoded. Pure
     engagement feature (boosts time-on-site).

COMPONENTS
- Navbar (sticky, logo wordmark "WC26 PREDICTOR", nav links, theme toggle)
- Footer (disclaimer: "Predictions are AI-generated for entertainment only, not betting advice." + year)
- TeamBadge, MatchCard, GroupTable, BracketTree, TitleRaceChart, AdSlot, ThemeToggle, SEO (helmet wrapper)
- AdSlot: a self-contained placeholder component for Google AdSense. Reserve fixed heights to avoid layout
  shift (CLS). Variants: "leaderboard" (responsive ~728x90), "rectangle" (300x250), "in-article". Render a
  dashed "Ad" placeholder box now; accept a `slot` prop and read a client id from
  `import.meta.env.VITE_ADSENSE_CLIENT` so real ads can be enabled later by setting an env var. Place ads
  tastefully: one below the hero, one between Groups sections, one mid-bracket, one in the footer area.
  Never overlay content; keep it AdSense-policy friendly (clearly labelled, not near nav, not deceptive).

SEO & PERFORMANCE (this site lives or dies on this)
- Per-page <title>/<meta description>/Open Graph/Twitter cards via react-helmet-async. Descriptive,
  keyword-aware titles ("FIFA World Cup 2026 Predictions: Bracket, Groups & Champion").
- index.html: lang, viewport, theme-color, favicon, social preview meta, JSON-LD (SportsEvent) for the
  tournament. Add public/robots.txt and a static public/sitemap.xml covering the routes.
- Lighthouse target ≥ 95 performance/SEO/accessibility: lazy-load routes (React.lazy + Suspense),
  preconnect to fonts.googleapis & flagcdn, lazy/async flag images with width/height set, no big libs on
  the critical path, code-split recharts to the home route only.
- Prefer prerender/SSG-friendly structure (mention if react-snap or vite-plugin-ssg would help, but a
  clean SPA with good meta is acceptable for v1).

DELIVERABLES
- A complete, runnable Vite app in this folder: `npm install` then `npm run dev` works; `npm run build`
  produces a deployable static `dist/`.
- Clean folder structure: src/components, src/pages, src/context, src/lib (data loader, types), src/styles.
- A typed `predictions.ts` model matching the JSON schema above; centralize all data access there.
- A short README.md: how to run, where data comes from, how to enable AdSense (set VITE_ADSENSE_CLIENT),
  and how to deploy to Netlify/Vercel/GitHub Pages (it's a static SPA).
- Polished empty/loading/error states for the data fetch.

QUALITY BAR
- Looks like a real, modern sports product (think a sleek ESPN/Sofascore-lite), not a template. Cohesive
  spacing/typography, smooth but restrained motion, great on a phone. Keep components small and reusable.
- Type-safe, no console errors, no layout shift from ads or flags.

Start by scaffolding the Vite + React + TS project here, wire Tailwind and the data context, then build
Home → Groups → Bracket → Methodology, then ad slots + SEO, then (if time) the Build-Your-Bracket page.
```

---

### After Claude Code finishes
- `npm install && npm run dev` to preview.
- Drop in your AdSense client id later via a `.env` file: `VITE_ADSENSE_CLIENT=ca-pub-XXXX`.
- To refresh predictions, re-run `python generate_app_data.py` in the parent folder (overwrites
  `app/public/data/predictions.json`).
