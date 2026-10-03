"use client";

import { motion } from "framer-motion";
import type { ReactNode } from "react";
import { cn, CONTAINER, EASE_OUT } from "@/lib/utils";

type PageHeaderProps = {
  label: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  meta?: ReactNode;
  children?: ReactNode;
};

const item = {
  hidden: { opacity: 0, y: 60 },
  show: { opacity: 1, y: 0, transition: { duration: 1, ease: EASE_OUT } },
};

/** Top-of-page header for inner routes — reveals on load. */
export default function PageHeader({ label, title, description, meta, children }: PageHeaderProps) {
  return (
    <motion.header
      initial="hidden"
      animate="show"
      transition={{ staggerChildren: 0.08, delayChildren: 0.2 }}
      className={cn(CONTAINER, "pb-16 pt-40 md:pb-24 md:pt-48")}
    >
      <motion.p
        variants={item}
        className="mb-6 font-mono text-[11px] uppercase tracking-widest text-muted"
      >
        {label}
      </motion.p>
      <motion.h1
        variants={item}
        className="type-display text-[clamp(4rem,14vw,14rem)] leading-[0.86]"
      >
        {title}
      </motion.h1>
      {(description || meta) && (
        <motion.div
          variants={item}
          className="mt-10 grid grid-cols-12 gap-6 border-t border-line pt-8"
        >
          {description && (
            <p className="col-span-12 max-w-2xl text-lg leading-relaxed text-muted md:col-span-8 md:text-xl">
              {description}
            </p>
          )}
          {meta && (
            <div className="col-span-12 font-mono text-[11px] uppercase tracking-widest text-muted md:col-span-4 md:text-right">
              {meta}
            </div>
          )}
        </motion.div>
      )}
      {children && <motion.div variants={item}>{children}</motion.div>}
    </motion.header>
  );
}
