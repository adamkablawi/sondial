"use client";

import { useEffect, useRef, useState } from "react";

interface ModelStageProps {
  glbUrl: string | null;
  usdzUrl?: string | null;
  posterUrl?: string | null;
  alt: string;
  /** Dim and lock the stage while a new version is being made. */
  busy?: boolean;
  /** Slow idle spin. Off in the room once someone has taken control. */
  autoRotate?: boolean;
  className?: string;
}

/**
 * The 3D stage. Wraps <model-viewer>, which is the only viewer in the product:
 * it renders GLB with its PBR materials intact and hands off to the platform AR
 * viewers (Scene Viewer on Android, Quick Look on iOS) that we need anyway.
 *
 * The element is loaded client-side only — importing it registers a custom
 * element and touches `window`.
 */
export function ModelStage({
  glbUrl,
  usdzUrl,
  posterUrl,
  alt,
  busy = false,
  autoRotate = true,
  className = "",
}: ModelStageProps) {
  const ref = useRef<HTMLElement & { canActivateAR?: boolean; activateAR?: () => void }>(null);
  const [ready, setReady] = useState(false);
  const [canAR, setCanAR] = useState(false);

  useEffect(() => {
    let cancelled = false;
    import("@google/model-viewer").then(() => {
      if (!cancelled) setReady(true);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // canActivateAR settles asynchronously after the model loads.
  useEffect(() => {
    if (!ready || !glbUrl) return;
    const el = ref.current;
    if (!el) return;
    const check = () => setCanAR(Boolean(el.canActivateAR));
    check();
    el.addEventListener("load", check);
    const timer = setTimeout(check, 1200);
    return () => {
      el.removeEventListener("load", check);
      clearTimeout(timer);
    };
  }, [ready, glbUrl]);

  if (!glbUrl) return <div className={className} />;

  return (
    <div className={`relative ${className}`}>
      {ready && (
        <model-viewer
          key={glbUrl}
          ref={ref as React.Ref<HTMLElement>}
          className="rise"
          src={glbUrl}
          {...(usdzUrl ? { "ios-src": usdzUrl } : {})}
          {...(posterUrl ? { poster: posterUrl } : {})}
          alt={alt}
          ar
          ar-modes="webxr scene-viewer quick-look"
          ar-scale="auto"
          camera-controls
          {...(autoRotate && !busy ? { "auto-rotate": true } : {})}
          auto-rotate-delay={1200}
          rotation-per-second="12deg"
          interaction-prompt="none"
          environment-image="neutral"
          tone-mapping="neutral"
          exposure="1.15"
          shadow-intensity="1.4"
          shadow-softness="0.8"
          style={{
            opacity: busy ? 0.28 : 1,
            transition: "opacity 500ms ease",
            pointerEvents: busy ? "none" : "auto",
          }}
        />
      )}

      {canAR && !busy && (
        <button
          type="button"
          onClick={() => ref.current?.activateAR?.()}
          className="absolute bottom-5 right-5 z-10 border border-rule bg-ground-deep/90 px-5 py-2.5 text-[13px] text-bone backdrop-blur-sm transition-colors hover:border-bone"
        >
          Place it in the room
        </button>
      )}
    </div>
  );
}
