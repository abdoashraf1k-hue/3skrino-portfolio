"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { brandConfig as bundledBrand, type BrandConfig } from "@/data/brand";
import type { HeroConfig } from "@/data/hero-config";
import type { SiteConfig } from "@/data/site-config";
import { AuthError, adminFetch } from "@/lib/admin/client-api";

/**
 * Admin-wide drafts of the three config files (hero, site, brand). Every tab
 * edits these drafts; the floating live preview renders them; the save bar
 * commits whichever file changed (one commit per file, each with its own
 * backup) with a message naming the sections that changed.
 */

type Res<T> = { config: T; sha: string };
export type ConfigStatus = { kind: "loading" } | { kind: "ready" } | { kind: "error"; message: string };

const HERO_SECTIONS: Record<keyof HeroConfig, string> = {
  poses: "poses",
  expressions: "expressions",
  logos: "brands",
  features: "hero effects",
  ambientSrc: "ambient sound",
  roles: "roles",
  confrontation: "confrontation",
  interview: "interview",
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
const BRAND_SECTIONS: Record<keyof BrandConfig, string> = {
  identity: "identity",
  voice: "voice",
  scale: "scale",
  motion: "motion tokens",
  states: "interaction states",
  palettes: "palettes",
  principles: "principles",
  signature: "signature moments",
  categories: "categories",
  text: "text",
  numbers: "numbers",
  icons: "icons",
};

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

function changed<T extends object>(saved: T, draft: T, names: Record<keyof T, string>): string[] {
  return (Object.keys(names) as (keyof T)[]).filter((k) => !same(saved[k], draft[k])).map((k) => names[k]);
}

type Store = {
  status: ConfigStatus;
  hero: HeroConfig | null;
  site: SiteConfig | null;
  brand: BrandConfig | null;
  savedHero: HeroConfig | null;
  savedSite: SiteConfig | null;
  savedBrand: BrandConfig | null;
  /** True when data/brand.ts couldn't be read from GitHub and the bundled copy is shown. */
  brandFallback: boolean;
  /** Section names with unsaved edits, e.g. ["theme", "roles"]. */
  dirty: { hero: string[]; site: string[]; brand: string[] };
  saving: boolean;
  setHero: (fn: (c: HeroConfig) => HeroConfig) => void;
  setSite: (fn: (c: SiteConfig) => SiteConfig) => void;
  setBrand: (fn: (c: BrandConfig) => BrandConfig) => void;
  /** Commits every dirty file. Resolves true when everything saved. */
  saveAll: () => Promise<boolean>;
  discard: () => void;
  /** Re-reads every file from GitHub (after a restore / revert / reset). Drafts are replaced. */
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
  const [savedBrand, setSavedBrand] = useState<BrandConfig | null>(null);
  const [hero, setHeroDraft] = useState<HeroConfig | null>(null);
  const [site, setSiteDraft] = useState<SiteConfig | null>(null);
  const [brand, setBrandDraft] = useState<BrandConfig | null>(null);
  const [brandFallback, setBrandFallback] = useState(false);
  const [saving, setSaving] = useState(false);
  const keyRef = useRef(adminKey);

  const fetchAll = useCallback(
    () =>
      Promise.all([
        adminFetch<Res<HeroConfig>>(keyRef.current, "hero", "GET"),
        adminFetch<Res<SiteConfig>>(keyRef.current, "site", "GET"),
        // data/brand.ts is new in Sprint 11: until it's pushed, edit the bundled copy (saving explains why it can't).
        adminFetch<Res<BrandConfig>>(keyRef.current, "brand", "GET").then(
          (r) => ({ config: r.config, fallback: false }),
          (err: unknown) => {
            if (err instanceof AuthError) throw err;
            return { config: bundledBrand, fallback: true };
          },
        ),
      ]).then(
        ([h, s, b]) => {
          setSavedHero(h.config);
          setHeroDraft(h.config);
          setSavedSite(s.config);
          setSiteDraft(s.config);
          setSavedBrand(b.config);
          setBrandDraft(b.config);
          setBrandFallback(b.fallback);
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
    void fetchAll();
  }, [fetchAll]);

  const dirty = useMemo(
    () => ({
      hero: hero && savedHero ? changed(savedHero, hero, HERO_SECTIONS) : [],
      site:
        site && savedSite
          ? changed(savedSite, site, SITE_SECTIONS).flatMap((name) =>
              name === "cinematic" ? changed(savedSite.cinematic, site.cinematic, CINEMATIC_PARTS) : [name],
            )
          : [],
      brand: brand && savedBrand ? changed(savedBrand, brand, BRAND_SECTIONS) : [],
    }),
    [hero, savedHero, site, savedSite, brand, savedBrand],
  );

  // Leaving with unsaved edits asks first.
  const anyDirty = dirty.hero.length + dirty.site.length + dirty.brand.length > 0;
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
      if (brand && dirty.brand.length) {
        if (brandFallback) throw new Error("data/brand.ts isn't on GitHub yet — push the Sprint 11 code first, then brand edits can be saved");
        const res = await adminFetch<Res<BrandConfig>>(keyRef.current, "brand", "PUT", {
          config: brand,
          message: `admin: update ${dirty.brand.join(", ")}`,
        });
        setSavedBrand(res.config);
        setBrandDraft(res.config);
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
  }, [brand, brandFallback, dirty, hero, onAuthError, onError, onSuccess, saving, site]);

  const store: Store = {
    status,
    hero,
    site,
    brand,
    savedHero,
    savedSite,
    savedBrand,
    brandFallback,
    dirty,
    saving,
    setHero: useCallback((fn) => setHeroDraft((c) => (c ? fn(c) : c)), []),
    setSite: useCallback((fn) => setSiteDraft((c) => (c ? fn(c) : c)), []),
    setBrand: useCallback((fn) => setBrandDraft((c) => (c ? fn(c) : c)), []),
    saveAll,
    discard: useCallback(() => {
      setHeroDraft(savedHero);
      setSiteDraft(savedSite);
      setBrandDraft(savedBrand);
    }, [savedHero, savedSite, savedBrand]),
    reload: useCallback(() => {
      setStatus({ kind: "loading" });
      return fetchAll();
    }, [fetchAll]),
    adoptHero: useCallback((c: HeroConfig) => {
      setSavedHero(c);
      setHeroDraft(c);
    }, []),
  };

  return <Ctx.Provider value={store}>{children}</Ctx.Provider>;
}
