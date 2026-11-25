// Touch behaviour of the pack heroes (standalone pages on the static server, phone portrait, touch).
const { chromium } = require("C:/Users/3SKRINO/.claude/skills/gstack/node_modules/playwright-core");
const BASE = process.argv[2] || "http://127.0.0.1:4173";
const res = [];
const ok = (n, p, i = "") => { res.push(p); console.log(`${p ? "PASS" : "FAIL"}  ${n}${i ? "  — " + i : ""}`); };
async function drag(cdp, pts) {
  await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [pts[0]] });
  for (const q of pts.slice(1)) await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [q] });
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
}
const mx = (p, sel) => p.evaluate((s) => getComputedStyle(document.querySelector(s)).getPropertyValue("--mx").trim(), sel);

(async () => {
  const b = await chromium.launch({ executablePath: process.env.LOCALAPPDATA + "/ms-playwright/chromium-1208/chrome-win64/chrome.exe" });
  const ctx = (rm) => b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, reducedMotion: rm ? "reduce" : "no-preference" });
  const c = await ctx(false);
  const p = await c.newPage();
  const cdp = await c.newCDPSession(p);
  const open = async (id) => { await p.goto(`${BASE}/heroes/heroes/${id}.html?nav=0`, { waitUntil: "networkidle" }); await p.waitForTimeout(400); };

  // Museum: tap on the frame arms the lasers, tap away disarms; idle drift never arms them
  await open("museum");
  await p.waitForTimeout(3500);
  ok("museum: idle drift does not arm the lasers", !(await p.evaluate(() => document.querySelector(".mu").classList.contains("on"))));
  const fr = await p.evaluate(() => { const r = document.querySelector(".mu-frame").getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; });
  await p.touchscreen.tap(fr.x, fr.y); await p.waitForTimeout(300);
  const armed = await p.evaluate(() => ({ on: document.querySelector(".mu").classList.contains("on"), msg: document.querySelector(".mu-copy p").textContent }));
  ok("museum: tap on the frame arms the lasers", armed.on && /Lasers armed/.test(armed.msg), armed.msg.slice(0, 40));
  await p.touchscreen.tap(195, 120); await p.waitForTimeout(300);
  ok("museum: tap away disarms", !(await p.evaluate(() => document.querySelector(".mu").classList.contains("on"))));

  // Licensed to Cut: tap the card flips it, the button flips it back
  await open("licensed-to-cut");
  const card = await p.evaluate(() => { const r = document.querySelector(".lc-card").getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; });
  await p.touchscreen.tap(card.x, card.y); await p.waitForTimeout(700);
  const flipped = await p.evaluate(() => document.querySelector(".lc .flip").getAttribute("style").includes("rotateY(180deg)"));
  ok("licensed-to-cut: tap the card flips it", flipped);
  await p.evaluate(() => document.querySelector(".lc-flip").click()); await p.waitForTimeout(300);
  ok("licensed-to-cut: button flips it back", await p.evaluate(() => document.querySelector(".lc .flip").getAttribute("style").includes("rotateY(0deg)")));

  // Depth + Billboard: a sideways touch drag tilts the layers
  for (const [id, sel] of [["depth", ".pt"], ["billboard-too-cold", ".pb"]]) {
    await open(id);
    await drag(cdp, [{ x: 60, y: 600 }, { x: 120, y: 602 }, { x: 220, y: 604 }, { x: 340, y: 606 }]);
    await p.waitForTimeout(150);
    const v = parseFloat(await mx(p, sel));
    ok(`${id}: sideways drag tilts the hero`, v > 0.5, `--mx=${v}`);
  }

  // Idle drift (no gyro in headless): --mx keeps changing without input
  await open("depth");
  await p.waitForTimeout(3000);
  const a1 = await mx(p, ".pt"); await p.waitForTimeout(1200); const a2 = await mx(p, ".pt");
  ok("idle drift moves the hero when nobody touches it", a1 !== a2 && a1 !== "", `${a1} → ${a2}`);

  // In the Lens: tapping a lens is the showreel link
  await open("in-the-lens");
  const lens = await p.evaluate(() => { const a = document.querySelector(".il .lens"); const r = document.querySelector(".il-crop").getBoundingClientRect(); return { x: r.left + r.width * 0.33, y: r.top + r.height * 0.38, href: a.getAttribute("href") }; });
  const hit = await p.evaluate(({ x, y }) => { const el = document.elementFromPoint(x, y); const a = el && el.closest("a"); return a ? a.getAttribute("href") : (el ? el.tagName : null); }, lens);
  ok("in-the-lens: a tap on the left lens lands on the showreel link", hit === "#showreel", String(hit));

  // Reduced motion: no drift
  const r = await ctx(true); const q = await r.newPage();
  await q.goto(`${BASE}/heroes/heroes/depth.html?nav=0`, { waitUntil: "networkidle" }); await q.waitForTimeout(3500);
  const rm = await q.evaluate(() => getComputedStyle(document.querySelector(".pt")).getPropertyValue("--mx").trim());
  ok("reduced motion: no idle drift", rm === "" || rm === "0", `--mx=${rm || "(unset)"}`);

  await b.close();
  console.log(`\n${res.filter(Boolean).length}/${res.length} passed`);
})().catch((e) => { console.error(e); process.exit(1); });
