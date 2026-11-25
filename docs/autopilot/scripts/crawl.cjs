// Phase 2 crawler. usage: node crawl.cjs <BASE> <pages.txt> <out.json> [profiles=mobile,desktop,wide]
// Per page + profile: console errors, failed requests, broken images/videos, horizontal overflow,
// small tap targets (mobile), LCP / CLS / TBT (PerformanceObserver), long tasks + layout shifts while
// scrolling. direct /media/** requests (all video, raw B2 files) are blocked for the B2 daily cap;
// /_next/image thumbnails are allowed (Vercel caches the optimized copies).
const { chromium } = require("C:/Users/3SKRINO/.claude/skills/gstack/node_modules/playwright-core");
const fs = require("fs");
const [BASE, LIST, OUTF, PROF] = process.argv.slice(2);
const pages = fs.readFileSync(LIST, "utf8").split(/\r?\n/).filter(Boolean);
const PROFILES = {
  mobile: { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 3, cpu: 4, net: { latency: 150, downloadThroughput: (9 * 1024 * 1024) / 8, uploadThroughput: (1.5 * 1024 * 1024) / 8 } },
  desktop: { viewport: { width: 1440, height: 900 }, isMobile: false, hasTouch: false, deviceScaleFactor: 1, cpu: 1 },
  wide: { viewport: { width: 1920, height: 1080 }, isMobile: false, hasTouch: false, deviceScaleFactor: 1, cpu: 1 },
};
const want = (PROF || "mobile,desktop,wide").split(",");
const isMedia = (u) => /^https?:\/\/[^/]+\/media\//.test(u);

const VITALS = () => {
  window.__v = { lcp: 0, lcpEl: "", cls: 0, tbt: 0, longTasks: 0, shiftsAfterLoad: 0 };
  const loadT = { t: 0 };
  addEventListener("load", () => (loadT.t = performance.now()));
  try {
    new PerformanceObserver((l) => { for (const e of l.getEntries()) { window.__v.lcp = e.startTime; const el = e.element; window.__v.lcpEl = el ? (el.tagName + (el.id ? "#" + el.id : "") + (el.className && typeof el.className === "string" ? "." + el.className.split(" ").slice(0, 2).join(".") : "") + (el.currentSrc || el.src ? " " + (el.currentSrc || el.src).slice(-60) : "")) : ""; } }).observe({ type: "largest-contentful-paint", buffered: true });
    new PerformanceObserver((l) => { for (const e of l.getEntries()) if (!e.hadRecentInput) { window.__v.cls += e.value; if (loadT.t && e.startTime > loadT.t + 1000) window.__v.shiftsAfterLoad += e.value; } }).observe({ type: "layout-shift", buffered: true });
    new PerformanceObserver((l) => { for (const e of l.getEntries()) { window.__v.longTasks++; if (e.duration > 50) window.__v.tbt += e.duration - 50; } }).observe({ type: "longtask", buffered: true });
  } catch {}
};

