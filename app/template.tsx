"use client";

import { motion } from "framer-motion";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { usePageTransition } from "@/components/ui/PageTransition";

/**
 * Remounts per navigation. The iris (PageTransition) covers the swap; this
 * holds the new page back 200ms and fades it in. First load renders as-is.
 */
export default function Template({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { hasNavigated } = usePageTransition();

  return (
    <motion.div
      key={pathname}
      initial={hasNavigated ? { opacity: 0 } : false}
      animate={{ opacity: 1, transition: { delay: 0.2, duration: 0.4 } }}
    >
      {children}
    </motion.div>
  );
}
