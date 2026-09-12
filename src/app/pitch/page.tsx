"use client";

import { useState } from "react";

/**
 * The pitch outline, in one place, so the on-screen list and the exported
 * .pptx can never drift into two different versions of the same facts.
 */
const SLIDES = [
  {
    title: "The problem",
    body: [
      "Design reviews happen over screenshots and email threads.",
      "Nobody sees the same object, at the same time.",
    ],
  },
  {
    title: "The approach",
    body: [
      "Describe a change in chat.",
      "Everyone in the room sees it update, live.",
      "Place it in AR, at real scale.",
    ],
  },
  {
    title: "Under the hood",
    body: [
      "Chat -> Postgres -> Redis/BullMQ -> Gemini -> Meshy -> new version -> Socket.IO -> AR.",
      "Gemini turns one chat message into an updated design and a generation prompt — the memory the mesh model itself doesn't have.",
      "Biggest challenge: the mesh model can't edit an existing model, so continuity between versions is engineered at the application layer, not assumed from the API.",
    ],
  },
  {
    title: "Let's see it",
    body: [
      "Live demo: [paste your URL before presenting]",
      "Open -> Scan -> Experience.",
    ],
  },
];

async function exportPptx() {
  // Dynamic import: keeps this browser-only library out of the server
  // bundle entirely, rather than trusting it to be SSR-safe on its own.
  const PptxGenJS = (await import("pptxgenjs")).default;
  const pptx = new PptxGenJS();
  pptx.defineLayout({ name: "WIDE", width: 10, height: 5.63 });
  pptx.layout = "WIDE";

  for (const slide of SLIDES) {
    const s = pptx.addSlide();
    s.background = { color: "0A0A0A" };
    s.addText(slide.title.toUpperCase(), {
      x: 0.6, y: 0.5, w: 8.8, h: 0.8,
      fontSize: 30, bold: true, color: "F5F5F5",
      fontFace: "Helvetica",
    });
    s.addText(
      slide.body.map((line) => ({ text: line, options: { breakLine: true, paraSpaceAfter: 10 } })),
      {
        x: 0.6, y: 1.6, w: 8.8, h: 3.6,
        fontSize: 16, color: "AAAAAA", fontFace: "Helvetica",
        valign: "top",
      },
    );
  }

  // A real web app has no download sandbox — writeFile triggers a normal
  // browser save directly, no capability negotiation needed.
  await pptx.writeFile({ fileName: "sondial.pptx" });
}

export default function PitchPage() {
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleExport = async () => {
    setExporting(true);
    setError(null);
    try {
      await exportPptx();
    } catch {
      setError("Could not export — try again.");
    } finally {
      setExporting(false);
    }
  };

  return (
    <main className="mx-auto min-h-screen max-w-2xl px-6 pb-20 pt-16">
      <h1 className="text-lg font-medium text-neutral-100">sondial — 4 slides</h1>
      <p className="mt-1 text-xs text-neutral-500">
        A plain outline of the deck. Export it as a real .pptx below.
      </p>

      <div className="mt-8 border-t border-neutral-800">
        {SLIDES.map((slide, i) => (
          <div key={slide.title} className="grid grid-cols-[28px_1fr] gap-x-4 border-b border-neutral-800 py-4">
            <span className="pt-0.5 font-mono text-[11px] text-neutral-600">
              {String(i + 1).padStart(2, "0")}
            </span>
            <div>
              <div className="text-sm font-semibold text-neutral-200">{slide.title}</div>
              <ul className="mt-1 space-y-1 text-[13px] leading-relaxed text-neutral-500">
                {slide.body.map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
            </div>
          </div>
        ))}
      </div>

      <div className="mt-8 flex items-center gap-3">
        <button
          type="button"
          onClick={() => void handleExport()}
          disabled={exporting}
          className="rounded-md bg-neutral-100 px-5 py-2.5 text-sm font-medium text-neutral-950 transition-colors hover:bg-white disabled:opacity-40"
        >
          {exporting ? "Building…" : "Export to PowerPoint"}
        </button>
        {error && <span className="text-xs text-red-400">{error}</span>}
      </div>
    </main>
  );
}
