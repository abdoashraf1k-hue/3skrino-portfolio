// CPU profile of one page load at phone speed; prints self time by script and by top functions.
// usage: node profile.cjs <url> [cpuRate=4]
const { chromium } = require("C:/Users/3SKRINO/.claude/skills/gstack/node_modules/playwright-core");
const url = process.argv[2], rate = +(process.argv[3] || 4);
(async () => {
  const b = await chromium.launch({ executablePath: process.env.LOCALAPPDATA + "/ms-playwright/chromium-1208/chrome-win64/chrome.exe" });
  const c = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 3 });
  await c.route((u) => u.pathname.startsWith("/media/"), (r) => r.abort());
  const p = await c.newPage();
  const cdp = await c.newCDPSession(p);
  await cdp.send("Emulation.setCPUThrottlingRate", { rate });
  await cdp.send("Profiler.enable");
  await cdp.send("Profiler.setSamplingInterval", { interval: 200 });
  await cdp.send("Profiler.start");
  await p.goto(url, { waitUntil: "load" });
  await p.waitForTimeout(3000);
  const { profile } = await cdp.send("Profiler.stop");
  const byId = new Map(profile.nodes.map((n) => [n.id, n]));
  const self = new Map();
  const dt = profile.timeDeltas; let i = 0;
  for (const s of profile.samples) { self.set(s, (self.get(s) || 0) + (dt[i++] || 0)); }
  const byUrl = {}, byFn = {};
  for (const [id, us] of self) {
    const n = byId.get(id); const cf = n.callFrame;
    const u = cf.url ? cf.url.replace(/^https?:\/\/[^/]+/, "").replace(/\?.*$/, "") : "(" + cf.functionName + ")";
    byUrl[u] = (byUrl[u] || 0) + us;
    const k = (cf.functionName || "(anon)") + " @ " + u.split("/").pop() + ":" + cf.lineNumber + ":" + cf.columnNumber;
    byFn[k] = (byFn[k] || 0) + us;
  }
  const top = (o, n) => Object.entries(o).sort((a, b) => b[1] - a[1]).slice(0, n).map(([k, v]) => `${(v / 1000).toFixed(0).padStart(6)} ms  ${k}`).join("\n");
  console.log("== self time by script (throttled ×" + rate + ")\n" + top(byUrl, 14));
  console.log("== top functions\n" + top(byFn, 18));
  await b.close();
})();
