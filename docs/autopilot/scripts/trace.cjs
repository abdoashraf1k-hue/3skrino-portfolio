// Timeline trace of a page load + idle at phone speed; sums main-thread time by event type
// (style recalc, layout, paint, script…) for the top frame and for iframes.
// usage: node trace.cjs <url> [idleMs=4000] [cpu=4]
const { chromium } = require("C:/Users/3SKRINO/.claude/skills/gstack/node_modules/playwright-core");
const url = process.argv[2], idle = +(process.argv[3] || 4000), rate = +(process.argv[4] || 4);
(async () => {
  const b = await chromium.launch({ executablePath: process.env.LOCALAPPDATA + "/ms-playwright/chromium-1208/chrome-win64/chrome.exe" });
  const c = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 3 });
  await c.route((u) => u.pathname.startsWith("/media/"), (r) => r.abort());
  const p = await c.newPage();
  const cdp = await c.newCDPSession(p);
  await cdp.send("Emulation.setCPUThrottlingRate", { rate });
  const events = [];
  cdp.on("Tracing.dataCollected", (d) => events.push(...d.value));
  const done = new Promise((r) => cdp.once("Tracing.tracingComplete", r));
  await cdp.send("Tracing.start", { traceConfig: { includedCategories: ["devtools.timeline", "disabled-by-default-devtools.timeline", "blink", "cc", "gpu"] }, transferMode: "ReportEvents" });
  await p.goto(url, { waitUntil: "load" });
  const tLoad = Date.now();
  await p.waitForTimeout(idle);
  await cdp.send("Tracing.end");
  await done;
  // main renderer threads: CrRendererMain per process
  const mains = new Set(events.filter((e) => e.name === "thread_name" && e.args?.name === "CrRendererMain").map((e) => e.pid + ":" + e.tid));
  const sum = {};
  let total = 0;
  for (const e of events) {
    if (e.ph !== "X" || !mains.has(e.pid + ":" + e.tid) || !e.dur) continue;
    if (!/^(UpdateLayoutTree|Layout|Paint|PrePaint|Layerize|UpdateLayer|CompositeLayers|ParseHTML|ParseAuthorStyleSheet|EvaluateScript|v8\.compile|FunctionCall|TimerFire|FireAnimationFrame|EventDispatch|HitTest|Commit|RunMicrotasks|v8\.parseOnBackground|ScheduleStyleRecalculation|RecalculateStyles|Decode Image|ImageDecodeTask|GCEvent|MinorGC|MajorGC|IntersectionObserverController::computeIntersections|UpdateLayerTree)$/.test(e.name)) continue;
    sum[e.name] = (sum[e.name] || 0) + e.dur / 1000;
  }
  const rows = Object.entries(sum).sort((a, b) => b[1] - a[1]).slice(0, 16);
  console.log(`main-thread time by event (×${rate} CPU, load + ${idle}ms idle):`);
  for (const [k, v] of rows) console.log(`${v.toFixed(0).padStart(7)} ms  ${k}`);
  // count animation frames during idle
  const frames = events.filter((e) => e.name === "FireAnimationFrame" && mains.has(e.pid + ":" + e.tid)).length;
  const paints = events.filter((e) => e.name === "Paint" && mains.has(e.pid + ":" + e.tid)).length;
  console.log(`rAF callbacks: ${frames}, paints: ${paints}`);
  await b.close();
})().catch((e) => { console.error(e); process.exit(1); });
