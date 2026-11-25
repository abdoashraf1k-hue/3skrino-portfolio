// Phase 1 test matrix: every pack hero on the homepage (?activeHero=<id>) at phone, tablet and desktop sizes.
// usage: node matrix.cjs [BASE] [ids,comma]   (BASE default http://localhost:3000)
const { chromium } = require("C:/Users/3SKRINO/.claude/skills/gstack/node_modules/playwright-core");
const fs = require("fs");
const BASE = process.argv[2] || "http://localhost:3000";
const pack = JSON.parse(fs.readFileSync("public/heroes/heroes.json", "utf8")).heroes;
const only = process.argv[3] ? process.argv[3].split(",") : null;
const OUT = process.env.SHOTS || process.env.CLAUDE_JOB_DIR + "/tmp/matrix";
fs.mkdirSync(OUT, { recursive: true });
const EXPECT = { "#showreel": "/vertical-cuts?view=player", "#contact": "/contact", "#work": "/vertical-cuts", "#vertical": "/vertical-cuts", "#horizontal": "/horizontal-cuts", "#ai": "/ai-cuts", "#about": "/about" };
// [w, h, touch]
const SIZES = [[360, 740, 1], [390, 844, 1], [430, 932, 1], [768, 1024, 1], [844, 390, 1], [1024, 768, 1], [1440, 900, 0], [1920, 1080, 0]];
const NAV_SIZES = new Set(["390x844", "1440x900"]); // click every hero link at these
const results = [];
const ok = (n, p, i = "") => { results.push({ n, p, i }); if (!p || process.env.VERBOSE) console.log(`${p ? "PASS" : "FAIL"}  ${n}${i ? "  — " + i : ""}`); };
const ready = (p) => p.waitForFunction(() => document.querySelector("section#home iframe")?.classList.contains("opacity-100"), null, { timeout: 40000 });
async function nav(p, url) { try { await p.goto(url, { waitUntil: "load", timeout: 90000 }); } catch { await p.goto(url, { waitUntil: "load", timeout: 90000 }); } }
const heroFrame = (p, h) => p.frame({ url: new RegExp(h.file.replace(".", "\\.")) });

