"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  assertImage,
  assertUploadable,
  captureFrame,
  captureFrames,
  formatDuration,
  uploadImage,
  uploadVideo,
} from "@/lib/admin/video-upload";

export type ThumbSource = "auto" | "manual";

type Props = {
  adminKey: string;
  videoUrl: string;
  thumbnail: string;
  thumbnailSource?: ThumbSource;
  orientation: "vertical" | "horizontal";
  /** A file dropped on a category card — uploads as soon as the editor opens. */
  initialFile?: File;
  disabled?: boolean;
  onVideo: (result: { videoUrl: string; duration: number }) => void;
  onThumbnail: (url: string, source?: ThumbSource) => void;
  /** True while any upload (video or still) is running — the editor blocks Save. */
  onBusyChange: (busy: boolean) => void;
  onError: (message: string) => void;
};

/** A locally captured still — uploaded only once it's picked. */
type Frame = { id: string; blob: Blob; preview: string; time: number };

/** How far "New frames" may wander from each sample point (± share of duration). */
const REFRESH_JITTER = 0.07;

const btn =
  "shrink-0 border border-white/15 px-3 py-1.5 font-mono text-[10px] uppercase tracking-widest text-white/80 hover:border-white/40 disabled:opacity-40";

/**
 * Video goes straight to Vercel Blob the moment it's picked (real progress,
 * cancellable). Meanwhile four stills (25 / 50 / 75 / 95%) are grabbed locally
 * into a gallery; the first is uploaded and set as an "auto" thumbnail —
 * unless a manual one is already in place. Picking another frame uploads that
 * one instead; "New frames" re-samples around the same points.
 */
