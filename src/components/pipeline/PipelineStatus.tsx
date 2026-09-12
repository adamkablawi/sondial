"use client";

import type { PipelineStage } from "@/providers/types";

interface PipelineStatusProps {
  stage: PipelineStage | null;
}

const stages = [
  { key: "upload", label: "Upload" },
  { key: "image_generation", label: "Generating Image" },
  { key: "mesh_generation", label: "Generating Mesh" },
  { key: "ready", label: "Ready" },
] as const;

function getStageIndex(stage: PipelineStage | null): number {
  if (!stage) return -1;
  return stages.findIndex((s) => s.key === stage.stage);
}

function getProgress(stage: PipelineStage | null): number | undefined {
  if (!stage) return undefined;
  if ("progress" in stage) return stage.progress;
  return undefined;
}

export function PipelineStatus({ stage }: PipelineStatusProps) {
  const currentIndex = getStageIndex(stage);
  const isFailed = stage?.status === "failed";
  const progress = getProgress(stage);

  if (!stage) return null;

  return (
    <div className="w-full rounded-xl bg-neutral-900/60 border border-white/10 backdrop-blur-sm p-6 shadow-lg">
      {/* Stage indicators */}
      <div className="flex items-center justify-between">
        {stages.map((s, i) => {
          const isComplete = i < currentIndex || (i === currentIndex && stage?.status === "complete");
          const isCurrent = i === currentIndex && stage?.status !== "complete";
          const isError = isCurrent && isFailed;

          return (
            <div key={s.key} className="flex items-center flex-1 last:flex-none">
              {/* Circle */}
              <div className="flex flex-col items-center">
                <div
                  className={`flex h-10 w-10 items-center justify-center rounded-full border-2 transition-all ${
                    isError
                      ? "border-red-500 bg-red-500/10 text-red-400"
                      : isComplete
                        ? "border-green-500 bg-green-500/10 text-green-400"
                        : isCurrent
                          ? "border-blue-500 bg-blue-500/10 text-blue-400"
                          : "border-neutral-700 bg-neutral-800 text-neutral-600"
                  }`}
                >
                  {isComplete ? (
                    <svg className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                    </svg>
                  ) : isError ? (
                    <svg className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                    </svg>
                  ) : isCurrent ? (
                    <div className="h-3 w-3 rounded-full bg-blue-400 animate-pulse" />
                  ) : (
                    <span className="text-sm font-medium">{i + 1}</span>
                  )}
                </div>
                <span
                  className={`mt-2 text-xs font-medium ${
                    isError
                      ? "text-red-400"
                      : isComplete
                        ? "text-green-400"
                        : isCurrent
                          ? "text-blue-400"
                          : "text-neutral-600"
                  }`}
                >
                  {s.label}
                </span>
              </div>

              {/* Connecting line */}
              {i < stages.length - 1 && (
                <div className="flex-1 mx-3 mt-[-20px]">
                  <div className="h-0.5 w-full rounded bg-neutral-800">
                    <div
                      className={`h-full rounded transition-all duration-500 ${
                        isComplete ? "bg-green-500 w-full" : "bg-neutral-800 w-0"
                      }`}
                    />
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Progress bar for current stage */}
      {progress !== undefined && progress < 100 && (
        <div className="mt-4">
          <div className="flex justify-between text-xs text-neutral-400 mb-2">
            <span>Processing...</span>
            <span className="font-medium text-neutral-400">{progress}%</span>
          </div>
          <div className="h-2 w-full rounded-full bg-neutral-800 overflow-hidden">
            <div
              className="h-full rounded-full bg-neutral-500 transition-all duration-500 ease-out"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
      )}
    </div>
  );
}