(async () => {
  const b = await chromium.launch({ executablePath: process.env.LOCALAPPDATA + "/ms-playwright/chromium-1208/chrome-win64/chrome.exe" });
  const out = [];
  for (const prof of want) {
    const P = PROFILES[prof];
    const c = await b.newContext({ viewport: P.viewport, isMobile: P.isMobile, hasTouch: P.hasTouch, deviceScaleFactor: P.deviceScaleFactor });
    await c.route((u) => u.pathname.startsWith("/media/"), (r) => r.abort());
    await c.route("**/api/admin/**", (r) => r.abort());
    await c.addInitScript(VITALS);
    for (const path of pages) {
      const p = await c.newPage();
      const cdp = await c.newCDPSession(p);
      if (P.cpu > 1) await cdp.send("Emulation.setCPUThrottlingRate", { rate: P.cpu });
      if (P.net) { await cdp.send("Network.enable"); await cdp.send("Network.emulateNetworkConditions", { offline: false, ...P.net }); }
      const errs = [], failed = [], bytes = { js: 0, css: 0, img: 0, font: 0, other: 0 };
      p.on("pageerror", (e) => errs.push("pageerror: " + e.message.slice(0, 200)));
      p.on("console", (m) => { if (m.type() === "error") errs.push(m.text().slice(0, 200)); });
      p.on("requestfailed", (r) => { if (!isMedia(r.url()) && !/api\/admin/.test(r.url())) failed.push((r.failure()?.errorText || "") + " " + r.url().slice(0, 140)); });
      p.on("response", async (r) => {
        const u = r.url();
        if (r.status() >= 400 && !isMedia(u)) failed.push(r.status() + " " + u.slice(0, 140));
        const t = r.request().resourceType();
        const len = parseInt(r.headers()["content-length"] || "0", 10) || 0;
        const k = t === "script" ? "js" : t === "stylesheet" ? "css" : t === "image" ? "img" : t === "font" ? "font" : "other";
        bytes[k] += len;
      });
      const t0 = Date.now();
      let status = 0;
      try { const r = await p.goto(BASE + path, { waitUntil: "load", timeout: 90000 }); status = r ? r.status() : 0; } catch (e) { errs.push("goto: " + e.message.slice(0, 120)); }
      const loadMs = Date.now() - t0;
      await p.waitForTimeout(2500);
      const before = await p.evaluate(() => ({ ...window.__v }));
      // scroll through the page in steps, counting long tasks / shifts caused by scrolling
      const scroll = await p.evaluate(async () => {
        const lt0 = window.__v.longTasks, tbt0 = window.__v.tbt, cls0 = window.__v.cls;
        const H = document.documentElement.scrollHeight; let frames = 0, slow = 0, last = performance.now(), run = true;
        const tick = (t) => { frames++; if (t - last > 50) slow++; last = t; if (run) requestAnimationFrame(tick); };
        requestAnimationFrame(tick);
        for (let y = 0; y < Math.min(H, 12000); y += innerHeight * 0.8) { window.scrollTo(0, y); await new Promise((r) => setTimeout(r, 250)); }
        run = false;
        return { height: H, longTasks: window.__v.longTasks - lt0, tbt: Math.round(window.__v.tbt - tbt0), cls: +(window.__v.cls - cls0).toFixed(4), frames, slowFrames: slow };
      });
      const dom = await p.evaluate(() => {
        const vw = innerWidth;
        const over = [...document.querySelectorAll("body *")].filter((e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.right > vw + 2 && getComputedStyle(e).position !== "fixed"; }).slice(0, 5).map((e) => e.tagName + "." + (typeof e.className === "string" ? e.className.split(" ").slice(0, 3).join(".") : "") + " r=" + Math.round(e.getBoundingClientRect().right));
        const imgs = [...document.images];
        const broken = imgs.filter((i) => i.complete && i.naturalWidth === 0 && !/\/media\//.test(i.currentSrc || i.src) && !(i.currentSrc || i.src).includes("_next/image?url=%2Fmedia")).map((i) => (i.currentSrc || i.src).slice(-80));
        const noAlt = imgs.filter((i) => !i.hasAttribute("alt")).length;
        const vids = [...document.querySelectorAll("video")].map((v) => ({ src: (v.currentSrc || v.getAttribute("src") || v.querySelector("source")?.src || "").slice(-50), preload: v.getAttribute("preload"), poster: !!v.getAttribute("poster"), autoplay: v.autoplay }));
        const small = [...document.querySelectorAll("a,button,[role=button],input,select,textarea")].filter((e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0 && (r.width < 24 || r.height < 24) && getComputedStyle(e).visibility !== "hidden"; }).length;
        const h1 = document.querySelectorAll("h1").length;
        const title = document.title, desc = document.querySelector('meta[name="description"]')?.content || "", og = !!document.querySelector('meta[property="og:image"]'), canon = document.querySelector('link[rel="canonical"]')?.href || "";
        return { scrollW: document.documentElement.scrollWidth, vw, over, broken, noAlt, imgs: imgs.length, vids, small, h1, title, desc: desc.length, og, canon };
      });
      out.push({ prof, path, status, loadMs, lcp: Math.round(before.lcp), lcpEl: before.lcpEl, cls: +before.cls.toFixed(4), tbt: Math.round(before.tbt), scroll, dom, bytes, errs: [...new Set(errs)].slice(0, 8), failed: [...new Set(failed)].slice(0, 8) });
      const o = out[out.length - 1];
      console.log(`${prof.padEnd(7)} ${path.padEnd(52)} ${status} LCP ${o.lcp} CLS ${o.cls} TBT ${o.tbt} | scroll LT ${o.scroll.longTasks} slow ${o.scroll.slowFrames}/${o.scroll.frames} | ovf ${o.dom.scrollW > o.dom.vw ? o.dom.scrollW : "-"} err ${o.errs.length} fail ${o.failed.length} broken ${o.dom.broken.length} vids ${o.dom.vids.length}`);
      await p.close();
    }
    await c.close();
  }
  await b.close();
  fs.writeFileSync(OUTF, JSON.stringify(out, null, 1));
})().catch((e) => { console.error(e); process.exit(1); });
