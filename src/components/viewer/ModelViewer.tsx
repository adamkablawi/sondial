"use client";

import { Component, Suspense, useRef, useEffect, useState, useCallback } from "react";
import { Canvas, useThree } from "@react-three/fiber";
import { OrbitControls, Environment, ContactShadows } from "@react-three/drei";
import { ModelLoader } from "./ModelLoader";
import * as THREE from "three";

interface ModelViewerProps {
  modelUrl: string | null;
  mtlUrl?: string | null;
  /** Format hint for blob URLs that lack file extensions. */
  modelFormat?: "obj" | "glb" | "stl" | "fbx" | null;
  selectedPartId: string | null;
  onPartSelect: (partId: string | null) => void;
  onSceneReady?: (scene: THREE.Group) => void;
  /** Called with the WebGL canvas so the parent can capture view images for the edit API. */
  onCanvasReady?: (canvas: HTMLCanvasElement) => void;
}

/** Catches load errors and reports to parent; renders nothing so Canvas stays valid. */
class LoadErrorBoundary extends Component<
  { onError: (error: Error) => void; children: React.ReactNode },
  { hasError: boolean }
> {
  state = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error: Error) {
    this.props.onError(error);
  }

  render() {
    if (this.state.hasError) return null;
    return this.props.children;
  }
}

function LoadingFallback() {
  return (
    <mesh>
      <boxGeometry args={[1, 1, 1]} />
      <meshStandardMaterial color="#333" wireframe />
    </mesh>
  );
}

function CanvasReporter({ onCanvasReady }: { onCanvasReady?: (canvas: HTMLCanvasElement) => void }) {
  const { gl } = useThree();
  useEffect(() => {
    if (onCanvasReady && gl.domElement) onCanvasReady(gl.domElement);
  }, [gl.domElement, onCanvasReady]);
  return null;
}

export function ModelViewer({ modelUrl, mtlUrl, modelFormat, selectedPartId, onPartSelect, onSceneReady, onCanvasReady }: ModelViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry) {
        setDimensions({
          width: entry.contentRect.width,
          height: entry.contentRect.height,
        });
      }
    });
    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);

  return (
    <div ref={containerRef} className="relative h-full w-full min-h-[400px] rounded-xl bg-neutral-950 overflow-hidden">
      {error && (
        <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 bg-neutral-950/95 p-4 text-center text-neutral-200">
          <p className="text-sm font-medium text-red-400">Failed to load model</p>
          <p className="max-w-sm text-xs text-neutral-400">{error.message}</p>
          <button
            type="button"
            onClick={() => setError(null)}
            className="rounded bg-neutral-700 px-3 py-1.5 text-xs font-medium text-white hover:bg-neutral-600"
          >
            Dismiss
          </button>
        </div>
      )}
      {dimensions.width > 0 && (
        <Canvas
          camera={{ position: [0, 2, 5], fov: 50 }}
          style={{ width: dimensions.width, height: dimensions.height }}
          gl={{ antialias: true, toneMapping: THREE.ACESFilmicToneMapping }}
        >
          <ambientLight intensity={0.4} />
          <directionalLight position={[5, 5, 5]} intensity={0.8} castShadow />
          <directionalLight position={[-3, 3, -3]} intensity={0.3} />

          <LoadErrorBoundary onError={setError}>
            <Suspense fallback={<LoadingFallback />}>
              {modelUrl ? (
                <ModelLoader
                  url={modelUrl}
                  mtlUrl={mtlUrl ?? undefined}
                  formatHint={modelFormat ?? undefined}
                  selectedPartId={selectedPartId}
                  onPartSelect={onPartSelect}
                  onSceneReady={onSceneReady}
                />
              ) : (
                <LoadingFallback />
              )}
              <Environment preset="studio" />
            </Suspense>
          </LoadErrorBoundary>

          <CanvasReporter onCanvasReady={onCanvasReady} />
          <ContactShadows position={[0, -0.5, 0]} opacity={0.3} blur={2} />
          <OrbitControls
            makeDefault
            enableDamping
            dampingFactor={0.1}
            minDistance={1}
            maxDistance={20}
          />

          <gridHelper args={[10, 10, "#222", "#222"]} position={[0, -0.5, 0]} />
        </Canvas>
      )}
    </div>
  );
}
