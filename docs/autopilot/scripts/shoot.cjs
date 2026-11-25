// usage: node shoot.cjs <id> [query]  → tmp/hs/<id>-sheet.png (phones, tablet portrait, desktop) + errors
const { chromium } = require("C:/Users/3SKRINO/.claude/skills/gstack/node_modules/playwright-core");
const { execFileSync } = require("child_process");
const id = process.argv[2], q = process.argv[3] || "?nav=0";
const OUT = process.env.CLAUDE_JOB_DIR + "/tmp/hs";
const SIZES = [[360, 740], [390, 844], [430, 932], [768, 1024], [844, 390], [1440, 810]];
(async () => {
  const b = await chromium.launch({ executablePath: process.env.LOCALAPPDATA + "/ms-playwright/chromium-1208/chrome-win64/chrome.exe" });
  const files = [];
  for (const [w, h] of SIZES) {
    const mobile = w < 1000;
    const c = await b.newContext({ viewport: { width: w, height: h }, isMobile: mobile, hasTouch: mobile, deviceScaleFactor: 1, reducedMotion: "reduce" });
    const p = await c.newPage();
    const errs = [];
    p.on("pageerror", (e) => errs.push(e.message));
    p.on("console", (m) => m.type() === "error" && !/404/.test(m.text()) && errs.push(m.text()));
    p.on("requestfailed", (r) => errs.push("FAILED " + r.url())); p.on("response", (r) => r.status() >= 400 && !/favicon/.test(r.url()) && errs.push(r.status() + " " + r.url()));
    await p.goto(`http://127.0.0.1:4173/heroes/heroes/${id}.html${q}`, { waitUntil: "networkidle" });
    await p.waitForTimeout(700);
    const info = await p.evaluate(() => {
      const small = [...document.querySelectorAll(".dc-root a, .dc-root button")].filter((a) => a.offsetParent).map((a) => { const r = a.getBoundingClientRect(); const sc = parseFloat(getComputedStyle(document.querySelector(".dc-root")).getPropertyValue("--dc-s")) || 1; const af = getComputedStyle(a, "::after"); const ah = af.content !== "none" ? parseFloat(af.height) * sc : 0; const aw = af.content !== "none" ? parseFloat(af.width) * sc : 0; return { t: a.textContent.trim().slice(0, 16) || a.getAttribute("aria-label") || a.getAttribute("href"), h: Math.round(Math.max(r.height, ah)), w: Math.round(Math.max(r.width, aw)), out: r.right > innerWidth + 1 || r.left < -1 || r.bottom > innerHeight + 1 || r.top < -1 }; });
      return { mode: document.documentElement.dataset.mode, links: small };
    });
    const f = `${OUT}/${id}-${w}x${h}.png`;
    await p.screenshot({ path: f });
    files.push(f);
    const flag = info.links.filter((l) => l.h < 44 || l.out).map((l) => `${l.t}(${l.w}x${l.h}${l.out ? " OUT" : ""})`);
    console.log(`${w}x${h} mode=${info.mode} targets<44/out: ${flag.join(", ") || "none"}${errs.length ? " ERR: " + errs.slice(0, 3).join(" | ") : ""}`);
    await c.close();
  }
  await b.close();
  execFileSync("python", ["-c", `
import sys
from PIL import Image
fs=sys.argv[2:]; ims=[Image.open(f) for f in fs]
H=520; ims=[i.resize((int(i.width*H/i.height),H)) for i in ims]
W=sum(i.width for i in ims)+10*(len(ims)-1)
s=Image.new('RGB',(W,H),'#888'); x=0
for i in ims: s.paste(i,(x,0)); x+=i.width+10
s.save(sys.argv[1])`, `${OUT}/${id}-sheet.png`, ...files]);
})().catch((e) => { console.error(e); process.exit(1); });
