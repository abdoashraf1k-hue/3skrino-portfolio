"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { HeroConfig } from "@/data/hero-config";
import type { SiteConfig } from "@/data/site-config";
import { AuthError, adminFetch } from "@/lib/admin/client-api";

/**
 * Admin-wide drafts of the two config files. Every tab edits these drafts;
 * the floating live preview renders them; the save bar commits whichever
 * file changed (one commit per file, each with its own backup) with a
 * message naming the sections that changed.
 */

type Res<T> = { config: T; sha: string };
export type ConfigStatus = { kind: "loading" } | { kind: "ready" } | { kind: "error"; message: string };

const HERO_SECTIONS: Record<keyof HeroConfig, string> = {
  poses: "poses",
  logos: "brands",
  features: "hero effects",
  ambientSrc: "ambient sound",
  roles: "roles",
};
const SITE_SECTIONS: Record<keyof SiteConfig, string> = {
  theme: "theme",
  layout: "layout",
  content: "content",
  seo: "SEO",
  backups: "backup schedule",
  heroVariant: "hero variant",
  cinematic: "cinematic",
};
/** "cinematic" is big — name the part that changed instead. */
const CINEMATIC_PARTS: Record<keyof SiteConfig["cinematic"], string> = {
  effects: "effects",
  scopes: "effect scopes",
  lutProjects: "project grades",
  sections: "section fx",
  cursor: "cursor",
  sound: "sound",
  motion: "motion",
  experiments: "experiments",
  heroOptions: "hero options",
};

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

function changed<T extends object>(saved: T, draft: T, names: Record<keyof T, string>): string[] {
  return (Object.keys(names) as (keyof T)[]).filter((k) => !same(saved[k], draft[k])).map((k) => names[k]);
}

type Store = {
  status: ConfigStatus;
  hero: HeroConfig | null;
  site: SiteConfig | null;
  savedHero: HeroConfig | null;
  savedSite: SiteConfig | null;
  /** Section names with unsaved edits, e.g. ["theme", "roles"]. */
  dirty: { hero: string[]; site: string[] };
  saving: boolean;
  setHero: (fn: (c: HeroConfig) => HeroConfig) => void;
  setSite: (fn: (c: SiteConfig) => SiteConfig) => void;
  /** Commits every dirty file. Resolves true when everything saved. */
  saveAll: () => Promise<boolean>;
  discard: () => void;
  /** Re-reads both files from GitHub (after a restore / revert / reset). Drafts are replaced. */
  reload: () => Promise<void>;
  /** Adopt a server response (e.g. "reset hero") as both saved + draft. */
  adoptHero: (c: HeroConfig) => void;
};

const Ctx = createContext<Store | null>(null);

export function useConfigStore(): Store {
  const s = useContext(Ctx);
  if (!s) throw new Error("useConfigStore outside ConfigProvider");
  return s;
}

export function ConfigProvider({
  adminKey,
  onAuthError,
  onError,
  onSuccess,
  children,
}: {
  adminKey: string;
  onAuthError: () => void;
  onError: (msg: string) => void;
  onSuccess: (msg: string) => void;
  children: ReactNode;
}) {
  const [status, setStatus] = useState<ConfigStatus>({ kind: "loading" });
  const [savedHero, setSavedHero] = useState<HeroConfig | null>(null);
  const [savedSite, setSavedSite] = useState<SiteConfig | null>(null);
  const [hero, setHeroDraft] = useState<HeroConfig | null>(null);
  const [site, setSiteDraft] = useState<SiteConfig | null>(null);
  const [saving, setSaving] = useState(false);
  const keyRef = useRef(adminKey);

  const fetchBoth = useCallback(
    () =>
      Promise.all([
        adminFetch<Res<HeroConfig>>(keyRef.current, "hero", "GET"),
        adminFetch<Res<SiteConfig>>(keyRef.current, "site", "GET"),
      ]).then(
        ([h, s]) => {
          setSavedHero(h.config);
          setHeroDraft(h.config);
          setSavedSite(s.config);
          setSiteDraft(s.config);
          setStatus({ kind: "ready" });
        },
        (err: unknown) => {
          if (err instanceof AuthError) return onAuthError();
          setStatus({ kind: "error", message: err instanceof Error ? err.message : "Couldn't load settings" });
        },
      ),
    [onAuthError],
  );

  useEffect(() => {
    void fetchBoth();
  }, [fetchBoth]);

  const dirty = useMemo(
    () => ({
      hero: hero && savedHero ? changed(savedHero, hero, HERO_SECTIONS) : [],
      site:
        site && savedSite
          ? changed(savedSite, site, SITE_SECTIONS).flatMap((name) =>
              name === "cinematic" ? changed(savedSite.cinematic, site.cinematic, CINEMATIC_PARTS) : [name],
            )
          : [],
    }),
    [hero, savedHero, site, savedSite],
  );

  // Leaving with unsaved edits asks first.
  const anyDirty = dirty.hero.length + dirty.site.length > 0;
  useEffect(() => {
    if (!anyDirty) return;
    const guard = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", guard);
    return () => window.removeEventListener("beforeunload", guard);
  }, [anyDirty]);

  const saveAll = useCallback(async () => {
    if (saving) return false;
    setSaving(true);
    let ok = true;
    try {
      if (hero && dirty.hero.length) {
        const res = await adminFetch<Res<HeroConfig>>(keyRef.current, "hero", "PUT", {
          config: hero,
          message: `admin: update ${dirty.hero.join(", ")}`,
        });
        setSavedHero(res.config);
        setHeroDraft(res.config);
      }
      if (site && dirty.site.length) {
        const res = await adminFetch<Res<SiteConfig>>(keyRef.current, "site", "PUT", {
          config: site,
          message: `admin: update ${dirty.site.join(", ")}`,
        });
        setSavedSite(res.config);
        setSiteDraft(res.config);
      }
      onSuccess("Saved — deploying…");
    } catch (err) {
      ok = false;
      if (err instanceof AuthError) onAuthError();
      else onError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
    return ok;
  }, [dirty, hero, onAuthError, onError, onSuccess, saving, site]);

  const store: Store = {
    status,
    hero,
    site,
    savedHero,
    savedSite,
    dirty,
    saving,
    setHero: useCallback((fn) => setHeroDraft((c) => (c ? fn(c) : c)), []),
    setSite: useCallback((fn) => setSiteDraft((c) => (c ? fn(c) : c)), []),
    saveAll,
    discard: useCallback(() => {
      setHeroDraft(savedHero);
      setSiteDraft(savedSite);
    }, [savedHero, savedSite]),
    reload: useCallback(() => {
      setStatus({ kind: "loading" });
      return fetchBoth();
    }, [fetchBoth]),
    adoptHero: useCallback((c: HeroConfig) => {
      setSavedHero(c);
      setHeroDraft(c);
    }, []),
  };

  return <Ctx.Provider value={store}>{children}</Ctx.Provider>;
}
