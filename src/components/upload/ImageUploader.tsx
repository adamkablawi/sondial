"use client";

import { useCallback, useState, useRef } from "react";
import { fileToBase64 } from "@/lib/base64";

interface ImageUploaderProps {
  value?: string | null;
  onImageSelect: (base64DataUrl: string) => void;
  onClear?: () => void;
  disabled?: boolean;
}

export function ImageUploader({ value, onImageSelect, onClear, disabled }: ImageUploaderProps) {
  const [localPreview, setLocalPreview] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const preview = value ?? localPreview;

  const handleFile = useCallback(
    async (file: File) => {
      if (!file.type.startsWith("image/")) return;
      const dataUrl = await fileToBase64(file);
      setLocalPreview(dataUrl);
      onImageSelect(dataUrl);
    },
    [onImageSelect],
  );

  const handleClear = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      setLocalPreview(null);
      onClear?.();
    },
    [onClear],
  );

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      const file = e.dataTransfer.files[0];
      if (file) handleFile(file);
    },
    [handleFile],
  );

  const onDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const onDragLeave = useCallback(() => setIsDragging(false), []);

  return (
    <div className="w-full">
      <div
        onDrop={onDrop}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onClick={() => !disabled && inputRef.current?.click()}
        className={`
          relative flex flex-col items-center justify-center rounded-2xl border-2 border-dashed
          p-8 cursor-pointer transition-[transform_150ms_ease-out,box-shadow_400ms_ease-out,border-color_150ms]
          ${isDragging
            ? "border-neutral-400 bg-neutral-800/50 shadow-[0_0_24px_rgba(255,255,255,0.08)]"
            : "border-neutral-600 bg-neutral-900/40 hover:border-neutral-500 hover:shadow-[0_0_24px_rgba(255,255,255,0.06)]"}
          ${disabled ? "opacity-50 cursor-not-allowed" : "hover:scale-[1.01]"}
          ${preview ? "min-h-[200px]" : "min-h-[280px]"}
        `}
      >
        {preview ? (
          <div className="relative w-full">
            <img
              src={preview}
              alt="Uploaded product"
              className="mx-auto max-h-[300px] rounded-lg object-contain ring-1 ring-white/10"
            />
            {!disabled && (
              <button
                type="button"
                onClick={handleClear}
                className="absolute right-2 top-2 rounded-full bg-neutral-800/90 p-1.5 text-neutral-400 hover:text-white hover:bg-neutral-700 transition-colors"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                </svg>
              </button>
            )}
          </div>
        ) : (
          <>
            <div className="mb-4 rounded-full bg-neutral-800/80 p-4 ring-1 ring-white/5">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 text-neutral-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
              </svg>
            </div>
            <p className="text-lg font-medium text-neutral-200">
              Drop your product image here
            </p>
            <p className="mt-1 text-sm text-neutral-500">
              or click to browse — PNG, JPG up to 10MB
            </p>
          </>
        )}
      </div>

      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) handleFile(file);
        }}
      />
    </div>
  );
}
