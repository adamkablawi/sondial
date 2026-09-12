import { getLlmProvider } from "@/providers";

/**
 * Brief writing and edit merging, as plain functions.
 *
 * These were HTTP routes in the original single-player app. The worker calls
 * them directly now — there is no reason for a server-side process to make an
 * HTTP request to itself.
 */

const BRIEF_SYSTEM = `You are a product design brief writer. Given an image and/or a text description of a 3D object, write a concise formal design brief (2–4 sentences) that describes:
- What the object is
- Its key form, shape, and proportions
- Materials, finish, and colour
- Any notable design features or style

The brief will be used as a living document that guides AI 3D mesh generation. Be specific and visual. Focus on shape, material, and form — avoid actions, scenes, or background. Output only the brief text, nothing else.`;

const MERGE_SYSTEM = `You are a product design brief writer. Given a current design brief for a 3D object and an edit instruction, produce an updated brief that incorporates the edit while preserving everything the instruction does not change. The brief should be 2–4 sentences describing the object's form, materials, finish, colour, and key features — specific enough to guide AI 3D generation. Output only the updated brief, nothing else.`;

/** Meshy caps prompts at 800 characters. */
const MAX_BRIEF = 800;

const trim = (s: string) => (s.length > MAX_BRIEF ? `${s.slice(0, MAX_BRIEF - 1).trimEnd()}…` : s);

/** Turn a raw prompt and/or reference image into a design brief. */
export async function writeBrief(input: { prompt?: string; image?: string }): Promise<string> {
  const { prompt, image } = input;
  if (!prompt && !image) throw new Error("writeBrief needs a prompt or an image.");

  const llm = getLlmProvider();

  if (image) {
    const instruction =
      prompt
        ? `Write a design brief for the object shown in this image. The user also described it as: "${prompt}". Incorporate both.`
        : "Write a design brief for the object shown in this image.";
    return trim(await llm.describeImage(image, `${BRIEF_SYSTEM}\n\n${instruction}`));
  }

  return trim(
    await llm.complete([
      { role: "system", content: BRIEF_SYSTEM },
      { role: "user", content: `Write a design brief for this object: "${prompt}"` },
    ]),
  );
}

/** Fold an edit instruction into an existing brief. */
export async function mergeBrief(brief: string | null, instruction: string): Promise<string> {
  if (!brief) return writeBrief({ prompt: instruction });

  const llm = getLlmProvider();
  return trim(
    await llm.complete([
      { role: "system", content: MERGE_SYSTEM },
      {
        role: "user",
        content: `Current brief: "${brief}"\nEdit instruction: "${instruction}"\n\nUpdated brief:`,
      },
    ]),
  );
}
