"use client";

import { useEffect, useRef, useCallback, useState, useMemo } from "react";
import { useLoader, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { OBJLoader } from "three/examples/jsm/loaders/OBJLoader.js";
import { setCurrentScene } from "@/lib/scene-ref";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { MTLLoader } from "three/examples/jsm/loaders/MTLLoader.js";
import { STLLoader } from "three/examples/jsm/loaders/STLLoader.js";

interface ModelLoaderProps {
  url: string;
  mtlUrl?: string;
  /** Format hint for blob/opaque URLs that lack file extensions. */
  formatHint?: "obj" | "glb" | "stl" | "fbx";
  selectedPartId: string | null;
  onPartSelect: (partId: string | null) => void;
  onSceneReady?: (scene: THREE.Group) => void;
}

const HIGHLIGHT_COLOR = new THREE.Color(0x4488ff);
const HOVER_EMISSIVE = 0.15;
const SELECT_EMISSIVE = 0.3;

/**
 * Resolve the effective file path from a URL.
 * Handles proxy URLs (extracts the original URL from the query string),
 * blob URLs (no extension info available), and regular URLs.
 */
function effectivePath(url: string): string {
  try {
    const parsed = new URL(url, "http://localhost");

    // For proxy URLs, check the embedded original URL
    if (parsed.pathname === "/api/proxy") {
      const originalUrl = parsed.searchParams.get("url");
      if (originalUrl) {
        return new URL(originalUrl).pathname.toLowerCase();
      }
    }

    return parsed.pathname.toLowerCase();
  } catch {
    return url.toLowerCase();
  }
}

function isObjFile(url: string, formatHint?: string) {
  return formatHint === "obj" || effectivePath(url).endsWith(".obj");
}

function isStlUrl(url: string, formatHint?: string) {
  return (
    formatHint === "stl" ||
    effectivePath(url).endsWith(".stl") ||
    (url.includes("/api/cad-edit/") && url.endsWith("/result"))
  );
}

function isGlbFile(url: string, formatHint?: string) {
  return formatHint === "glb" || formatHint === "fbx" || effectivePath(url).endsWith(".glb") || effectivePath(url).endsWith(".gltf");
}

/** Loads OBJ with MTL; stable hook order. */
function ObjSceneWithMtl({
  url,
  mtlUrl,
  onLoaded,
}: { url: string; mtlUrl: string; onLoaded?: (g: THREE.Group) => void }) {
  const materials = useLoader(MTLLoader, mtlUrl);
  materials.preload();
  const scene = useLoader(OBJLoader, url, (loader) => {
    (loader as OBJLoader).setMaterials(materials);
  });
  useEffect(() => {
    onLoaded?.(scene);
  }, [scene, onLoaded]);
  return <primitive object={scene} />;
}

/** Loads OBJ without MTL; stable hook order. */
function ObjSceneNoMtl({ url, onLoaded }: { url: string; onLoaded?: (g: THREE.Group) => void }) {
  const scene = useLoader(OBJLoader, url);
  useEffect(() => {
    onLoaded?.(scene);
  }, [scene, onLoaded]);
  return <primitive object={scene} />;
}

/** Loads STL; stable hook order. */
function StlScene({ url, onLoaded }: { url: string; onLoaded?: (g: THREE.Group) => void }) {
  const geometry = useLoader(STLLoader, url);
  const group = useMemo(() => {
    const g = new THREE.Group();
    const mesh = new THREE.Mesh(
      geometry,
      new THREE.MeshStandardMaterial({
        color: 0x888888,
        metalness: 0.4,
        roughness: 0.6,
      }),
    );
    mesh.name = "stl_mesh";
    g.add(mesh);
    return g;
  }, [geometry]);
  useEffect(() => {
    onLoaded?.(group);
  }, [group, onLoaded]);
  return <primitive object={group} />;
}

/** Loads GLTF; stable hook order. */
function GltfScene({ url, onLoaded }: { url: string; onLoaded?: (g: THREE.Group) => void }) {
  const gltf = useLoader(GLTFLoader, url);
  const scene = gltf.scene;
  useEffect(() => {
    onLoaded?.(scene as THREE.Group);
  }, [scene, onLoaded]);
  return <primitive object={scene} />;
}

export function ModelLoader({ url, mtlUrl, formatHint, selectedPartId, onPartSelect, onSceneReady }: ModelLoaderProps) {
  const [loadedScene, setLoadedScene] = useState<THREE.Group | null>(null);
  const groupRef = useRef<THREE.Group>(null);
  const { raycaster, pointer, camera } = useThree();
  const hoveredRef = useRef<THREE.Mesh | null>(null);
  const [initialized, setInitialized] = useState(false);

  // Use a ref for onSceneReady to avoid stale closure issues in the init effect
  const onSceneReadyRef = useRef(onSceneReady);
  onSceneReadyRef.current = onSceneReady;

  const scene = loadedScene;

  // Reset loaded scene when URL changes (skip initial mount to avoid
  // clobbering the child loader's setLoadedScene call)
  const prevUrlRef = useRef(url);
  useEffect(() => {
    if (prevUrlRef.current !== url) {
      prevUrlRef.current = url;
      setLoadedScene(null);
      setInitialized(false);
      setCurrentScene(null);
    }
  }, [url]);

  // Apply default material to OBJ meshes that lack one, center and scale the model
  useEffect(() => {
    if (!scene || initialized) return;

    let hasMeshes = false;
    scene.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        hasMeshes = true;
        if (!child.material || (child.material as THREE.Material).type === "MeshBasicMaterial") {
          child.material = new THREE.MeshStandardMaterial({
            color: 0x888888,
            metalness: 0.4,
            roughness: 0.6,
          });
        }
        if (!child.name) {
          child.name = `part_${child.uuid.slice(0, 6)}`;
        }
      }
    });

    if (hasMeshes) {
      const box = new THREE.Box3().setFromObject(scene);
      const size = box.getSize(new THREE.Vector3());
      const center = box.getCenter(new THREE.Vector3());
      const maxDim = Math.max(size.x, size.y, size.z);

      if (maxDim > 0) {
        const targetSize = 4;
        const scaleFactor = targetSize / maxDim;
        scene.scale.setScalar(scaleFactor);

        const scaledMinY = box.min.y * scaleFactor;
        scene.position.set(
          -center.x * scaleFactor,
          -scaledMinY,
          -center.z * scaleFactor,
        );
      }
    }

    setInitialized(true);
    // Set the module-level scene ref so the editor page can access it
    // This bypasses any R3F ↔ React DOM reconciler boundary issues
    setCurrentScene(scene);
    onSceneReadyRef.current?.(scene);
  }, [scene, initialized]);

  // Handle selection highlighting
  useEffect(() => {
    if (!scene) return;
    scene.traverse((child) => {
      if (!(child instanceof THREE.Mesh)) return;
      const mat = child.material as THREE.MeshStandardMaterial;
      if (!mat.emissive) return;

      if (child.uuid === selectedPartId || child.name === selectedPartId) {
        mat.emissive.copy(HIGHLIGHT_COLOR);
        mat.emissiveIntensity = SELECT_EMISSIVE;
      } else {
        mat.emissive.set(0x000000);
        mat.emissiveIntensity = 0;
      }
    });
  }, [scene, selectedPartId]);

  const handlePointerMove = useCallback(() => {
    if (!groupRef.current) return;
    raycaster.setFromCamera(pointer, camera);
    const intersects = raycaster.intersectObjects(groupRef.current.children, true);

    if (hoveredRef.current) {
      const mat = hoveredRef.current.material as THREE.MeshStandardMaterial;
      if (hoveredRef.current.uuid !== selectedPartId && hoveredRef.current.name !== selectedPartId) {
        mat.emissive?.set(0x000000);
        mat.emissiveIntensity = 0;
      }
      hoveredRef.current = null;
    }

    const hit = intersects.find((i) => i.object instanceof THREE.Mesh);
    if (hit) {
      const mesh = hit.object as THREE.Mesh;
      hoveredRef.current = mesh;
      const mat = mesh.material as THREE.MeshStandardMaterial;
      if (mesh.uuid !== selectedPartId && mesh.name !== selectedPartId) {
        mat.emissive?.copy(HIGHLIGHT_COLOR);
        mat.emissiveIntensity = HOVER_EMISSIVE;
      }
      document.body.style.cursor = "pointer";
    } else {
      document.body.style.cursor = "default";
    }
  }, [raycaster, pointer, camera, selectedPartId]);

  const handleClick = useCallback(() => {
    if (!groupRef.current) return;
    raycaster.setFromCamera(pointer, camera);
    const intersects = raycaster.intersectObjects(groupRef.current.children, true);
    const hit = intersects.find((i) => i.object instanceof THREE.Mesh);

    if (hit) {
      const mesh = hit.object as THREE.Mesh;
      onPartSelect(mesh.name || mesh.uuid);
    } else {
      onPartSelect(null);
    }
  }, [raycaster, pointer, camera, onPartSelect]);

  // Determine which loader to use. Default to OBJ (all Meshy models are OBJ).
  const useStl = isStlUrl(url, formatHint);
  const useGlb = isGlbFile(url, formatHint);
  const useObj = !useStl && !useGlb;

  return (
    <group ref={groupRef} onPointerMove={handlePointerMove} onClick={handleClick}>
      {useObj &&
        (mtlUrl ? (
          <ObjSceneWithMtl url={url} mtlUrl={mtlUrl} onLoaded={setLoadedScene} />
        ) : (
          <ObjSceneNoMtl url={url} onLoaded={setLoadedScene} />
        ))}
      {useStl && <StlScene url={url} onLoaded={setLoadedScene} />}
      {useGlb && <GltfScene url={url} onLoaded={setLoadedScene} />}
    </group>
  );
}
