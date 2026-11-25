// Renders each pack hero at 390x844 (nav=0, settled) → public/heroes/thumbs/<id>-portrait.jpg (585x1266)
const { chromium } = require("C:/Users/3SKRINO/.claude/skills/gstack/node_modules/playwright-core");
const { execFileSync } = require("child_process");
const fs = require("fs");
const pack = JSON.parse(fs.readFileSync("public/heroes/heroes.json", "utf8")).heroes;
(async () => {
  const b = await chromium.launch({ executablePath: process.env.LOCALAPPDATA + "/ms-playwright/chromium-1208/chrome-win64/chrome.exe" });
  const c = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1.5, isMobile: true, hasTouch: true, reducedMotion: "reduce" });
  const p = await c.newPage();
  for (const h of pack) {
    await p.goto(`http://127.0.0.1:4173/heroes/${h.file}?nav=0`, { waitUntil: "networkidle" });
    await p.evaluate(() => document.fonts.ready);
    await p.waitForTimeout(600);
    const png = `${process.env.CLAUDE_JOB_DIR}/tmp/${h.id}-p.png`;
    await p.screenshot({ path: png });
    const out = `public/heroes/thumbs/${h.id}-portrait.jpg`;
    execFileSync("python", ["-c", "import sys;from PIL import Image;Image.open(sys.argv[1]).convert('RGB').save(sys.argv[2],quality=78,optimize=True,progressive=True)", png, out]);
    console.log(out, fs.statSync(out).size);
  }
  await b.close();
})();
