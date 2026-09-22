"use client";

import { useSyncExternalStore } from "react";
import { formatCairoTime } from "@/lib/utils";

function subscribe(onChange: () => void) {
  const id = window.setInterval(onChange, 1000);
  return () => window.clearInterval(id);
}

const getSnapshot = () => formatCairoTime(new Date());
const getServerSnapshot = () => "--:--:--";

/** Live HH:MM:SS in Cairo time. Renders a placeholder on the server. */
export default function Clock({ className }: { className?: string }) {
  const time = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  return (
    <span className={className} suppressHydrationWarning>
      {time}
    </span>
  );
}
