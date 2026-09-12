import type { ImageGenerationProvider } from "../types";

export class MockImageProvider implements ImageGenerationProvider {
  readonly name = "mock";

  async generateImage(_prompt: string): Promise<{ imageDataUrl: string }> {
    // Return a simple SVG placeholder — no network call needed for dev
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
      <defs>
        <linearGradient id="g" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" style="stop-color:#1a1a2e"/>
          <stop offset="100%" style="stop-color:#16213e"/>
        </linearGradient>
      </defs>
      <rect width="512" height="512" fill="url(#g)"/>
      <rect x="156" y="156" width="200" height="200" rx="16" fill="none" stroke="#334" stroke-width="2" opacity="0.8"/>
      <path d="M236 236 L276 196 L316 236 L316 316 L276 356 L236 316 Z" fill="none" stroke="#445" stroke-width="1.5" opacity="0.6"/>
      <text x="256" y="420" font-family="monospace" font-size="13" fill="#334" text-anchor="middle">mock image</text>
    </svg>`;
    const encoded = Buffer.from(svg).toString("base64");
    return { imageDataUrl: `data:image/svg+xml;base64,${encoded}` };
  }
}
