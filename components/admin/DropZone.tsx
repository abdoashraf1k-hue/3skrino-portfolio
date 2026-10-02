"use client";

import { useRef, useState, type DragEvent, type ReactNode } from "react";
import { assertUploadable } from "@/lib/admin/video-upload";

type Props = {
  onFile: (file: File) => void;
  onError: (message: string) => void;
  label?: ReactNode;
  className?: string;
};

/** True only for OS file drags — internal thumbnail drags (reorder) are ignored. */
export function isFileDrag(e: DragEvent): boolean {
  return Array.from(e.dataTransfer.types).includes("Files");
}

/**
 * Dashed target for a single video file. Desktop: drag & drop. Touch (or any
 * click): falls back to the native file picker.
 */
export default function DropZone({ onFile, onError, label = "Drop video here →", className = "" }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);

  const accept = (file: File | undefined) => {
    if (!file) return;
    try {
      assertUploadable(file);
      onFile(file);
    } catch (err) {
      onError(err instanceof Error ? err.message : "That file can't be uploaded");
    }
  };

  return (
    <button
      type="button"
      onClick={() => inputRef.current?.click()}
      onDragEnter={(e) => {
        if (isFileDrag(e)) setOver(true);
      }}
      onDragOver={(e) => {
        if (!isFileDrag(e)) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = "copy";
      }}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setOver(false);
      }}
      onDrop={(e) => {
        if (!isFileDrag(e)) return;
        // preventDefault marks it handled; a parent drop target (the category
        // card) sees defaultPrevented and only clears its highlight.
        e.preventDefault();
        setOver(false);
        accept(e.dataTransfer.files[0]);
      }}
      className={`flex w-full items-center justify-center rounded-sm border border-dashed px-4 py-4 font-mono text-[11px] uppercase tracking-widest transition-colors ${
        over ? "border-[#e7fe55] bg-[#e7fe55]/5 text-[#e7fe55]" : "border-white/15 text-white/40 hover:border-white/30 hover:text-white/70"
      } ${className}`}
    >
      <span className="pointer-events-none">{over ? "Release to upload" : label}</span>
      <input
        ref={inputRef}
        type="file"
        accept="video/*"
        hidden
        onChange={(e) => {
          accept(e.target.files?.[0]);
          e.target.value = ""; // allow picking the same file again
        }}
      />
    </button>
  );
}
