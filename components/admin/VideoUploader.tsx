"use client";

import { useRef } from "react";
import { assertUploadable, playerUrl } from "@/lib/admin/cloudinary";

type Props = {
  /** Saved Cloudinary URL ("" when none). */
  videoUrl: string;
  /** Object URL of a picked-but-not-yet-uploaded file. */
  pendingPreview: string | null;
  pendingName: string | null;
  orientation: "vertical" | "horizontal";
  /** 0–100 while uploading, null otherwise. */
  progress: number | null;
  disabled?: boolean;
  onSelect: (file: File) => void;
  /** Reports a picked file's length (seconds) from its metadata, before upload. */
  onDuration?: (seconds: number) => void;
  onError: (message: string) => void;
};

/** Preview + "Replace video" + upload progress bar for the editor. */
export default function VideoUploader({
  videoUrl,
  pendingPreview,
  pendingName,
  orientation,
  progress,
  disabled,
  onSelect,
  onDuration,
  onError,
}: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const src = pendingPreview ?? (videoUrl ? playerUrl(videoUrl) : "");
  const hasVideo = Boolean(src);

  return (
    <div className="flex flex-col gap-3">
      <div
        className={`relative mx-auto w-full overflow-hidden rounded-sm border border-white/10 bg-black ${
          orientation === "vertical" ? "aspect-[9/16] max-h-[46vh] max-w-[26vh]" : "aspect-video"
        }`}
      >
        {hasVideo ? (
          <video
            key={src}
            src={src}
            controls
            muted
            playsInline
            preload="metadata"
            onLoadedMetadata={(e) => {
              if (pendingPreview && Number.isFinite(e.currentTarget.duration)) onDuration?.(e.currentTarget.duration);
            }}
            className="absolute inset-0 size-full object-contain"
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center font-mono text-[10px] uppercase tracking-widest text-white/30">
            No video yet
          </div>
        )}

        {progress !== null && (
          <div className="absolute inset-x-0 bottom-0 bg-black/70 px-3 py-2">
            <div className="mb-1 flex justify-between font-mono text-[10px] uppercase tracking-widest text-white/70">
              <span>Uploading</span>
              <span className="tabular-nums">{progress}%</span>
            </div>
            <div className="h-1 w-full bg-white/10">
              {/* Scrub-style fill: width is driven directly by upload progress. */}
              <div className="h-full bg-[#e7fe55] transition-[width] duration-200" style={{ width: `${progress}%` }} />
            </div>
          </div>
        )}
      </div>

      <div className="flex items-center justify-between gap-3">
        <p className="min-w-0 truncate font-mono text-[10px] uppercase tracking-widest text-white/40">
          {pendingName ? `New: ${pendingName} (uploads on save)` : videoUrl ? "Cloudinary · q_auto, f_auto" : "Optional"}
        </p>
        <button
          type="button"
          disabled={disabled}
          onClick={() => inputRef.current?.click()}
          className="shrink-0 border border-white/15 px-3 py-1.5 font-mono text-[10px] uppercase tracking-widest text-white/80 hover:border-white/40 disabled:opacity-40"
        >
          {hasVideo ? "Replace video" : "Choose video"}
        </button>
        <input
          ref={inputRef}
          type="file"
          accept="video/*"
          hidden
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = "";
            if (!file) return;
            try {
              assertUploadable(file);
              onSelect(file);
            } catch (err) {
              onError(err instanceof Error ? err.message : "That file can't be uploaded");
            }
          }}
        />
      </div>
    </div>
  );
}