export default function VideoUploader({
  adminKey,
  videoUrl,
  thumbnail,
  thumbnailSource,
  orientation,
  initialFile,
  disabled,
  onVideo,
  onThumbnail,
  onBusyChange,
  onError,
}: Props) {
  const videoInput = useRef<HTMLInputElement>(null);
  const imageInput = useRef<HTMLInputElement>(null);
  const playerRef = useRef<HTMLVideoElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  const [local, setLocal] = useState<{ file: File; url: string } | null>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [thumbBusy, setThumbBusy] = useState(false);
  const [thumbPreview, setThumbPreview] = useState<string | null>(null);
  const [frames, setFrames] = useState<Frame[]>([]);
  const [framesBusy, setFramesBusy] = useState(false);
  const [framesError, setFramesError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  /** frame id → uploaded Blob URL, so re-picking a frame doesn't re-upload it. */
  const uploadedRef = useRef(new Map<string, string>());
  /** Bumped per extraction; a stale (superseded / unmounted) one drops its result. */
  const extractGen = useRef(0);

  const busy = progress !== null || thumbBusy;
  useEffect(() => onBusyChange(busy), [busy, onBusyChange]);

  // Revoke object URLs we created.
  useEffect(() => () => {
    if (local) URL.revokeObjectURL(local.url);
  }, [local]);
  useEffect(() => () => {
    if (thumbPreview) URL.revokeObjectURL(thumbPreview);
  }, [thumbPreview]);
  useEffect(() => () => frames.forEach((f) => URL.revokeObjectURL(f.preview)), [frames]);
  // Closing the editor mid-upload cancels it (the editor confirms first). Safe
  // under Strict Mode: the dropped-file upload below is deferred, so nothing
  // is in flight yet when the dev-only first unmount runs this.
  useEffect(
    () => () => {
      abortRef.current?.abort();
      extractGen.current++;
    },
    [],
  );

  const uploadStill = useCallback(
    async (blob: Blob, source: ThumbSource, name?: string) => {
      setThumbBusy(true);
      setThumbPreview(URL.createObjectURL(blob));
      try {
        const { url } = await uploadImage(blob, () => undefined, { key: adminKey, name });
        onThumbnail(url, source);
        return url;
      } catch (err) {
        onError(err instanceof Error ? err.message : "Thumbnail upload failed");
        return null;
      } finally {
        setThumbBusy(false);
      }
    },
    [adminKey, onError, onThumbnail],
  );

  const selectFrame = useCallback(
    async (frame: Frame) => {
      setSelectedId(frame.id);
      const cached = uploadedRef.current.get(frame.id);
      if (cached) {
        setThumbPreview(null);
        onThumbnail(cached, "auto");
        return;
      }
      const url = await uploadStill(frame.blob, "auto");
      if (url) uploadedRef.current.set(frame.id, url);
      else setSelectedId((id) => (id === frame.id ? null : id));
    },
    [onThumbnail, uploadStill],
  );

  /**
   * Fills the gallery. `autoSelect` picks (and uploads) the first frame;
   * `isCancelled` lets the caller drop the result, e.g. when its upload was
   * cancelled meanwhile.
   */
  const extract = useCallback(
    async (source: File | string, { jitter = 0, autoSelect = false, isCancelled = () => false } = {}) => {
      const gen = ++extractGen.current;
      setFramesBusy(true);
      setFramesError(null);
      try {
        const shots = await captureFrames(source, undefined, { jitter });
        if (gen !== extractGen.current || isCancelled()) return;
        const next = shots.map((shot, i) => ({
          id: `${gen}-${i}`,
          blob: shot.blob,
          time: shot.time,
          preview: URL.createObjectURL(shot.blob),
        }));
        setFrames(next);
        setSelectedId(null);
        if (autoSelect && next[0]) void selectFrame(next[0]);
      } catch (err) {
        // Codec the browser can't decode, or a host without CORS — the video
        // itself still uploads; the gallery just says why it's empty.
        if (gen === extractGen.current) setFramesError(err instanceof Error ? err.message : "Couldn't capture frames");
      } finally {
        if (gen === extractGen.current) setFramesBusy(false);
      }
    },
    [selectFrame],
  );

  const start = useCallback(
    async (file: File) => {
      try {
        assertUploadable(file);
      } catch (err) {
        return onError(err instanceof Error ? err.message : "That file can't be uploaded");
      }
      abortRef.current?.abort();
      const ctrl = new AbortController();
      abortRef.current = ctrl;
      setLocal({ file, url: URL.createObjectURL(file) });
      setProgress(0);

      // Frame gallery in parallel; the first frame becomes the thumbnail
      // unless a hand-picked one is in place (that is never overwritten).
      void extract(file, {
        autoSelect: thumbnailSource !== "manual",
        isCancelled: () => ctrl.signal.aborted,
      });

      try {
        const result = await uploadVideo(file, setProgress, { key: adminKey, signal: ctrl.signal });
        onVideo(result);
      } catch (err) {
        if (ctrl.signal.aborted) return;
        onError(err instanceof Error ? `Upload failed: ${err.message}` : "Upload failed");
      } finally {
        // Only the current upload may clear state — a superseded one mustn't
        // hide the progress bar of the upload that replaced it.
        if (abortRef.current === ctrl) {
          abortRef.current = null;
          setProgress(null);
        }
      }
    },
    [adminKey, extract, onError, onVideo, thumbnailSource],
  );

  // A file dropped on a category card uploads as soon as the editor opens.
  // Deferred a tick and never aborted here: React Strict Mode's dev-only
  // mount → unmount → mount clears the first timer before it fires, so exactly
  // one upload starts, after the component has settled. Cancel stays a user
  // action (Cancel button / closing the editor).
  const startRef = useRef(start);
  useEffect(() => {
    startRef.current = start;
  });
  useEffect(() => {
    if (!initialFile) return;
    const timer = window.setTimeout(() => void startRef.current(initialFile), 0);
    return () => window.clearTimeout(timer);
  }, [initialFile]);

  const recapture = async () => {
    const source = local?.file ?? videoUrl;
    if (!source) return;
    const at = playerRef.current && playerRef.current.currentTime > 0 ? playerRef.current.currentTime : 1;
    try {
      const frame = await captureFrame(source, at);
      setSelectedId(null);
      await uploadStill(frame, "auto");
    } catch (err) {
      onError(err instanceof Error ? err.message : "Couldn't capture a frame");
    }
  };

  const src = local?.url ?? videoUrl;
  const frameSource = local?.file ?? videoUrl;
  const shownThumb = thumbPreview ?? thumbnail;

  return (
    <div className="flex flex-col gap-4">
      <div
        className={`relative mx-auto w-full overflow-hidden rounded-sm border border-white/10 bg-black ${
          orientation === "vertical" ? "aspect-[9/16] max-h-[46vh] max-w-[26vh]" : "aspect-video"
        }`}
      >
        {src ? (
          <video
            ref={playerRef}
            key={src}
            src={src}
            poster={shownThumb || undefined}
            controls
            muted
            playsInline
            preload="metadata"
            className="absolute inset-0 size-full object-contain"
          />
        ) : (
          <button
            type="button"
            disabled={disabled}
            onClick={() => videoInput.current?.click()}
            className="absolute inset-0 flex flex-col items-center justify-center gap-2 font-mono text-[10px] uppercase tracking-widest text-white/30 hover:text-white/60"
          >
            <span className="text-2xl">＋</span>
            Choose a video
          </button>
        )}

        {progress !== null && (
          <div className="absolute inset-x-0 bottom-0 bg-black/75 px-3 py-2">
            <div className="mb-1 flex justify-between font-mono text-[10px] uppercase tracking-widest text-white/70">
              <span>Uploading to Blob</span>
              <span className="tabular-nums">{progress}%</span>
            </div>
            <div className="h-1 w-full bg-white/10">
              <div className="h-full bg-[#e7fe55] transition-[width] duration-200" style={{ width: `${progress}%` }} />
            </div>
          </div>
        )}
      </div>

      <div className="flex items-center justify-between gap-2">
        <p className="min-w-0 truncate font-mono text-[10px] uppercase tracking-widest text-white/40">
          {local ? local.file.name : videoUrl ? hostOf(videoUrl) : "Up to 2GB · MP4 / WebM / MOV"}
        </p>
        <div className="flex gap-2">
          {progress !== null && (
            <button type="button" className={btn} onClick={() => abortRef.current?.abort()}>
              Cancel
            </button>
          )}
          <button type="button" disabled={disabled || progress !== null} onClick={() => videoInput.current?.click()} className={btn}>
            {src ? "Replace video" : "Choose video"}
          </button>
        </div>
        <input
          ref={videoInput}
          type="file"
          accept="video/mp4,video/webm,video/quicktime,video/*"
          hidden
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = "";
            if (file) void start(file);
          }}
        />
      </div>

      {/* Thumbnail management */}
      <div className="flex gap-3 border-t border-white/10 pt-4">
        <div
          className={`relative shrink-0 overflow-hidden rounded-sm border border-white/10 bg-white/[0.03] ${
            orientation === "vertical" ? "aspect-[9/16] w-16" : "aspect-video w-28"
          }`}
        >
          {shownThumb ? (
            // eslint-disable-next-line @next/next/no-img-element -- admin-only preview of a just-uploaded still
            <img src={shownThumb} alt="Thumbnail" className="size-full object-cover" />
          ) : (
            <span className="absolute inset-0 flex items-center justify-center font-mono text-[8px] uppercase text-white/25">None</span>
          )}
          {thumbBusy && <span className="absolute inset-0 animate-pulse bg-black/50" />}
        </div>
        <div className="flex min-w-0 flex-1 flex-col justify-between gap-2">
          <p className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-widest text-white/40">
            Thumbnail
            {thumbnail && thumbnailSource && <SourceChip source={thumbnailSource} />}
            {thumbBusy && <span className="text-[#e7fe55]">uploading…</span>}
          </p>
          <div className="flex flex-wrap gap-2">
            <button type="button" disabled={disabled || thumbBusy} onClick={() => imageInput.current?.click()} className={btn}>
              Replace
            </button>
            <button
              type="button"
              disabled={disabled || thumbBusy || !src}
              onClick={() => void recapture()}
              title="Grabs the frame the player is paused on (or 1s in)"
              className={btn}
            >
              Re-capture
            </button>
            {thumbnail && (
              <button
                type="button"
                disabled={disabled || thumbBusy}
                onClick={() => {
                  setThumbPreview(null);
                  setSelectedId(null);
                  onThumbnail("");
                }}
                className={`${btn} text-[#ff5a5a]`}
              >
                Remove
              </button>
            )}
          </div>
        </div>
        <input
          ref={imageInput}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          hidden
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = "";
            if (!file) return;
            try {
              assertImage(file);
              setSelectedId(null);
              void uploadStill(file, "manual", file.name);
            } catch (err) {
              onError(err instanceof Error ? err.message : "That image can't be used");
            }
          }}
        />
      </div>

      {frameSource && (
        <FrameGallery
          frames={frames}
          selectedId={selectedId}
          orientation={orientation}
          busy={framesBusy}
          error={framesError}
          disabled={disabled || thumbBusy}
          onSelect={(f) => void selectFrame(f)}
          onRefresh={() => void extract(frameSource, { jitter: frames.length ? REFRESH_JITTER : 0 })}
        />
      )}
    </div>
  );
}

