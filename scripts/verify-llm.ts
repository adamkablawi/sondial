import "../src/lib/load-env";
import { getLlmProvider } from "../src/providers";

/**
 * Exercises whichever LLM provider LLM_PROVIDER selects, through the same code
 * path the worker uses. Run: npm run verify:llm
 */

// 1x1 red PNG.
const PIXEL =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

async function main() {
  const llm = getLlmProvider();
  console.log(`provider: ${llm.name}\n`);

  const text = await llm.complete([
    { role: "system", content: "Answer with one word only." },
    { role: "user", content: "Reply with: ok" },
  ]);
  console.log(`[ok] text  -> ${text}`);

  try {
    const vision = await llm.describeImage(PIXEL, "What colour is this image? One word.");
    console.log(`[ok] vision -> ${vision}`);
  } catch (e) {
    console.log(`[!!] vision -> ${(e as Error).message.slice(0, 300)}`);
    console.log(
      "\nReference images will be ignored rather than breaking generation.\n" +
        "Text prompts are unaffected.",
    );
  }
}

main().catch((e) => {
  console.error(`\nFAILED: ${e.message}`);
  process.exit(1);
});
