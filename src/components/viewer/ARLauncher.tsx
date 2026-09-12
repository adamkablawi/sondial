"use client";

import { useEffect, useRef, useState } from "react";
import { HandoffQR } from "./HandoffQR";

interface ARLauncherProps {
  /** Absolute URL of the mesh. Only GLB can be handed to the platform AR viewers. */
  meshUrl: string | null;
  meshFormat: string | null;
  /** Optional USDZ for iOS Quick Look. Nothing writes this yet — see note below. */
  usdzUrl?: string | null;
  alt: string;
}

/**
 * Places the current version in the room, in AR.
 *
 * The on-screen viewer stays React Three Fiber; this component exists only to
 * reach the *platform* AR viewers (WebXR / Scene Viewer on Android, Quick Look
 * on iOS), which R3F cannot do — @react-three/xr is not installed, and the
 * platform viewers give us occlusion and real-world scale for free.
 *
 * `<model-viewer>` is the launcher, not a second viewer: it is rendered
 * collapsed and inert, and we only ever call `activateAR()` on it. It has to be
 * in the document for the model to load and for `canActivateAR` to settle.
 *
 * Two real limitations, deliberately surfaced rather than hidden:
 *   - **GLB only.** Scene Viewer and WebXR take glTF; OBJ/STL/FBX versions get
 *     no AR button at all rather than a button that fails.
 *   - **iOS needs a USDZ.** Quick Look will not open a GLB. `ObjectVersion` has
 *     no USDZ column yet, so on iOS this falls back to the QR handoff.
 */
export function ARLauncher({ meshUrl, meshFormat, usdzUrl, alt }: ARLauncherProps) {
  const ref = useRef<HTMLElement & { canActivateAR?: boolean; activateAR?: () => void }>(null);
  const [loaded, setLoaded] = useState(false);
  const [canAR, setCanAR] = useState(false);
  const [showQR, setShowQR] = useState(false);
  const [roomUrl, setRoomUrl] = useState<string | null>(null);

  // Scene Viewer and Quick Look fetch the mesh from outside the page, so a
  // relative path is not enough — it has to be absolute. Resolving against the
  // page origin (rather than rejecting it) is what makes the bundled mock mesh
  // reachable, and on a phone over the LAN it resolves to the LAN origin.
  const [origin, setOrigin] = useState<string | null>(null);
  const isGlb = meshFormat?.toLowerCase() === "glb";
  const arSrc = !meshUrl || !isGlb
    ? null
    : /^https?:\/\//i.test(meshUrl)
      ? meshUrl
      : origin
        ? new URL(meshUrl, origin).href
        : null;

  useEffect(() => {
    setRoomUrl(window.location.href);
    setOrigin(window.location.origin);
  }, []);

  useEffect(() => {
    if (!arSrc) return;
    let cancelled = false;
    void import("@google/model-viewer").then(() => {
      if (!cancelled) setLoaded(true);
    });
    return () => {
      cancelled = true;
    };
  }, [arSrc]);

  // canActivateAR settles asynchronously, after the element decides whether the
  // device supports a mode. Poll once on load and once shortly after.
  useEffect(() => {
    if (!loaded || !arSrc) return;
    const el = ref.current;
    if (!el) return;
    const check = () => setCanAR(Boolean(el.canActivateAR));
    check();
    el.addEventListener("load", check);
    const timer = setTimeout(check, 1500);
    return () => {
      el.removeEventListener("load", check);
      clearTimeout(timer);
    };
  }, [loaded, arSrc]);

  // Nothing to place: no mesh, or a format the platform viewers won't take.
  if (!arSrc) return null;

  return (
    <>
      {loaded && (
        <model-viewer
          key={arSrc}
          ref={ref as React.Ref<HTMLElement>}
          src={arSrc}
          {...(usdzUrl ? { "ios-src": usdzUrl } : {})}
          alt={alt}
          ar
          ar-modes="webxr scene-viewer quick-look"
          ar-scale="auto"
          reveal="manual"
          aria-hidden="true"
          style={{
            position: "absolute",
            width: 1,
            height: 1,
            opacity: 0,
            pointerEvents: "none",
          }}
        />
      )}

      <div className="absolute bottom-4 right-4 z-10 flex flex-col items-end gap-2">
        {showQR && roomUrl && (
          <div className="rounded-lg border border-neutral-700 bg-neutral-900/95 p-3 backdrop-blur-sm">
            <HandoffQR url={roomUrl} />
          </div>
        )}

        {canAR ? (
          <button
            type="button"
            onClick={() => ref.current?.activateAR?.()}
            className="rounded-lg border border-neutral-600 bg-neutral-900/90 px-4 py-2 text-xs font-medium text-neutral-100 backdrop-blur-sm transition-colors hover:border-neutral-400"
          >
            Place it in the room
          </button>
        ) : (
          <button
            type="button"
            onClick={() => setShowQR((v) => !v)}
            className="rounded-lg border border-neutral-700 bg-neutral-900/90 px-4 py-2 text-xs text-neutral-300 backdrop-blur-sm transition-colors hover:border-neutral-500 hover:text-neutral-100"
          >
            {showQR ? "Hide code" : "View in AR on your phone"}
          </button>
        )}
      </div>
    </>
  );
}