/** 2×2 grid of candidate stills; the picked one is ringed and becomes the thumbnail. */
function FrameGallery({
  frames,
  selectedId,
  orientation,
  busy,
  error,
  disabled,
  onSelect,
  onRefresh,
}: {
  frames: Frame[];
  selectedId: string | null;
  orientation: "vertical" | "horizontal";
  busy: boolean;
  error: string | null;
  disabled?: boolean;
  onSelect: (frame: Frame) => void;
  onRefresh: () => void;
}) {
  const aspect = orientation === "vertical" ? "aspect-[9/16]" : "aspect-video";
  return (
    <div className="flex flex-col gap-3 border-t border-white/10 pt-4">
      <div className="flex items-center justify-between gap-2">
        <p className="font-mono text-[10px] uppercase tracking-widest text-white/40">
          Frames {busy && <span className="text-[#e7fe55]">capturing…</span>}
        </p>
        <button
          type="button"
          disabled={busy}
          onClick={onRefresh}
          title={frames.length ? "Sample different moments near 25 / 50 / 75 / 95%" : "Grab stills at 25 / 50 / 75 / 95%"}
          className={btn}
        >
          {frames.length ? "↻ New frames" : "Extract frames"}
        </button>
      </div>

      {error && !busy && <p className="font-mono text-[10px] uppercase tracking-widest text-[#ff5a5a]/80">{error}</p>}

      {(frames.length > 0 || busy) && (
        <div
          role="radiogroup"
          aria-label="Thumbnail frame"
          className={`grid grid-cols-2 gap-2 ${orientation === "vertical" ? "mx-auto w-full max-w-[220px]" : ""}`}
        >
          {busy && frames.length === 0
            ? Array.from({ length: 4 }, (_, i) => (
                <span key={i} className={`${aspect} animate-pulse rounded-sm border border-white/10 bg-white/[0.04]`} />
              ))
            : frames.map((f, i) => {
                const on = f.id === selectedId;
                return (
                  <button
                    key={f.id}
                    type="button"
                    role="radio"
                    aria-checked={on}
                    aria-label={`Frame ${i + 1} at ${formatDuration(f.time)}`}
                    disabled={disabled || busy}
                    onClick={() => onSelect(f)}
                    className={`relative overflow-hidden rounded-sm border bg-black transition ${aspect} ${
                      on ? "border-[#e7fe55] ring-2 ring-[#e7fe55]/60" : "border-white/10 hover:border-white/40"
                    } ${busy ? "opacity-50" : ""} disabled:cursor-not-allowed`}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element -- local object-URL preview */}
                    <img src={f.preview} alt="" className="size-full object-cover" />
                    <span className="absolute bottom-1 left-1 bg-black/70 px-1 font-mono text-[9px] tabular-nums text-white/80">
                      {formatDuration(f.time)}
                    </span>
                    {on && (
                      <span className="absolute right-1 top-1 flex size-4 items-center justify-center rounded-full bg-[#e7fe55] text-[9px] font-bold text-black">
                        ✓
                      </span>
                    )}
                  </button>
                );
              })}
        </div>
      )}
    </div>
  );
}

function hostOf(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}

export function SourceChip({ source }: { source: ThumbSource }) {
  return (
    <span
      title={source === "auto" ? "Grabbed from the video" : "Uploaded by hand"}
      className={`rounded-full border px-1.5 py-px font-mono text-[8px] uppercase tracking-widest ${
        source === "auto" ? "border-white/20 text-white/50" : "border-[#e7fe55]/40 text-[#e7fe55]"
      }`}
    >
      {source}
    </span>
  );
}
