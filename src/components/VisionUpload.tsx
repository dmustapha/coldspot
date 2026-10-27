// File: src/components/VisionUpload.tsx
// Upload ONE damage photo / repair invoice -> base64 data URL -> the resolve route
// (bounded, consistency-check only; §4.3 / D3). Validation is the first safety layer
// (SECURITY threat matrix): MIME allow-list + hard size cap BEFORE any read.
"use client";

import { useState } from "react";

const MAX_BYTES = 8 * 1024 * 1024; // 8MB hard cap (Safety Layer 1)
const ALLOWED = new Set(["image/png", "image/jpeg", "image/webp"]);

export function VisionUpload({
  onImage,
  label = "Claim evidence",
  hint = "(damage photo or repair invoice · optional)",
  id = "vision-upload",
}: {
  onImage: (dataUrl: string | undefined) => void;
  label?: string;
  hint?: string;
  id?: string;
}) {
  const [preview, setPreview] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);

  function reset() {
    setPreview(null);
    setFileName(null);
    setError(null);
    onImage(undefined);
  }

  function handle(e: React.ChangeEvent<HTMLInputElement>) {
    setError(null);
    const file = e.target.files?.[0];
    if (!file) return;

    // MIME allow-list (reject SVG/gif/pdf and anything scriptable).
    if (!ALLOWED.has(file.type)) {
      setError("Unsupported type. Use PNG, JPEG, or WebP.");
      reset();
      return;
    }
    // Hard size cap before reading the file into memory.
    if (file.size > MAX_BYTES) {
      setError(
        `Image too large (${(file.size / 1024 / 1024).toFixed(1)}MB). Max is 8MB.`,
      );
      reset();
      return;
    }

    const reader = new FileReader();
    reader.onerror = () => {
      setError("Could not read the file.");
      reset();
    };
    reader.onload = () => {
      const url = reader.result as string;
      setPreview(url);
      setFileName(file.name);
      onImage(url);
    };
    reader.readAsDataURL(file);
  }

  return (
    <div className="card-flat p-4">
      <div className="flex items-center justify-between">
        <label htmlFor={id} className="text-[13.5px] font-medium text-ink">
          {label}
          <span className="ml-1.5 font-mono text-[11px] font-normal text-ink-faint">{hint}</span>
        </label>
        {preview && (
          <button
            type="button"
            onClick={reset}
            className="font-mono text-[11px] text-ink-faint underline underline-offset-2 transition-colors hover:text-ink"
          >
            remove
          </button>
        )}
      </div>

      <label
        htmlFor={id}
        className="mt-2.5 flex cursor-pointer items-center justify-between gap-3 rounded-card border border-dashed border-ink-18 bg-[oklch(14%_0.014_230)] px-3.5 py-3 transition-colors duration-150 hover:border-accent-30 active:bg-ink-04"
      >
        <span className="flex items-center gap-2.5">
          <span
            aria-hidden
            className={`h-[10px] w-[10px] rounded-[2px] ${fileName ? "bg-accent" : "border border-dashed border-ink-30"}`}
          />
          <span className="text-[12.5px] text-ink-dim">
            {fileName ?? "Drop the image on the lamp, or browse"}
          </span>
        </span>
        <span className="rounded-chip border border-ink-18 px-2.5 py-1 font-mono text-[11px] text-ink">
          browse
        </span>
      </label>
      <input
        id={id}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        onChange={handle}
        aria-invalid={!!error}
        aria-describedby={error ? `${id}-error` : undefined}
        className="sr-only"
      />

      <p className="mt-1.5 font-mono text-[10.5px] text-ink-faint">PNG, JPEG or WebP · 8MB max</p>

      {error && (
        <p id={`${id}-error`} role="alert" className="mt-2 font-mono text-[11.5px] text-garnet">
          {error}
        </p>
      )}

      {preview && (
        <div className="mt-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={preview}
            alt={fileName ? `Preview of ${fileName}` : "Uploaded claim evidence"}
            className="max-h-44 rounded-card border border-ink-08"
          />
        </div>
      )}
    </div>
  );
}
