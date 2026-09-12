"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ImageUploader } from "@/components/upload/ImageUploader";
import { PipelineStatus } from "@/components/pipeline/PipelineStatus";
import { useProjectStore } from "@/stores/project-store";
import { stripDataUrlPrefix } from "@/lib/base64";
import type { PipelineStage } from "@/providers/types";

export default function HomePage() {
  const router = useRouter();
  const [image, setImage] = useState<string | null>(null);
  const [prompt, setPrompt] = useState("");
  const [stage, setStage] = useState<PipelineStage | null>(null);
  const [error, setError] = useState<string | null>(null);

  const { setSourceImage, setModel, setPipelineStage, setCurrentDescription } = useProjectStore();

  const handleGenerate = async () => {
    const trimmedPrompt = prompt.trim();
    if (!image && !trimmedPrompt) return;
    setError(null);

    let activeImage = image;

    try {
      // Stage 1: Upload
      setStage({ stage: "upload", status: "started" });
      if (activeImage) setSourceImage(activeImage);
      setStage({ stage: "upload", status: "complete" });

      // Stage 2: Generate brief from image and/or text
      // Always runs — analyzes the image with vision or formalizes the text
      {
        const briefBody: Record<string, string> = {};
        if (activeImage) briefBody.image = stripDataUrlPrefix(activeImage);
        if (trimmedPrompt) briefBody.prompt = trimmedPrompt;
        const briefRes = await fetch("/api/brief", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(briefBody),
        });
        if (briefRes.ok) {
          const briefData = await briefRes.json();
          setCurrentDescription(briefData.brief ?? trimmedPrompt ?? null);
        } else {
          setCurrentDescription(trimmedPrompt || null);
        }
      }

      // Stage 3: Text → Image (only when no image provided)
      if (!activeImage && trimmedPrompt) {
        setStage({ stage: "image_generation", status: "started" });

        const imgRes = await fetch("/api/image-generate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ prompt: trimmedPrompt }),
        });
        const imgData = await imgRes.json();
        if (!imgRes.ok) throw new Error(imgData.error);

        activeImage = imgData.imageDataUrl;
        setImage(activeImage);
        setSourceImage(activeImage!);
        setStage({ stage: "image_generation", status: "complete" });
      }

      // Stage 3: Image → Mesh
      setStage({ stage: "mesh_generation", status: "started" });
      const genBody: Record<string, string> = {};
      if (activeImage) genBody.image = stripDataUrlPrefix(activeImage);

      const genRes = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(genBody),
      });
      const genData = await genRes.json();
      if (!genRes.ok) throw new Error(genData.error);

      // Poll mesh generation
      let meshResult = null;
      while (!meshResult) {
        await new Promise((r) => setTimeout(r, 500));
        const statusRes = await fetch(`/api/status/${genData.jobId}`);
        const statusData = await statusRes.json();

        if (statusData.status === "failed") throw new Error(statusData.error || "Mesh generation failed");
        if (statusData.progress) {
          setStage({ stage: "mesh_generation", status: "processing", progress: statusData.progress });
        }
        if (statusData.status === "complete") meshResult = statusData.result;
      }

      // Proxy external model URLs through our backend to avoid CORS issues
      if (meshResult.meshFileUrl && meshResult.meshFileUrl.startsWith("http")) {
        meshResult.meshFileUrl = `/api/proxy?url=${encodeURIComponent(meshResult.meshFileUrl)}`;
      }

      setStage({ stage: "mesh_generation", status: "complete" });
      setModel(meshResult.meshFileUrl, undefined, meshResult.format);
      setPipelineStage({ stage: "ready", status: "complete" });
      setStage({ stage: "ready", status: "complete" });

      setTimeout(() => router.push("/project/editor"), 600);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Something went wrong";
      setError(message);
      if (stage) {
        setStage({ ...stage, status: "failed" } as PipelineStage);
      }
    }
  };

  const isProcessing = stage !== null && !(stage.stage === "ready") && stage.status !== "complete" && stage.status !== "failed";

  const steps = [
    {
      step: "1",
      title: "Upload",
      desc: "Drop a photo or describe it",
      icon: (
        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14" />
          <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
        </svg>
      ),
    },
    {
      step: "2",
      title: "Generate",
      desc: "AI creates a 3D model",
      icon: (
        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 00-2.456 2.456z" />
        </svg>
      ),
    },
    {
      step: "3",
      title: "Iterate",
      desc: "Edit with natural language",
      icon: (
        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 21L3 16.5m0 0L7.5 12M3 16.5h13.5m0-13.5L21 7.5m0 0L16.5 12M21 7.5H7.5" />
        </svg>
      ),
    },
  ];

  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-6 relative overflow-hidden">
      {/* Subtle grid / mesh hint */}
      <div className="pointer-events-none absolute inset-0 opacity-[0.03]" style={{ backgroundImage: "linear-gradient(rgba(255,255,255,.08) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.08) 1px, transparent 1px)", backgroundSize: "48px 48px" }} />

      <div className="w-full max-w-2xl space-y-8 relative z-10">
        {/* Header */}
        <div className="text-center">
          <h1 className="text-6xl font-bold tracking-tight text-white animate-fade-in-up opacity-0 [animation-fill-mode:forwards]" style={{ animationDelay: "0ms" }}>
            Itera
          </h1>
          <p className="mt-3 text-lg text-neutral-300 animate-fade-in-up opacity-0 [animation-fill-mode:forwards]" style={{ animationDelay: "120ms" }}>
            Upload a photo, describe it, or both.
          </p>
        </div>

        {/* Upload */}
        <div className="animate-fade-in-up opacity-0 [animation-fill-mode:forwards]" style={{ animationDelay: "200ms" }}>
          <ImageUploader
            value={image}
            onImageSelect={setImage}
            onClear={() => setImage(null)}
            disabled={isProcessing}
          />
        </div>

        {/* Text prompt */}
        <div className="animate-fade-in-up opacity-0 [animation-fill-mode:forwards]" style={{ animationDelay: "300ms" }}>
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder={image ? "Add a description to guide the model (optional)" : "Or describe the 3D model you want..."}
            rows={2}
            disabled={isProcessing}
            className="w-full resize-none rounded-xl border border-neutral-700 bg-neutral-900/40 px-4 py-3 text-sm text-neutral-200 placeholder-neutral-500 outline-none transition-colors focus:border-neutral-500 disabled:opacity-50"
          />
        </div>

        {/* Pipeline status */}
        {stage && <PipelineStatus stage={stage} />}

        {/* Error */}
        {error && (
          <div className="rounded-xl border border-red-500/30 bg-red-500/5 p-4 text-sm text-red-400">
            {error}
          </div>
        )}

        {/* Generate button */}
        <div className="animate-fade-in-up opacity-0 [animation-fill-mode:forwards]" style={{ animationDelay: "340ms" }}>
          <button
            onClick={handleGenerate}
            disabled={(!image && !prompt.trim()) || isProcessing}
            className={`
              w-full rounded-2xl py-4 text-base font-semibold transition-all duration-300
              bg-black text-white
              ${(image || prompt.trim()) && !isProcessing
                ? "hover:shadow-[0_0_24px_rgba(255,255,255,0.08)] hover:scale-[1.02] active:scale-[0.99] btn-shimmer"
                : "opacity-60 cursor-not-allowed"
              }
            `}
          >
            {isProcessing ? "Processing..." : "Generate 3D Model"}
          </button>
        </div>

        {/* How it works */}
        <div className="grid grid-cols-3 gap-4 pt-4 animate-fade-in-up opacity-0 [animation-fill-mode:forwards]" style={{ animationDelay: "400ms" }}>
          {steps.map((item) => (
            <div key={item.step} className="text-center">
              <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-neutral-800/80 text-neutral-400 ring-1 ring-white/10">
                {item.icon}
              </div>
              <div className="text-sm font-medium text-neutral-300">{item.title}</div>
              <div className="mt-0.5 text-xs text-neutral-500">{item.desc}</div>
            </div>
          ))}
        </div>

      </div>
    </main>
  );
}
