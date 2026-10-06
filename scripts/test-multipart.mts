/**
 * Sprint 12 — unit tests for lib/admin/multipart.ts under fake transports.
 * Run: npx -y tsx scripts/test-multipart.mts
 */
import assert from "node:assert/strict";
import { uploadToStore, type Api, type PutTransport } from "../lib/admin/multipart";
import { LIMITS, type UploadRequest } from "../lib/admin/storage/contract";

const MiB = 1024 * 1024;
const PART = 8 * MiB; // the fake server's part size (keeps tests small)

type Call = UploadRequest;
type Put = { url: string; size: number; start: number; headers?: Record<string, string> };

function fakeFile(size: number, type = "video/mp4"): Blob & { name: string } {
  // A tiny repeated buffer is enough — slices only need correct offsets/sizes.
  const blob = new Blob([new Uint8Array(size)], { type });
  return Object.assign(blob, { name: "clip.mp4" });
}

/** Records every API call; mints URLs like "u:<part>:<generation>". */
function fakeServer(opts: { partSize?: number; partDelay?: number } = {}) {
  const calls: Call[] = [];
  const gen = new Map<number, number>();
  const sign = (nums: number[]) => {
    const urls: Record<number, string> = {};
    for (const n of nums) {
      gen.set(n, (gen.get(n) ?? 0) + 1);
      urls[n] = `u:${n}:${gen.get(n)}`;
    }
    return urls;
  };
  const api: Api = async <T,>(body: UploadRequest): Promise<T> => {
    calls.push(body);
    await new Promise((r) => setTimeout(r, 1));
    switch (body.action) {
      case "put":
        return { key: "videos/1700000000000-abcdef.mp4", url: "single", headers: { "Content-Type": body.contentType }, publicUrl: "https://cdn/x", expiresIn: 900 } as T;
      case "multipart-start": {
        const partSize = opts.partSize ?? PART;
        const partCount = Math.ceil(body.size / partSize);
        const first = Array.from({ length: Math.min(LIMITS.signBatch, partCount) }, (_, i) => i + 1);
        return { key: "videos/1700000000000-abcdef.mp4", uploadId: "U1", partSize, partCount, urls: sign(first), publicUrl: "https://cdn/v", expiresIn: 900 } as T;
      }
      case "multipart-part":
        return { urls: sign(body.partNumbers), expiresIn: 900 } as T;
      case "multipart-complete":
        return { publicUrl: "https://cdn/v", size: 0 } as T;
      case "multipart-abort":
        return { ok: true } as T;
      default:
        throw new Error("unexpected " + body.action);
    }
  };
  return { api, calls };
}

type Behaviour = (url: string, attempt: number) => { status?: number; etag?: string | null; throwStatus?: number } | undefined;

function fakePut(behaviour: Behaviour = () => undefined, delay = 2) {
  const puts: Put[] = [];
  const attempts = new Map<string, number>();
  let inFlight = 0;
  let maxInFlight = 0;
  const put: PutTransport = (url, body, { headers, signal, onProgress }) =>
    new Promise((resolve, reject) => {
      const part = url.split(":")[1] ?? "1";
      const attempt = (attempts.get(part) ?? 0) + 1;
      attempts.set(part, attempt);
      inFlight++;
      maxInFlight = Math.max(maxInFlight, inFlight);
      const onAbort = () => {
        clearTimeout(t);
        inFlight--;
        reject(new DOMException("aborted", "AbortError"));
      };
      signal.addEventListener("abort", onAbort, { once: true });
      onProgress(Math.floor(body.size / 2));
      const t = setTimeout(() => {
        signal.removeEventListener("abort", onAbort);
        inFlight--;
        const b = behaviour(url, attempt);
        if (b?.throwStatus !== undefined) return reject(Object.assign(new Error(`HTTP ${b.throwStatus}`), { status: b.throwStatus }));
        onProgress(body.size);
        puts.push({ url, size: body.size, start: 0, headers });
        resolve({ status: b?.status ?? 200, etag: b && "etag" in b ? (b.etag ?? null) : `"etag-${part}"` });
      }, delay);
    });
  return { put, puts, attempts, get maxInFlight() { return maxInFlight; } };
}

