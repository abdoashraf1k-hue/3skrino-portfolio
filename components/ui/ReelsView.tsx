"use client";

import { AnimatePresence } from "framer-motion";
import { useSearchParams } from "next/navigation";
import { Suspense, useCallback, useState } from "react";
import BentoReels from "@/components/ui/BentoReels";
import ReelsPlayer from "@/components/ui/ReelsPlayer";
import type { Reel } from "@/data/projects";
import { cn } from "@/lib/utils";

type Props = { reels: Reel[] };

function setParams(entries: Record<string, string | null>) {
  const url = new URL(window.location.href);
  for (const [k, v] of Object.entries(entries)) {
    if (v) url.searchParams.set(k, v);
    else url.searchParams.delete(k);
  }
  window.history.replaceState(window.history.state, "", url);
}

function View({ reels, initialPlayer, initialIndex }: Props & { initialPlayer: boolean; initialIndex: number }) {
  const [player, setPlayer] = useState<number | null>(initialPlayer ? initialIndex : null);

  const open = (i: number) => {
    setPlayer(i);
    setParams({ view: "player", reel: reels[i]?.id ?? null });
  };
  const close = useCallback(() => {
    setPlayer(null);
    setParams({ view: null, reel: null });
  }, []);
  const onIndex = useCallback((i: number) => setParams({ reel: reels[i]?.id ?? null }), [reels]);

  const tab = (on: boolean) =>
    cn(
      "px-4 py-2 font-mono text-[10px] uppercase tracking-widest transition-colors",
      on ? "bg-fg text-bg" : "text-muted hover:text-fg",
    );

  return (
    <>
      <div className="mb-8 flex items-center justify-between gap-4">
        <div role="tablist" aria-label="View" className="flex border border-line">
          <button type="button" role="tab" aria-selected={player === null} onClick={close} className={tab(player === null)}>
            ▦ Grid
          </button>
          <button type="button" role="tab" aria-selected={player !== null} onClick={() => open(player ?? 0)} className={tab(player !== null)}>
            ▶ Player
          </button>
        </div>
        <p className="hidden font-mono text-[10px] uppercase tracking-widest text-muted md:block">Tap any reel to play full-screen</p>
      </div>

      <BentoReels reels={reels} onOpen={open} />

      <AnimatePresence>
        {player !== null && <ReelsPlayer key="player" reels={reels} start={player} onIndex={onIndex} onClose={close} />}
      </AnimatePresence>
    </>
  );
}

function WithParams({ reels }: Props) {
  const params = useSearchParams();
  const index = Math.max(0, reels.findIndex((r) => r.id === params.get("reel")));
  return <View reels={reels} initialPlayer={params.get("view") === "player"} initialIndex={index} />;
}

/** /reels: bento grid ⇄ full-screen vertical player (?view=player&reel=id is shareable). */
export default function ReelsView({ reels }: Props) {
  return (
    <Suspense fallback={<View reels={reels} initialPlayer={false} initialIndex={0} />}>
      <WithParams reels={reels} />
    </Suspense>
  );
}
