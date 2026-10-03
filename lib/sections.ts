"use client";

import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

/**
 * Page sections that opt in with `data-section="Label"` — read by the
 * progress rail and the scroll-to-top button. Re-scanned on navigation and
 * whenever the DOM under <main> changes (e.g. the admin preview reorders
 * the home sections).
 */
export type SectionMark = { id: string; label: string; el: HTMLElement };

export type SectionProgress = {
  sections: SectionMark[];
  /** Index of the section under the reading line, -1 above the first. */
  active: number;
  /** 0..1 through the active section. */
  within: number;
  /** 0..1 through the whole page. */
  page: number;
};

const EMPTY: SectionProgress = { sections: [], active: -1, within: 0, page: 0 };

function scan(): SectionMark[] {
  return [...document.querySelectorAll<HTMLElement>("main [data-section]")].map((el, i) => ({
    id: el.id || `section-${i}`,
    label: el.dataset.section || el.id,
    el,
  }));
}

export function useSectionProgress(): SectionProgress {
  const pathname = usePathname();
  const [state, setState] = useState<SectionProgress>(EMPTY);

  useEffect(() => {
    let sections = scan();
    let frame = 0;

    const measure = () => {
      frame = 0;
      const line = window.innerHeight * 0.4;
      let active = -1;
      let within = 0;
      sections.forEach((s, i) => {
        const r = s.el.getBoundingClientRect();
        if (r.top <= line) {
          active = i;
          within = Math.min(1, Math.max(0, (line - r.top) / Math.max(1, r.height)));
        }
      });
      const max = document.documentElement.scrollHeight - window.innerHeight;
      const page = max > 0 ? Math.min(1, window.scrollY / max) : 0;
      setState((prev) =>
        prev.sections === sections && prev.active === active && Math.abs(prev.within - within) < 0.01 && Math.abs(prev.page - page) < 0.005
          ? prev
          : { sections, active, within, page },
      );
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(measure);
    };

    const main = document.querySelector("main");
    const mo = new MutationObserver(() => {
      const next = scan();
      if (next.length !== sections.length || next.some((s, i) => s.el !== sections[i]?.el)) sections = next;
      schedule();
    });
    if (main) mo.observe(main, { childList: true, subtree: true });

    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    schedule();
    return () => {
      mo.disconnect();
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
      cancelAnimationFrame(frame);
    };
  }, [pathname]);

  return state;
}