const noBackoff = () => 0;
let passed = 0;
async function test(name: string, fn: () => Promise<void>) {
  try {
    await fn();
    passed++;
    console.log(`  ok   ${name}`);
  } catch (err) {
    console.error(`  FAIL ${name}\n`, err);
    process.exitCode = 1;
  }
}

console.log("multipart.ts");

await test("small file → one presigned PUT with the signed headers", async () => {
  const { api, calls } = fakeServer();
  const t = fakePut();
  const pcts: number[] = [];
  const res = await uploadToStore(fakeFile(2 * MiB, "image/jpeg"), { folder: "thumbnails", api, put: t.put, onProgress: (p) => pcts.push(p) });
  assert.equal(res.publicUrl, "https://cdn/x");
  assert.equal(res.size, 2 * MiB);
  assert.deepEqual(calls.map((c) => c.action), ["put"]);
  assert.equal(t.puts.length, 1);
  assert.equal(t.puts[0].size, 2 * MiB);
  assert.deepEqual(t.puts[0].headers, { "Content-Type": "image/jpeg" });
  assert.equal(pcts.at(-1), 100);
});

await test("40 MiB → multipart, concurrency, part boundaries, sorted complete, monotonic progress", async () => {
  const { api, calls } = fakeServer();
  // Uneven delays so parts finish out of order.
  const t = fakePut(undefined, 0);
  const size = 40 * MiB + 123;
  const sliced: { n: number; size: number }[] = [];
  const put: PutTransport = (url, body, o) => {
    sliced.push({ n: Number(url.split(":")[1]), size: body.size });
    return new Promise((r) => setTimeout(r, 30 - Number(url.split(":")[1]) * 4)).then(() => t.put(url, body, o));
  };
  const pcts: number[] = [];
  const res = await uploadToStore(fakeFile(size), { folder: "videos", api, put, concurrency: 3, onProgress: (p) => pcts.push(p) });
  assert.equal(res.key, "videos/1700000000000-abcdef.mp4");
  assert.equal(res.size, size);
  assert.ok(t.maxInFlight <= 3, `max in flight ${t.maxInFlight}`);
  const expectParts = Math.ceil(size / PART); // 6
  assert.equal(sliced.length, expectParts);
  for (const { n, size: s } of sliced) assert.equal(s, n < expectParts ? PART : size - (expectParts - 1) * PART, `part ${n}`);
  const complete = calls.find((c) => c.action === "multipart-complete");
  assert.ok(complete && complete.action === "multipart-complete");
  assert.deepEqual(complete.parts.map((p) => p.partNumber), [1, 2, 3, 4, 5, 6]);
  assert.deepEqual(complete.parts.map((p) => p.etag), [1, 2, 3, 4, 5, 6].map((n) => `"etag-${n}"`));
  assert.ok(!calls.some((c) => c.action === "multipart-abort"));
  for (let i = 1; i < pcts.length; i++) assert.ok(pcts[i] > pcts[i - 1], `progress not monotonic: ${pcts}`);
  assert.equal(pcts.at(-1), 100);
  assert.ok(pcts.every((p) => Number.isInteger(p) && p >= 0 && p <= 100));
});

await test("more parts than one sign batch → multipart-part batches, deduped", async () => {
  const { api, calls } = fakeServer({ partSize: 5 * MiB });
  const t = fakePut();
  await uploadToStore(fakeFile(100 * MiB), { folder: "videos", api, put: t.put, concurrency: 5 });
  const signs = calls.filter((c) => c.action === "multipart-part");
  // 20 parts: batch 0 came with start; batches 1 (9–16) and 2 (17–20) once each.
  assert.deepEqual(signs.map((c) => (c.action === "multipart-part" ? c.partNumbers : [])), [[9, 10, 11, 12, 13, 14, 15, 16], [17, 18, 19, 20]]);
});

await test("part failing twice (503, network) then succeeding is retried", async () => {
  const { api, calls } = fakeServer();
  const t = fakePut((url, attempt) => (url.startsWith("u:2:") && attempt === 1 ? { throwStatus: 503 } : url.startsWith("u:2:") && attempt === 2 ? { throwStatus: 0 } : undefined));
  await uploadToStore(fakeFile(20 * MiB), { folder: "videos", api, put: t.put, backoffMs: noBackoff });
  assert.equal(t.attempts.get("2"), 3);
  assert.ok(calls.some((c) => c.action === "multipart-complete"));
});

