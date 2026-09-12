/** Room codes people can read aloud across a table. No ambiguous characters. */
const WORDS = [
  "plum", "moss", "clay", "ash", "fern", "dusk", "reef", "loft",
  "kiln", "onyx", "sage", "flux", "nova", "mint", "iron", "opal",
];

export function generateRoomCode(): string {
  const word = WORDS[Math.floor(Math.random() * WORDS.length)];
  const digits = String(Math.floor(Math.random() * 90) + 10);
  return `${word}-${digits}`;
}

export const normalizeRoomCode = (input: string) =>
  input.trim().toLowerCase().replace(/\s+/g, "-");
