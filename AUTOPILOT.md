# AUTOPILOT log

Running log for the final-polish autopilot run (started 2026-11-25). A fresh session can pick up with
"Continue from AUTOPILOT.md": read **Status / next** first.

## Status / next
_Paused 2026-11-25 at Abdo's request. Everything is committed, pushed and live (last code deploy `99d8aee`)._

- [x] Phase 0: tools
- [x] Phase 1: the chosen pack hero works on phones and tablets. Shipped in `f057742` and verified live: the test matrix passed 439/440 (the one failure is a cache-timing artifact in the test) and the touch checks passed 10/10.
- [ ] Phase 2: crawl and fix cycles. The first cycle is done (5 fixes, below). The second cycle was in diagnosis when the run paused.

**Next (planned, not started):**
1. **Idle animation loops (biggest remaining phone cost).** On every page, about 8 `requestAnimationFrame` loops keep running at full frame rate while the page is idle: about 2,400 calls in 5 idle seconds on `/about`. That's main-thread and battery cost on phones. Found so far:
   - **GSAP ticker (chunk `2bp24…`):** it drives Lenis through `gsap.ticker.add` in `components/ui/SmoothScroll.tsx`, so it never sleeps. Idea: let Lenis use its own `autoRaf`, or stop the ticker while Lenis isn't scrolling.
   - **GSAP ScrollTrigger:** a `function t(){return sf&&requestAnimationFrame(t)}` loop while ScrollTrigger is registered.
   - **Film-grain canvas (`components/ui/Grain.tsx`, chunk `3m0a3…`):** redraws noise at its fps forever. Idea: pause offscreen and in background tabs, use a lower fps on coarse pointers, or use a static noise tile when the grain is subtle.
   - **framer-motion frame loop (~57/s):** something animates forever; find the infinite `animate`.

   Measure with `docs/autopilot/scripts/events.cjs` (rAF attribution) and `docs/autopilot/scripts/trace.cjs` (main-thread time by type) before and after each change.
2. **Homepage on phones:** TBT is still about 2.7 s and scrolling drops 40 of 116 frames. It's not the hero (the hero alone costs ~330 ms of style work); it's the homepage sections plus the loops above. 1.45 s of style recalculation in 6 s.
3. **Bundle:** `next-bundle-optimizer` audit. The ⌘K palette (`CommandPalette`: fuse.js plus all projects) can load on first open; `NavTools` imports `OPEN_PALETTE` from the palette module, so move that constant to a tiny module first.
4. **Mobile polish pass:** many tap targets under 24 px (up to 14 per page), safe areas, menu, player, about, contact.
5. **Accessibility/SEO pass:** focus states, alt text (none missing in the crawl), headings.
6. **Re-crawl:** a full phone and desktop crawl, then the final summary at the top of this file.

## Phase 0: tools
| Tool | State |
|---|---|
| Playwright (playwright-core 1.58 + Chromium 1208, via `~/.claude/skills/gstack`) | used for every scripted check. Chrome DevTools Protocol (CDP) used for CPU/network throttling, Core Web Vitals (LCP/CLS/TBT) through PerformanceObserver, and touch scroll gestures |
| Already in the project (`npx skills`, `.claude/skills`): `vercel-react-best-practices`, `web-design-guidelines`, `frontend-design`, `impeccable`, `vercel-optimize`, `webapp-testing` | used |
| Installed: `vercel-composition-patterns` (vercel-labs/agent-skills) | Markdown only, reviewed |
| Installed: `next-bundle-optimizer`, `next-cache-components-optimizer` (vercel/next.js `skills/`) | Markdown only, reviewed. vercel-labs/next-skills moved into vercel/next.js; `next-best-practices` is no longer a skill. Its content is the bundled docs in `node_modules/next/dist/docs` |
| Installed: addyosmani/web-quality-skills (`accessibility`, `best-practices`, `core-web-vitals`, `performance`, `seo`, `web-quality-audit`) | Markdown plus one read-only grep script (`analyze.sh`), reviewed |
| Chrome DevTools MCP plugin | **not installed**: it needs the `/plugin marketplace add` and `/plugin install` slash commands, which only Abdo can type. Covered meanwhile by Playwright plus CDP |

Rules followed in every automated run: `/media/**` is blocked (B2 daily cap), no admin writes, the admin key is never printed.

## Changes (with commits)
_(newest last)_