await test("part failing every attempt → error, multipart-abort", async () => {
  const { api, calls } = fakeServer();
  const t = fakePut((url) => (url.startsWith("u:2:") ? { throwStatus: 500 } : undefined));
  await assert.rejects(uploadToStore(fakeFile(20 * MiB), { folder: "videos", api, put: t.put, backoffMs: noBackoff }), /HTTP 500/);
  assert.equal(t.attempts.get("2"), LIMITS.partAttempts);
  assert.ok(calls.some((c) => c.action === "multipart-abort"));
  assert.ok(!calls.some((c) => c.action === "multipart-complete"));
});

await test("403 re-signs that part (new URL) and succeeds", async () => {
  const { api, calls } = fakeServer();
  const urls: string[] = [];
  const t = fakePut((url) => {
    if (url.startsWith("u:3:")) urls.push(url);
    return url === "u:3:1" ? { throwStatus: 403 } : undefined;
  });
  await uploadToStore(fakeFile(30 * MiB), { folder: "videos", api, put: t.put, backoffMs: noBackoff });
  assert.deepEqual(urls, ["u:3:1", "u:3:2"]);
  const signs = calls.filter((c) => c.action === "multipart-part");
  assert.equal(signs.length, 1);
  assert.ok(signs[0].action === "multipart-part" && signs[0].partNumbers.includes(3));
});

await test("missing ETag → clear CORS error, no retries, multipart-abort", async () => {
  const { api, calls } = fakeServer();
  const t = fakePut(() => ({ etag: null }));
  await assert.rejects(uploadToStore(fakeFile(20 * MiB), { folder: "videos", api, put: t.put, backoffMs: noBackoff }), /CORS rules must expose the ETag header/);
  assert.ok([...t.attempts.values()].every((a) => a === 1));
  assert.ok(calls.some((c) => c.action === "multipart-abort"));
});

await test("abort mid-way → in-flight PUTs aborted, multipart-abort, AbortError, no listener leak", async () => {
  const { api, calls } = fakeServer();
  const t = fakePut(undefined, 50);
  const ctrl = new AbortController();
  let added = 0;
  let removed = 0;
  const add = ctrl.signal.addEventListener.bind(ctrl.signal);
  const rem = ctrl.signal.removeEventListener.bind(ctrl.signal);
  ctrl.signal.addEventListener = ((...a: Parameters<typeof add>) => (added++, add(...a))) as typeof add;
  ctrl.signal.removeEventListener = ((...a: Parameters<typeof rem>) => (removed++, rem(...a))) as typeof rem;
  setTimeout(() => ctrl.abort(), 70);
  const err = await uploadToStore(fakeFile(80 * MiB), { folder: "videos", api, put: t.put, signal: ctrl.signal }).then(
    () => null,
    (e: unknown) => e,
  );
  assert.ok(err instanceof DOMException && err.name === "AbortError", `got ${String(err)}`);
  assert.equal((err as DOMException).message, "Upload cancelled");
  assert.ok(calls.some((c) => c.action === "multipart-abort"));
  assert.ok(!calls.some((c) => c.action === "multipart-complete"));
  assert.ok(t.puts.length < 10, `uploaded ${t.puts.length} of 10 parts`);
  assert.equal(added, 1);
  assert.equal(removed, 1);
});

await test("already-aborted signal rejects with AbortError before any API call", async () => {
  const { api, calls } = fakeServer();
  const ctrl = new AbortController();
  ctrl.abort();
  await assert.rejects(uploadToStore(fakeFile(20 * MiB), { folder: "videos", api, put: fakePut().put, signal: ctrl.signal }), { name: "AbortError" });
  assert.equal(calls.length, 0);
});

await test("multipart-start 503 surfaces the error (no PUTs)", async () => {
  const t = fakePut();
  const api: Api = async () => {
    throw Object.assign(new Error("Storage not configured"), { status: 503 });
  };
  await assert.rejects(uploadToStore(fakeFile(20 * MiB), { folder: "videos", api, put: t.put }), /not configured/);
  assert.equal(t.puts.length, 0);
});

console.log(`${passed} passed${process.exitCode ? ", some FAILED" : ""}`);
