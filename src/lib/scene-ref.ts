import type * as THREE from "three";

/**
 * Global reference to the current Three.js scene.
 *
 * Uses globalThis to guarantee the reference is shared across all module
 * instances (R3F Canvas reconciler vs React DOM, different chunks, etc).
 */

const GLOBAL_KEY = "__itera_scene_ref__" as const;

interface SceneRefGlobal {
  [GLOBAL_KEY]?: THREE.Group | null;
}

export function setCurrentScene(scene: THREE.Group | null) {
  (globalThis as unknown as SceneRefGlobal)[GLOBAL_KEY] = scene;
  console.log("[scene-ref] setCurrentScene:", scene ? `Group with ${scene.children.length} children` : "null");
}

export function getCurrentScene(): THREE.Group | null {
  return (globalThis as unknown as SceneRefGlobal)[GLOBAL_KEY] ?? null;
}
