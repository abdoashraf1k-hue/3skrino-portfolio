"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";

type Kind = "success" | "error" | "info";
type ToastItem = { id: number; kind: Kind; message: string };
type ToastApi = { success: (m: string) => void; error: (m: string) => void; info: (m: string) => void };

const ToastContext = createContext<ToastApi | null>(null);

export function useToast(): ToastApi {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used inside <ToastProvider>");
  return ctx;
}

const AUTO_DISMISS_MS = 4000;

const STYLES: Record<Kind, { border: string; dot: string; label: string }> = {
  success: { border: "border-l-[#e7fe55]", dot: "bg-[#e7fe55]", label: "OK" },
  error: { border: "border-l-[#ff2d2d]", dot: "bg-[#ff2d2d]", label: "ERR" },
  info: { border: "border-l-white/40", dot: "bg-white/60", label: "INFO" },
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const nextId = useRef(0);

  const dismiss = useCallback((id: number) => setItems((all) => all.filter((t) => t.id !== id)), []);
  const push = useCallback((kind: Kind, message: string) => {
    const id = ++nextId.current;
    setItems((all) => [...all.slice(-4), { id, kind, message }]);
  }, []);

  const api = useMemo<ToastApi>(
    () => ({
      success: (m) => push("success", m),
      error: (m) => push("error", m),
      info: (m) => push("info", m),
    }),
    [push],
  );

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div
        aria-live="polite"
        className="pointer-events-none fixed right-4 top-4 z-[200] flex w-[min(360px,calc(100vw-2rem))] flex-col gap-2"
      >
        {items.map((t) => (
          <Toast key={t.id} item={t} onDismiss={dismiss} />
        ))}
      </div>
    </ToastContext.Provider>
  );
}

function Toast({ item, onDismiss }: { item: ToastItem; onDismiss: (id: number) => void }) {
  const style = STYLES[item.kind];

  // Errors stay until dismissed; success/info leave on their own.
  useEffect(() => {
    if (item.kind === "error") return;
    const id = window.setTimeout(() => onDismiss(item.id), AUTO_DISMISS_MS);
    return () => window.clearTimeout(id);
  }, [item, onDismiss]);

  return (
    // Clip reveal from the right edge — the toast unveils toward the content.
    <div
      role={item.kind === "error" ? "alert" : "status"}
      className={`admin-clip-reveal-left pointer-events-auto flex items-start gap-3 border border-l-2 border-white/10 bg-[#141414] px-4 py-3 text-sm shadow-2xl ${style.border}`}
    >
      <span className={`mt-1.5 size-1.5 shrink-0 rounded-full ${style.dot}`} />
      <div className="min-w-0 flex-1">
        <p className="font-mono text-[10px] uppercase tracking-widest text-white/40">{style.label}</p>
        <p className="mt-0.5 break-words text-white/90">{item.message}</p>
      </div>
      <button
        type="button"
        onClick={() => onDismiss(item.id)}
        aria-label="Dismiss"
        className="-mr-1 shrink-0 px-1 text-white/40 hover:text-white"
      >
        ×
      </button>
    </div>
  );
}