### Phase 1: the chosen pack hero works on phones and tablets
- **Runtime (`public/heroes/runtime/dc-lite.js`)**
  - **Portrait template:** an optional `<template id="dc-template-portrait">` is used whenever width/height < 1.1 (phones, upright tablets). It has its own canvas, 844 tall and 390–640 wide (fluid width, scaled to fit). `this.mode` and `<html data-mode>` say which template is showing.
  - **`data-fit="width|contain"`:** scales a fixed-size piece of the desktop composition into a portrait layout (billboard, ID card, gilded frame, lens close-up).
  - **Touch:** touch drags, device tilt (iOS asks for permission on the first tap) and, failing both, a slow idle drift drive the hero's own `onMouseMove`. These calls are marked `synthetic`, and Museum ignores them for its proximity alarm. The drift pauses offscreen and in background tabs. `prefers-reduced-motion` turns off the drift, the tilt and all CSS animation.
  - **Scrolling:** `touch-action: pan-y` on the hero, so vertical swipes scroll the page by native scroll chaining. Verified with real touch events over the iframe.
  - **44px targets:** on coarse pointers every link and button gets a hit area of at least 44 screen px, whatever the scale (an invisible `::after`).
  - **Landscape fit:** cover-fit now crops at most ~6% off the sides and ~10% off the top and bottom. A phone on its side or a 4:3 tablet used to lose the copy and buttons. Any leftover band is filled with the hero's background.
- **10 heroes:** each has a portrait template that recomposes the same copy, photo, colours and type for a tall screen.
  - Museum: a tap on the frame arms the lasers, a tap away disarms.
  - Licensed to Cut: a tap on the card flips it.
  - In the Lens: the lenses are the showreel links ("Tap either one").
  - Depth and Billboard: tilt by drag or gyro.
- **Thumbnails:** `thumbs/<id>-portrait.webp` (390×844 at 1.5×, 34–89 KB), with `thumbnail_portrait` added in `heroes.json`. The homepage preloads and paints the right one by aspect ratio (`<picture>` plus `<link rel=preload media=…>`).
- **`components/sections/HeroSwitch.tsx`:** the under-768px Genesis fallback is removed, so `activeHero` applies at every width. `"default"` still means the heroVariant hero.
- **`PackHeroFrame`:** the iframe now also allows `accelerometer; gyroscope` (for tilt).
- **Admin → Heroes → Pack heroes:** the "phones keep the default hero" notes are gone, and each card shows the desktop and phone thumbnails side by side.
- Commit: `f057742`. Screenshots: `docs/autopilot/heroes-phone-390x844.jpg` and `docs/autopilot/heroes-tablet-768x1024.jpg`.
- **Verified locally and live:**
  - The test matrix covered 10 heroes × 360×740, 390×844, 430×932, 768×1024, 844×390, 1024×768, 1440×900 and 1920×1080. It checks the placeholder thumbnail, portrait vs landscape layout, buttons ≥ 44 px and on screen, swipe or wheel scrolling past the hero, every button's route (at 390 and 1440 wide), and console errors. Local: 440/440. Live: 439/440 (one cache-timing artifact).
  - The touch checks passed 10/10: museum tap arms and a tap away disarms, idle drift never arms the museum, a card tap flips, a drag tilts Depth and the billboard, idle drift moves, a lens tap lands on the showreel link, and reduced motion means no drift.

### Phase 2, cycle 1
- **`1ba7581` Cache headers for `public/`.** Hero pack images, `/hero`, `/brands`, `/models` and `/audio` were `max-age=0, must-revalidate` (re-checked on every visit). They're now `max-age=86400, stale-while-revalidate=2592000`. The hero pages and runtime get `max-age=300, swr=86400`. Verified live.
- **`0a0019a` Scroll-velocity loop parks when idle.** In `lib/cinematic.ts`, the cinematic FX velocity rAF read `scrollY` and called its listeners on every frame for the life of the page (~360 ms of main thread per 7 s on a throttled phone). Scroll events now wake it, and it parks after ~0.7 s without movement.
- **`78b8985` Empty categories hidden.** See "Removed" below.
- **`1247e50` SEO:**
  - `pageMetadata` dropped the site-wide share image, so `/about`, the cuts pages, search and every category page had no `og:image` or `twitter:image`. Fixed.
  - The homepage had no `<h1>` when a pack hero is active, because the heading lives in the iframe. `PackHeroFrame` now adds a visually hidden one.
- **`99d8aee` `PageHeader` reveal moved from framer-motion to CSS.** The page title, which is the LCP element on 41 of 59 pages, sat at opacity 0 until React hydrated. It now paints with the first frame, with the same motion. Reduced motion means no animation.

## Measurements (before → after)
**How:**
- Crawler: `docs/autopilot/scripts/crawl.cjs` (a Playwright script).
- **Phone profile:** 390×844 at 3× density, touch, 4× CPU throttle, about 9 Mbps down with 150 ms latency.
- **Desktop profiles:** 1440×900 and 1920×1080, no throttling.
- **Metrics:** LCP, CLS and TBT come from PerformanceObserver.
- **Blocked:** direct `/media/**` requests (B2 cap); `/_next/image` thumbnails are allowed.
- **Before:** the live site at `11c92a8`. **After:** live at `99d8aee`.

