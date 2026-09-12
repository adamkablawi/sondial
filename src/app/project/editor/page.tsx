"use client";

import { useCallback } from "react";
import { useRouter } from "next/navigation";
import { ModelViewer } from "@/components/viewer/ModelViewer";
import { EditChat } from "@/components/editor/EditChat";
import { useProjectStore } from "@/stores/project-store";
import { stripDataUrlPrefix } from "@/lib/base64";

export default function EditorPage() {
  const router = useRouter();

  const modelUrl = useProjectStore((s) => s.modelUrl);
  const mtlUrl = useProjectStore((s) => s.mtlUrl);
  const modelFormat = useProjectStore((s) => s.modelFormat);
  const sourceImage = useProjectStore((s) => s.sourceImage);
  const currentDescription = useProjectStore((s) => s.currentDescription);
  const messages = useProjectStore((s) => s.messages);

  const { setModel, setSourceImage, setCurrentDescription, addEdit, addMessage, setIsProcessing } =
    useProjectStore();

  const handleSendInstruction = useCallback(
    async (instruction: string) => {
      addMessage("user", instruction);
      setIsProcessing(true);

      try {
        // Step 1: Merge current description + instruction → new prompt
        const editRes = await fetch("/api/edit", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ description: currentDescription, instruction }),
        });
        const editData = await editRes.json();
        if (!editRes.ok) throw new Error(editData.error ?? "Failed to generate new prompt");

        const newPrompt: string = editData.newPrompt;
        addMessage("assistant", `Regenerating: "${newPrompt}"...`);

        // Step 2: Generate new image from new prompt
        const imgRes = await fetch("/api/image-generate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ prompt: newPrompt }),
        });
        const imgData = await imgRes.json();
        if (!imgRes.ok) throw new Error(imgData.error ?? "Image generation failed");

        const imageDataUrl: string = imgData.imageDataUrl;
        setSourceImage(imageDataUrl);

        // Step 3: Generate mesh from new image
        const genRes = await fetch("/api/generate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ image: stripDataUrlPrefix(imageDataUrl) }),
        });
        const genData = await genRes.json();
        if (!genRes.ok) throw new Error(genData.error ?? "Mesh generation failed");

        // Poll mesh status
        let meshResult = null;
        while (!meshResult) {
          await new Promise((r) => setTimeout(r, 500));
          const statusRes = await fetch(`/api/status/${genData.jobId}`);
          const statusData = await statusRes.json();

          if (statusData.status === "failed") throw new Error(statusData.error || "Mesh generation failed");
          if (statusData.status === "complete") meshResult = statusData.result;
        }

        // Proxy external URLs
        if (meshResult.meshFileUrl && meshResult.meshFileUrl.startsWith("http")) {
          meshResult.meshFileUrl = `/api/proxy?url=${encodeURIComponent(meshResult.meshFileUrl)}`;
        }

        // Step 4: Update model and description
        setModel(meshResult.meshFileUrl, undefined, meshResult.format);
        setCurrentDescription(newPrompt);

        addEdit({
          instruction,
          newPrompt,
          imageDataUrl,
          meshUrl: meshResult.meshFileUrl,
        });

        addMessage("assistant", `Done! New model generated from: "${newPrompt}"`);
      } catch (err) {
        addMessage(
          "assistant",
          `Error: ${err instanceof Error ? err.message : "Something went wrong"}`,
        );
      } finally {
        setIsProcessing(false);
      }
    },
    [currentDescription, messages, addMessage, setIsProcessing, setModel, setSourceImage, setCurrentDescription, addEdit],
  );

  const handleExport = useCallback(async () => {
    if (!modelUrl) return;
    try {
      const res = await fetch(modelUrl);
      const blob = await res.blob();
      const ext = modelFormat ?? "obj";
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `model.${ext}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(a.href);
    } catch {
      window.open(modelUrl, "_blank");
    }
  }, [modelUrl, modelFormat]);

  const handleFileUpload = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      const ext = file.name.split(".").pop()?.toLowerCase();
      const format =
        ext === "obj" ? "obj"
        : ext === "stl" ? "stl"
        : ext === "glb" || ext === "gltf" ? "glb"
        : ext === "fbx" ? "fbx"
        : null;
      const blobUrl = URL.createObjectURL(file);
      setModel(blobUrl, undefined, format as "obj" | "glb" | "stl" | "fbx" | undefined);
    },
    [setModel],
  );

  if (!modelUrl) {
    return (
      <main className="flex min-h-screen items-center justify-center p-6">
        <div className="text-center space-y-6">
          <p className="text-neutral-400">No model loaded.</p>
          <div className="flex flex-col items-center gap-3">
            <label className="cursor-pointer rounded-lg bg-blue-600 px-6 py-2.5 text-sm font-medium text-white hover:bg-blue-500 transition-colors">
              Upload a Model
              <input
                type="file"
                accept=".obj,.glb,.gltf,.stl,.fbx"
                onChange={handleFileUpload}
                className="hidden"
              />
            </label>
            <span className="text-xs text-neutral-500">OBJ, GLB, STL, or FBX</span>
          </div>
          <div className="flex items-center gap-3">
            <div className="h-px flex-1 bg-neutral-800" />
            <span className="text-xs text-neutral-600">or</span>
            <div className="h-px flex-1 bg-neutral-800" />
          </div>
          <button
            type="button"
            onClick={() => router.push("/")}
            className="rounded-lg bg-neutral-800 px-6 py-2 text-sm font-medium text-neutral-300 hover:bg-neutral-700 transition-colors"
          >
            Generate from Image or Text
          </button>
        </div>
      </main>
    );
  }

  return (
    <main className="flex h-screen flex-col">
      <header className="flex items-center justify-between border-b border-neutral-800 px-4 py-3">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => router.push("/")}
            className="rounded-lg p-1.5 text-neutral-400 hover:bg-neutral-800 hover:text-white transition-colors"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M9.707 16.707a1 1 0 01-1.414 0l-6-6a1 1 0 010-1.414l6-6a1 1 0 011.414 1.414L5.414 9H17a1 1 0 110 2H5.414l4.293 4.293a1 1 0 010 1.414z" clipRule="evenodd" />
            </svg>
          </button>
          <h1 className="text-lg font-semibold">Itera</h1>
        </div>

        <div className="flex items-center gap-2">
          {sourceImage && (
            <div className="h-8 w-8 overflow-hidden rounded-md border border-neutral-700">
              <img src={sourceImage} alt="Source" className="h-full w-full object-cover" />
            </div>
          )}
          <button
            type="button"
            onClick={handleExport}
            className="rounded-lg bg-neutral-800 px-4 py-2 text-sm font-medium text-neutral-200 hover:bg-neutral-700 transition-colors"
          >
            Export Model
          </button>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        {/* Left: Brief panel */}
        <aside className="flex w-64 flex-col border-r border-neutral-800 bg-neutral-950 overflow-y-auto">
          <div className="p-4">
            <div className="flex items-center gap-2 mb-3">
              <svg className="h-3 w-3 text-neutral-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              <span className="text-xs font-semibold uppercase tracking-wider text-neutral-500">Brief</span>
            </div>
            {currentDescription ? (
              <p className="text-xs text-neutral-300 leading-relaxed">{currentDescription}</p>
            ) : (
              <p className="text-xs text-neutral-600 italic">No brief yet. Start from the home page with an image or description.</p>
            )}

            {sourceImage && (
              <div className="mt-4">
                <img
                  src={sourceImage}
                  alt="Current reference"
                  className="w-full rounded-lg object-cover ring-1 ring-white/10"
                />
              </div>
            )}
          </div>
        </aside>

        {/* Center: 3D viewer */}
        <section className="flex-1 min-h-0 overflow-hidden">
          <ModelViewer
            modelUrl={modelUrl}
            mtlUrl={mtlUrl}
            modelFormat={modelFormat}
            selectedPartId={null}
            onPartSelect={() => {}}
            onSceneReady={() => {}}
            onCanvasReady={() => {}}
          />
        </section>

        {/* Right: Chat */}
        <aside className="flex w-80 flex-col border-l border-neutral-800 bg-neutral-950">
          <div className="flex-1 min-h-0 overflow-hidden">
            <EditChat
              onSendInstruction={handleSendInstruction}
              disabled={!modelUrl}
            />
          </div>
        </aside>
      </div>
    </main>
  );
}
