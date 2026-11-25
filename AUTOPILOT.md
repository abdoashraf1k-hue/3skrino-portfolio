# AUTOPILOT log

Running log for the final-polish autopilot run (started 2026-11-25). A fresh session can pick up with
"Continue from AUTOPILOT.md": read **Status / next** first.

## Status / next
- [x] Phase 0: tools
- [ ] Phase 1: chosen pack hero works on phones and tablets (in progress)
- [ ] Phase 2: crawl and fix cycles

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

## Measurements (before → after)

## Removed
_(what, where it lived, how to restore)_

## Ask Abdo

## Left / recommended