| Page | Phone LCP | Phone TBT | Desktop LCP | Desktop TBT |
|---|---|---|---|---|
| `/` | n/a (Genesis canvas) → n/a (iframe hero) | 2561 → 2695 ms¹ | 4032 → 2228 ms | 267 → 65 ms |
| `/about` | 3416 → 716 ms | 976 → 404 ms | 1984 → 308 ms | 45 → 28 ms |
| `/ai-cuts` | 936 → 1040 ms | 1328 → 1152 ms | 1824 → 336 ms | 76 → 23 ms |
| `/contact` | 3016 → 744 ms | 743 → 796 ms | 1900 → 248 ms | 56 → 15 ms |
| `/horizontal-cuts` | 3500 → 840 ms | 1094 → 1193 ms | 1916 → 360 ms | 147 → 104 ms |
| `/search` | 608 → 856 ms | 797 → 757 ms | 1788 → 192 ms | 73 → 19 ms |
| `/vertical-cuts` | 920 → 696 ms | 2750 → 1074 ms | 2096 → 332 ms | 297 → 255 ms |
| project pages (adidas, tokyo, redbull) | ~3.9 s → 0.58–0.84 s | ~1.3 s → 0.26–0.83 s | ~1.8 s → 0.19–0.27 s | ~25 → 11–17 ms |
| category pages (fashion, tours) | 1.1–4.0 s → 0.68–0.90 s | 1.5 s → 0.41–0.97 s | ~1.8 s → 0.24–0.35 s | ~30 → 0–31 ms |

- **Scroll jank on phones:** `/vertical-cuts` went from 13/137 to 1/313 slow frames. The homepage went from 62/80 to 40/116.
- **CLS:** 0 everywhere, except a one-off 0.365 on desktop `/vertical-cuts` in one crawl that didn't reproduce in three later runs. Keep watching it.
- ¹ **Phone homepage:** before, it was the Genesis WebGL fallback; now it's the chosen pack hero (Breaking News). The remaining cost is the homepage sections plus the idle loops (see Next).
- **Idle cost on every page (not fixed yet):** ~2,400 rAF calls per 5 idle seconds on `/about` (phone profile).

## Removed
| What | Where it lived | How to restore |
|---|---|---|
| Real estate and Lifestyle categories, hidden from the public site (Fields grid, filters, search, sitemap; `/work/real-estate` and `/work/lifestyle` now 404) because they have **no projects** | `data/brand.ts` → categories (unchanged, still enabled). The filter is in `data/categories.ts` (`c.count > 0`) and `app/work/[category]/page.tsx` | Automatic: they reappear as soon as a project uses the category. To always show empty categories, drop `&& c.count > 0` in `data/categories.ts` and `\|\| category.count === 0` in the category page |

## Ask Abdo
- **Chrome DevTools MCP:** if you want it, run `/plugin marketplace add ChromeDevTools/chrome-devtools-mcp` and then `/plugin install chrome-devtools-mcp@chrome-devtools-plugins` (slash commands only you can type).
- **Vercel Node setting:** the project setting still says 24.x. `engines` overrides it (builds run on 22). You may want to set it to 22.x so the dashboard matches.

## Left / recommended
- The service worker (`public/sw.js`) caches every image cache-first forever, and `VERSION` is never bumped. If a `public/` image is ever replaced under the **same filename**, returning visitors keep the old one. Bump `VERSION` when that happens, or exclude `/heroes/`, `/hero/` and `/brands/` from cache-first.
- Thumbnails from `/media` skip the Next image optimizer, because the signed B2 redirect can't be followed or cached. So phones download the 1280 px posters. Without re-encoding anything already in B2: generate a 640 px variant at upload time going forward, or resize through the Cloudflare worker (`workers/b2-proxy`).
- Phase 2 "Next" items 1–6 above.

## Test scripts
These are in `docs/autopilot/scripts/` and use Playwright from `~/.claude/skills/gstack/node_modules/playwright-core` with Chromium 1208. All of them block direct `/media/**` requests.

| Script | What it does |
|---|---|
| `crawl.cjs <base> <pages.txt> <out.json> [mobile,desktop,wide]` | Per page: vitals, console errors, failed requests, overflow and scroll jank |
| `summ.py out.json…` | Summarises crawl output |
| `matrix.cjs [base] [ids]` | Pack-hero matrix on the homepage. Set `SHOTS=dir` to save screenshots |
| `touch.cjs [static base]` | Hero touch behaviour (needs `python -m http.server 4173` in `public/`) |
| `shoot.cjs <id>`, `thumbs.cjs` | Hero screenshots and portrait thumbnails (static server) |
| `events.cjs <url>` | Idle rAF attribution |
| `trace.cjs <url>` | Main-thread time by type |
| `profile.cjs <url>` | JavaScript self-time by script and function |

Git Bash tip: prefix commands with `MSYS_NO_PATHCONV=1` when passing `/paths` as arguments.