(async () => {
  const b = await chromium.launch({ executablePath: process.env.LOCALAPPDATA + "/ms-playwright/chromium-1208/chrome-win64/chrome.exe" });
  for (const [w, hgt, touch] of SIZES) {
    const tag = `${w}x${hgt}`;
    const c = await b.newContext({ viewport: { width: w, height: hgt }, isMobile: !!touch, hasTouch: !!touch, deviceScaleFactor: 1 });
    await c.route((u) => u.pathname.startsWith("/media/"), (r) => r.abort());
    await c.route("**/api/**", (r) => (r.request().method() === "GET" ? r.continue() : r.abort()));
    const p = await c.newPage();
    const errs = [];
    p.on("pageerror", (e) => errs.push(e.message));
    p.on("console", (m) => { if (m.type() === "error" && !/media|Failed to load resource|ERR_FAILED|360° frame|watermark/i.test(m.text())) errs.push(m.text().slice(0, 160)); });
    for (const h of pack) {
      if (only && !only.includes(h.id)) continue;
      errs.length = 0;
      const url = `${BASE}/?activeHero=${h.id}`;
      await nav(p, url);
      // first paint: the right placeholder (portrait screenshot when the hero will show its portrait layout)
      const ph = await p.evaluate(() => { const i = document.querySelector("section#home picture img"); return i ? i.currentSrc : null; });
      const wantPortrait = w / hgt < 1.1;
      try { await ready(p); } catch { ok(`${tag} ${h.id}: frame loads`, false); continue; }
      ok(`${tag} ${h.id}: placeholder ${wantPortrait ? "portrait" : "desktop"}`, !!ph && (wantPortrait ? /-portrait\.webp$/.test(ph) : /thumbs\/[a-z-]+\.jpg$/.test(ph)), String(ph));
      const f = heroFrame(p, h);
      const st = await f.evaluate(() => {
        const r = document.querySelector(".dc-root");
        const s = parseFloat(getComputedStyle(r).getPropertyValue("--dc-s")) || 1;
        const vis = [...r.querySelectorAll("a,button")].filter((a) => a.offsetParent && getComputedStyle(a).visibility !== "hidden" && !a.closest('nav[aria-label="Primary"]'));
        const bad = vis.filter((a) => !a.classList.contains("lens")).map((a) => {
          const q = a.getBoundingClientRect(); const af = getComputedStyle(a, "::after");
          const hh = Math.max(q.height, af.content !== "none" ? parseFloat(af.height) * s : 0);
          return { t: (a.textContent.trim() || a.getAttribute("href")).slice(0, 14), hh: Math.round(hh), out: q.right > innerWidth + 1 || q.left < -1 || q.bottom > innerHeight + 1 || q.top < -1 };
        }).filter((x) => x.hh < 44 || x.out);
        return { mode: document.documentElement.dataset.mode, bad };
      });
      ok(`${tag} ${h.id}: mode ${wantPortrait ? "portrait" : "landscape"}`, st.mode === (wantPortrait ? "portrait" : "landscape"), st.mode);
      ok(`${tag} ${h.id}: buttons ≥44px and on screen`, st.bad.length === 0, JSON.stringify(st.bad));
      await p.screenshot({ path: `${OUT}/${h.id}-${tag}.png` });
      // scrolling past the hero: touch swipe over the iframe on touch sizes, wheel otherwise
      if (touch) {
        // raw touch events (synthesizeScrollGesture does not scroll in headless Chrome)
        const cdp = await c.newCDPSession(p);
        const x = Math.round(w / 2), y0 = Math.round(hgt * 0.75), y1 = Math.round(hgt * 0.15);
        await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x, y: y0 }] });
        for (let i = 1; i <= 12; i++) await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x, y: y0 + ((y1 - y0) * i) / 12 }] });
        await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
        await p.waitForTimeout(800);
      } else {
        await p.mouse.move(w / 2, hgt / 2);
        for (let i = 0; i < 4; i++) { await p.mouse.wheel(0, 300); await p.waitForTimeout(80); }
        await p.waitForTimeout(1500);
      }
      const sy = await p.evaluate(() => window.scrollY);
      ok(`${tag} ${h.id}: scrolling over the hero scrolls the page`, sy > hgt * 0.3, `scrollY=${sy}`);
      if (NAV_SIZES.has(tag)) {
        const hrefs = [...new Set(await f.$$eval('a[href^="#"]', (as) => as.filter((a) => a.offsetParent).map((a) => a.getAttribute("href"))))];
        for (const href of hrefs) {
          await nav(p, url); await ready(p);
          const g = heroFrame(p, h);
          if (href === "#top") {
            await p.evaluate(() => window.scrollTo(0, 300)); await p.waitForTimeout(300);
            await g.$eval('a[href="#top"]', (a) => a.click()); await p.waitForTimeout(2000);
            ok(`${tag} ${h.id}: #top`, (await p.evaluate(() => scrollY)) < 5); continue;
          }
          await g.$eval(`a[href="${href}"]:not([style*="display: none"])`, (a) => a.click());
          const want = EXPECT[href];
          try { await p.waitForURL((u) => u.pathname + u.search === want, { timeout: 30000 }); ok(`${tag} ${h.id}: ${href} → ${want}`, true); }
          catch { ok(`${tag} ${h.id}: ${href} → ${want}`, false, p.url()); }
        }
      }
      ok(`${tag} ${h.id}: no console errors`, errs.length === 0, errs.slice(0, 2).join(" | "));
    }
    await c.close();
  }
  await b.close();
  const fails = results.filter((r) => !r.p);
  fs.writeFileSync(`${OUT}/results.json`, JSON.stringify(results, null, 1));
  console.log(`\n${results.length - fails.length}/${results.length} passed`);
})().catch((e) => { console.error(e); process.exit(1); });
