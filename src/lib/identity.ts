"use client";

const NAME_KEY = "ptar:name";

const ADJECTIVES = ["swift", "calm", "bold", "warm", "keen", "bright", "quiet", "sharp"];
const NOUNS = ["fox", "heron", "otter", "lark", "ibex", "moth", "wren", "pike"];

export function randomName(): string {
  const a = ADJECTIVES[Math.floor(Math.random() * ADJECTIVES.length)];
  const n = NOUNS[Math.floor(Math.random() * NOUNS.length)];
  return `${a} ${n}`;
}

/** Display name, remembered per browser. Purely local — never server state. */
export function getDisplayName(): string {
  if (typeof window === "undefined") return "anon";
  try {
    const stored = localStorage.getItem(NAME_KEY);
    if (stored) return stored;
    const fresh = randomName();
    localStorage.setItem(NAME_KEY, fresh);
    return fresh;
  } catch {
    return randomName();
  }
}

export function setDisplayName(name: string): void {
  try {
    localStorage.setItem(NAME_KEY, name.trim().slice(0, 24) || randomName());
  } catch {
    /* private browsing — name just won't persist */
  }
}

/** Deterministic hue per person, so avatar colours are stable across clients. */
export function hueFor(seed: string): number {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) % 360;
  return h;
}

export function initialsFor(name: string): string {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");
}
