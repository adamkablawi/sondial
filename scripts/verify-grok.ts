import "../src/lib/load-env";

/**
 * Verifies what the current xAI key can actually reach.
 *
 * The published model list moves, and which chat models accept image input is
 * not documented reliably — so rather than hardcoding a guess, check it.
 * Run:  npm run verify:grok
 */

const KEY = process.env.XAI_API_KEY;
const BASE = process.env.XAI_BASE_URL ?? "https://api.x.ai/v1";
const TEXT = process.env.GROK_TEXT_MODEL ?? "grok-4.6";
const VISION = process.env.GROK_VISION_MODEL ?? TEXT;

// 1x1 red PNG.
const PIXEL =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

async function main() {
  if (!KEY) {
    console.error("XAI_API_KEY is not set. Add it to .env and retry.");
    process.exit(1);
  }

  console.log(`base: ${BASE}\n`);

  const list = await fetch(`${BASE}/models`, { headers: { Authorization: `Bearer ${KEY}` } });
  if (list.ok) {
    const { data } = await list.json();
    console.log("available models:");
    for (const m of data ?? []) console.log("  -", m.id);
  } else {
    console.log(`could not list models: ${list.status} ${await list.text()}`);
  }

  const probe = async (label: string, model: string, content: unknown) => {
    const res = await fetch(`${BASE}/chat/completions`, {
      method: "POST",
      headers: { Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model, messages: [{ role: "user", content }], max_tokens: 30 }),
    });
    const body = await res.text();
    console.log(
      res.ok
        ? `\n[ok] ${label} (${model}) -> ${JSON.parse(body).choices?.[0]?.message?.content?.trim()}`
        : `\n[!!] ${label} (${model}) -> ${res.status} ${body.slice(0, 300)}`,
    );
    return res.ok;
  };

  await probe("text", TEXT, "Reply with the single word: ok");

  const visionOk = await probe("vision", VISION, [
    { type: "image_url", image_url: { url: `data:image/png;base64,${PIXEL}`, detail: "low" } },
    { type: "text", text: "What colour is this image? One word." },
  ]);

  if (!visionOk) {
    console.log(
      "\nVision is unavailable on this model. That is survivable - the Grok provider\n" +
        "falls back to text-only automatically, so reference images are ignored\n" +
        "rather than breaking generation. Set GROK_VISION_MODEL to a vision-capable\n" +
        "id from the list above if you want image briefs.",
    );
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
