// Counts idle events on a page and attributes requestAnimationFrame calls to their callers.
const { chromium } = require("C:/Users/3SKRINO/.claude/skills/gstack/node_modules/playwright-core");
(async () => {
  const b = await chromium.launch({ executablePath: process.env.LOCALAPPDATA + "/ms-playwright/chromium-1208/chrome-win64/chrome.exe" });
  const c = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  await c.route((u) => u.pathname.startsWith("/media/"), (r) => r.abort());
  await c.addInitScript(() => {
    window.__ev = { scroll: 0, resize: 0, raf: 0 };
    window.__st = {};
    addEventListener("scroll", () => window.__ev.scroll++, { passive: true, capture: true });
    addEventListener("resize", () => window.__ev.resize++);
    const R = window.requestAnimationFrame.bind(window);
    window.requestAnimationFrame = (f) => {
      window.__ev.raf++;
      if (window.__rec) {
        const lines = String(new Error().stack || "").split(String.fromCharCode(10)).slice(2, 6);
        const st = lines.map((l) => l.trim().replace(/https?:..[^/]+/, "")).join(" < ");
        window.__st[st] = (window.__st[st] || 0) + 1;
      }
      return R(f);
    };
  });
  const p = await c.newPage();
  await p.goto(process.argv[2], { waitUntil: "load" });
  await p.waitForTimeout(3000);
  const a = await p.evaluate(() => { window.__rec = true; return { ...window.__ev }; });
  await p.waitForTimeout(5000);
  const z = await p.evaluate(() => ({ ...window.__ev }));
  console.log("during 5s idle:", { scroll: z.scroll - a.scroll, resize: z.resize - a.resize, raf: z.raf - a.raf });
  const st = await p.evaluate(() => Object.entries(window.__st).sort((x, y) => y[1] - x[1]).slice(0, 12));
  for (const [k, v] of st) console.log(String(v).padStart(5), k.slice(0, 260));
  await b.close();
})();
