import { Resend } from "resend";
import { site } from "@/data/site";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const WINDOW_MS = 60_000;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const LIMITS = { name: 120, email: 200, projectType: 60, message: 5000 } as const;

/**
 * 1 message per IP per minute. In-memory, so per server instance — plenty
 * for a portfolio form (a serverless cold start simply resets it).
 */
const lastSent = new Map<string, number>();

function clientIp(request: Request): string {
  return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || request.headers.get("x-real-ip") || "unknown";
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

function fail(error: string, status: number) {
  return Response.json({ ok: false, error }, { status });
}

/** POST { name, email, message, projectType? } → { ok: true } | { ok: false, error } */
export async function POST(request: Request) {
  let body: Record<string, unknown>;
  try {
    const parsed: unknown = await request.json();
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) throw new Error();
    body = parsed as Record<string, unknown>;
  } catch {
    return fail("Invalid request", 400);
  }

  const field = (k: keyof typeof LIMITS) => (typeof body[k] === "string" ? (body[k] as string).trim() : "");
  const name = field("name");
  const email = field("email");
  const message = field("message");
  const projectType = field("projectType");

  if (!name || !email || !message) return fail("Name, email and message are required", 400);
  if (!EMAIL.test(email)) return fail("That email address doesn't look right", 400);
  for (const k of Object.keys(LIMITS) as (keyof typeof LIMITS)[]) {
    if (field(k).length > LIMITS[k]) return fail(`${k} is too long`, 400);
  }
  // Honeypot: real people never see or fill this field.
  if (typeof body.company === "string" && body.company) return Response.json({ ok: true });

  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey || apiKey.startsWith("re_placeholder")) return fail("Email service not configured", 503);

  const ip = clientIp(request);
  const now = Date.now();
  const last = lastSent.get(ip);
  if (last && now - last < WINDOW_MS) {
    const wait = Math.ceil((WINDOW_MS - (now - last)) / 1000);
    return fail(`Please wait ${wait}s before sending another message`, 429);
  }
  lastSent.set(ip, now);
  // Keep the map from growing without bound.
  if (lastSent.size > 5000) {
    for (const [k, t] of lastSent) if (now - t > WINDOW_MS) lastSent.delete(k);
  }

  try {
    const resend = new Resend(apiKey);
    const { error } = await resend.emails.send({
      from: `${site.name} Portfolio <onboarding@resend.dev>`,
      to: site.email,
      replyTo: email,
      subject: `New enquiry from ${name}${projectType ? ` — ${projectType}` : ""}`,
      text: `Name: ${name}\nEmail: ${email}\nProject type: ${projectType || "—"}\n\n${message}`,
      html: `<div style="font-family:system-ui,sans-serif;line-height:1.5">
<p><strong>Name:</strong> ${esc(name)}<br/><strong>Email:</strong> ${esc(email)}<br/><strong>Project type:</strong> ${esc(projectType || "—")}</p>
<p style="white-space:pre-wrap">${esc(message)}</p></div>`,
    });
    if (error) {
      lastSent.delete(ip); // their message didn't go — let them retry immediately
      return fail("The email service rejected the message — please try again or email directly", 502);
    }
    return Response.json({ ok: true });
  } catch {
    lastSent.delete(ip);
    return fail("Couldn't send right now — please try again in a moment", 502);
  }
}
