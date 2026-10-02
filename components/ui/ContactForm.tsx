"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useState, type FormEvent } from "react";
import { site } from "@/data/site";
import { trackCTA } from "@/lib/analytics";
import { cn, EASE_OUT } from "@/lib/utils";

const PROJECT_TYPES = ["Brand film", "Commercial", "Social / Reels", "Tours / Travel", "AI video", "Other"];

type FormState = {
  name: string;
  email: string;
  projectType: string;
  message: string;
};

type Toast = { kind: "success" | "error"; text: string };

const EMPTY: FormState = { name: "", email: "", projectType: PROJECT_TYPES[0], message: "" };

const fieldClass =
  "w-full border-b border-line bg-transparent py-4 text-lg outline-none transition-colors duration-300 placeholder:text-muted/60 focus:border-accent";
const labelClass = "font-mono text-[10px] uppercase tracking-widest text-muted";

export default function ContactForm() {
  const [form, setForm] = useState<FormState>(EMPTY);
  const [sending, setSending] = useState(false);
  const [toast, setToast] = useState<Toast | null>(null);
  const [honeypot, setHoneypot] = useState("");

  const update = <K extends keyof FormState>(key: K, value: FormState[K]) => setForm((f) => ({ ...f, [key]: value }));

  // Success fades on its own; errors stay until dismissed or the next attempt.
  useEffect(() => {
    if (toast?.kind !== "success") return;
    const id = window.setTimeout(() => setToast(null), 6000);
    return () => window.clearTimeout(id);
  }, [toast]);

  const onSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (sending) return;
    setSending(true);
    setToast(null);
    try {
      const res = await fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, company: honeypot }),
      });
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) throw new Error(data.error || `Something went wrong (${res.status})`);
      trackCTA("contact_submit");
      setForm(EMPTY);
      setToast({ kind: "success", text: "Message sent — I'll be in touch within 24 hours." });
    } catch (err) {
      const reason = err instanceof Error ? err.message : "Something went wrong";
      setToast({ kind: "error", text: `${reason}. You can also email ${site.email}.` });
    } finally {
      setSending(false);
    }
  };

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-10" aria-busy={sending}>
      {/* Honeypot — hidden from people and assistive tech, catnip for bots. */}
      <input
        type="text"
        name="company"
        tabIndex={-1}
        autoComplete="off"
        aria-hidden
        value={honeypot}
        onChange={(e) => setHoneypot(e.target.value)}
        className="absolute -left-[9999px] size-px opacity-0"
      />
      <div className="grid grid-cols-1 gap-10 md:grid-cols-2">
        <label className="flex flex-col gap-2">
          <span className={labelClass}>(01) Name</span>
          <input
            required
            name="name"
            autoComplete="name"
            maxLength={120}
            value={form.name}
            onChange={(e) => update("name", e.target.value)}
            placeholder="Your name"
            className={fieldClass}
          />
        </label>
        <label className="flex flex-col gap-2">
          <span className={labelClass}>(02) Email</span>
          <input
            required
            type="email"
            name="email"
            autoComplete="email"
            maxLength={200}
            value={form.email}
            onChange={(e) => update("email", e.target.value)}
            placeholder="you@brand.com"
            className={fieldClass}
          />
        </label>
      </div>

      <fieldset className="flex flex-col gap-4">
        <legend className={cn(labelClass, "mb-4")}>(03) Project type</legend>
        <div className="flex flex-wrap gap-2">
          {PROJECT_TYPES.map((type) => (
            <button
              key={type}
              type="button"
              aria-pressed={form.projectType === type}
              onClick={() => update("projectType", type)}
              className={cn(
                "border px-4 py-2 font-mono text-[10px] uppercase tracking-widest transition-colors duration-300",
                form.projectType === type ? "border-accent bg-accent text-bg" : "border-line text-muted hover:border-fg hover:text-fg",
              )}
            >
              {type}
            </button>
          ))}
        </div>
      </fieldset>

      <label className="flex flex-col gap-2">
        <span className={labelClass}>(04) Message</span>
        <textarea
          required
          name="message"
          rows={5}
          maxLength={5000}
          value={form.message}
          onChange={(e) => update("message", e.target.value)}
          placeholder="Tell me about the project, timeline and budget."
          className={cn(fieldClass, "resize-none")}
        />
      </label>

      <div className="flex flex-wrap items-center gap-6">
        <button
          type="submit"
          disabled={sending}
          className="flex items-center gap-3 border border-fg px-8 py-4 font-mono text-[11px] uppercase tracking-widest transition-colors duration-300 hover:bg-fg hover:text-bg disabled:cursor-wait disabled:opacity-60 disabled:hover:bg-transparent disabled:hover:text-fg"
        >
          {sending && <span aria-hidden className="size-3 animate-spin rounded-full border border-current border-t-transparent" />}
          {sending ? "Sending…" : "Send message →"}
        </button>
      </div>

      {/* Toast */}
      <div aria-live="polite" className="pointer-events-none fixed bottom-6 right-6 z-[70] w-[min(380px,calc(100vw-3rem))]">
        <AnimatePresence>
          {toast && (
            <motion.div
              key={toast.text}
              role={toast.kind === "error" ? "alert" : "status"}
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 8 }}
              transition={{ duration: 0.4, ease: EASE_OUT }}
              className={cn(
                "pointer-events-auto flex items-start gap-3 border border-l-2 bg-bg-soft px-4 py-3 text-sm shadow-2xl",
                toast.kind === "success" ? "border-line border-l-[#3ddc84]" : "border-line border-l-[#ff2d2d]",
              )}
            >
              <span className={cn("mt-1.5 size-1.5 shrink-0 rounded-full", toast.kind === "success" ? "bg-[#3ddc84]" : "bg-[#ff2d2d]")} />
              <p className="flex-1 text-fg/90">{toast.text}</p>
              <button type="button" onClick={() => setToast(null)} aria-label="Dismiss" className="-mr-1 px-1 text-muted hover:text-fg">
                ×
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </form>
  );
}
