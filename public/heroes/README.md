# 3SKRINO hero collection

Ten interactive hero designs for the 3SKRINO portfolio, exported from Claude Design as standalone pages. Each one works on its own in any browser, with no build step.

## What is in this folder

| Path | What it is |
|---|---|
| `heroes.json` | The list of heroes: id, title, description, file, thumbnail and the `#links` each one uses |
| `heroes/*.html` | One self-contained page per hero, designed at 1440×810 |
| `runtime/dc-lite.js` | A small script (about 250 lines, no dependencies) that runs the heroes' interactions and scales them to the screen |
| `assets/` | Photos, layers and logos the heroes use |
| `thumbs/` | A 960×540 screenshot of each hero (`<id>.jpg`) and a 390×844 phone screenshot (`<id>-portrait.webp`) |
| `preview.html` | A gallery of all ten. Open it through a local server, for example `npx serve .` |
| `CLAUDE_CODE_PROMPT.md` | The instructions to give Claude Code to add this to the site |

## The heroes

| id | Title | Interaction |
|---|---|---|
| `depth` | Depth | 3D layers: logo behind, glasses and chains come toward the viewer with the mouse |
| `museum` | Museum | Gilded frame in a gallery; lasers and an alarm when the cursor gets close |
| `billboard-too-cold` | Billboard: TOO COLD | Night billboard he breaks out of; tilts with the mouse |
| `billboard-too-late` | Billboard: TOO LATE | Same billboard, second copy line |
| `daily-cut` | The Daily Cut | Tabloid; "Next scandal" cycles 5 headlines; flash on photo hover |
| `breaking-news` | Breaking News | Broadcast; "Next update" cycles 4 headlines; live Cairo clock; ticker |
| `licensed-to-cut` | Licensed to Cut | Holographic ID card that tilts and flips |
| `whiteout` | Whiteout | Clean white hero, parallax |
| `in-the-lens` | In the Lens | Close-up; the showreel plays in the sunglasses |
| `red-sun` | Red Sun | Red sun; CUTS YOU CAN'T SKIP split around him |

## URL options for each hero page

- `?fit=cover` fills the screen and crops the edges (default). `?fit=contain` shows the whole frame. `?fit=width` scales to the width and sets its own height.
- `?nav=0` hides the hero's own top menu, for use under the site's real navigation.

## Talking to the host page

When a hero runs inside an iframe it sends `window.postMessage` events to the parent instead of navigating:

- `{ type: '3skrino-hero-nav', href: '#showreel' }` when a button or link is clicked. Hrefs used: `#showreel`, `#contact`, `#work`, `#vertical`, `#horizontal`, `#ai`, `#about`, `#top`.
- `{ type: '3skrino-hero-wheel', deltaY, deltaX }` when the mouse wheel is used over the hero, so the page can keep scrolling.

## Notes

- Each hero has a desktop composition (1440×810, `#dc-template`) and a portrait one (`#dc-template-portrait`, canvas 844 tall and 390–640 wide) that the runtime picks whenever the viewport is taller than ~wide. Touch drags, device tilt (after a tap on iOS) and a slow idle drift stand in for the mouse; `prefers-reduced-motion` turns the motion off.
- Fonts load from Google Fonts.
