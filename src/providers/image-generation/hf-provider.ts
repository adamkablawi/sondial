import type { ImageGenerationProvider } from "../types";

/**
 * HuggingFace Stable Diffusion provider for text-to-image.
 *
 * Uses HuggingFace Serverless Inference API.
 * Requires:
 *   HF_IMAGE_MODEL  — model ID (e.g. "stabilityai/stable-diffusion-xl-base-1.0")
 *   HF_API_TOKEN    — HuggingFace API token
 */
export class HuggingFaceImageProvider implements ImageGenerationProvider {
  readonly name = "huggingface";

  private model: string;
  private token: string;

  constructor() {
    this.model = process.env.HF_IMAGE_MODEL ?? "";
    this.token = process.env.HF_API_TOKEN ?? "";

    if (!this.model || !this.token) {
      console.warn("[HuggingFaceImageProvider] HF_IMAGE_MODEL and HF_API_TOKEN must be set.");
    }
  }

  async generateImage(prompt: string): Promise<{ imageDataUrl: string }> {
    const url = `https://router.huggingface.co/hf-inference/models/${this.model}`;

    const engineeredPrompt =
      `${prompt}, isometric top-down angled view, entire object visible, ` +
      `centered, plain white background, product photography style, ` +
      `no cropping, full object in frame, studio lighting`;

    const response = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ inputs: engineeredPrompt }),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`HuggingFace image generation error: ${response.status} ${text}`);
    }

    // Response is binary image data
    const arrayBuffer = await response.arrayBuffer();
    const base64 = Buffer.from(arrayBuffer).toString("base64");
    const contentType = response.headers.get("content-type") ?? "image/jpeg";

    return { imageDataUrl: `data:${contentType};base64,${base64}` };
  }
}
