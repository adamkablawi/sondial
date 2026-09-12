"use client";

import { useEffect, useRef, useState } from "react";
import { HandoffQR } from "./HandoffQR";

interface ARLauncherProps {
  /** Absolute URL of the mesh. Only GLB can be handed to the platform AR viewers. */
  meshUrl: string | null;
  meshFormat: string | null;
  /**
   * Optional pre-built USDZ for iOS Quick Look. Nothing in the app writes this
   * yet; when it is absent the GLB is converted in the browser instead.
   */
  usdzUrl?: string | null;
  alt: string;
}

/**
 * iPhone, iPad, and iPadOS — which reports itself as a Mac and is separable
 * only by the touch points. Quick Look is the only AR mode these expose.
 */
function isAppleMobile() {
  if (typeof navigator === "undefined") return false;
  return (
    /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)
  );
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
 *   - **iOS needs a USDZ.** Quick Look will not open a GLB, and `ObjectVersion`
 *     still has no USDZ column, so on iOS the GLB is converted in the browser
 *     with three's USDZExporter and Quick Look is handed a blob. If that
 *     conversion fails the QR handoff stays available.
 */
export function ARLauncher({ meshUrl, meshFormat, usdzUrl, alt }: ARLauncherProps) {
  const ref = useRef<HTMLElement & { canActivateAR?: boolean; activateAR?: () => void }>(null);
  const [loaded, setLoaded] = useState(false);
  const [canAR, setCanAR] = useState(false);
  const [showQR, setShowQR] = useState(false);
  const [roomUrl, setRoomUrl] = useState<string | null>(null);
  const [iosUsdz, setIosUsdz] = useState<string | null>(null);
  const [preparingUsdz, setPreparingUsdz] = useState(false);

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

  // An explicit USDZ from the caller always wins; otherwise convert the GLB
  // here. The exporter ships with three, so this costs no new dependency and
  // no server round-trip, and it keeps `ObjectVersion` unchanged.
  const iosSrc = usdzUrl ?? iosUsdz;

  useEffect(() => {
    if (!arSrc || usdzUrl || !isAppleMobile()) return;

    let cancelled = false;
    let objectUrl: string | null = null;
    setPreparingUsdz(true);

    void (async () => {
      try {
        const [{ GLTFLoader }, { USDZExporter }] = await Promise.all([
          import("three/examples/jsm/loaders/GLTFLoader.js"),
          import("three/examples/jsm/exporters/USDZExporter.js"),
        ]);
        const gltf = await new GLTFLoader().loadAsync(arSrc);
        // quickLookCompatible trades some material fidelity for the subset of
        // USD that Quick Look actually renders.
        const usdz = await new USDZExporter().parseAsync(gltf.scene, {
          quickLookCompatible: true,
        });
        if (cancelled) return;
        objectUrl = URL.createObjectURL(
          new Blob([usdz], { type: "model/vnd.usdz+zip" }),
        );
        setIosUsdz(objectUrl);
      } catch {
        // Not fatal — without an ios-src the QR handoff is still offered.
      } finally {
        if (!cancelled) setPreparingUsdz(false);
      }
    })();

    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [arSrc, usdzUrl]);

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
  }, [loaded, arSrc, iosSrc]);

  // Nothing to place: no mesh, or a format the platform viewers won't take.
  if (!arSrc) return null;

  return (
    <>
      {loaded && (
        <model-viewer
          key={arSrc}
          ref={ref as React.Ref<HTMLElement>}
          src={arSrc}
          {...(iosSrc ? { "ios-src": iosSrc } : {})}
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
        ) : preparingUsdz ? (
          <button
            type="button"
            disabled
            className="rounded-lg border border-neutral-700 bg-neutral-900/90 px-4 py-2 text-xs text-neutral-400 backdrop-blur-sm"
          >
            Preparing AR...
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
