"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useState, type FormEvent } from "react";
import { cn, EASE_OUT } from "@/lib/utils";

const PROJECT_TYPES = ["Brand film", "Commercial", "Social / Reels", "AI video", "Other"];

type FormState = {
  name: string;
  email: string;
  projectType: string;
  message: string;
};

const EMPTY: FormState = { name: "", email: "", projectType: PROJECT_TYPES[0], message: "" };

const fieldClass =
  "w-full border-b border-line bg-transparent py-4 text-lg outline-none transition-colors duration-300 placeholder:text-muted/60 focus:border-accent";
const labelClass = "font-mono text-[10px] uppercase tracking-widest text-muted";

export default function ContactForm() {
  const [form, setForm] = useState<FormState>(EMPTY);
  const [sent, setSent] = useState(false);

  const update = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  const onSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    // Not wired to a backend yet.
    console.log("Contact form submission", form);
    setSent(true);
    setForm(EMPTY);
  };

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-10">
      <div className="grid grid-cols-1 gap-10 md:grid-cols-2">
        <label className="flex flex-col gap-2">
          <span className={labelClass}>(01) Name</span>
          <input
            required
            name="name"
            autoComplete="name"
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
                form.projectType === type
                  ? "border-accent bg-accent text-bg"
                  : "border-line text-muted hover:border-fg hover:text-fg",
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
          value={form.message}
          onChange={(e) => update("message", e.target.value)}
          placeholder="Tell me about the project, timeline and budget."
          className={cn(fieldClass, "resize-none")}
        />
      </label>

      <div className="flex flex-wrap items-center gap-6">
        <button
          type="submit"
          className="border border-fg px-8 py-4 font-mono text-[11px] uppercase tracking-widest transition-colors duration-300 hover:bg-fg hover:text-bg"
        >
          Send message →
        </button>
        <AnimatePresence>
          {sent && (
            <motion.p
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.5, ease: EASE_OUT }}
              className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-widest text-accent"
            >
              ● Thanks — I&apos;ll be in touch soon.
            </motion.p>
          )}
        </AnimatePresence>
      </div>
    </form>
  );
}
