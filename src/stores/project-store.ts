import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { PipelineStage } from "@/providers/types";

export interface EditEntry {
  id: string;
  instruction: string;
  newPrompt: string;
  imageDataUrl: string;
  meshUrl: string;
  timestamp: number;
}

interface ProjectState {
  // Pipeline
  pipelineStage: PipelineStage | null;
  setPipelineStage: (stage: PipelineStage | null) => void;

  // Source image (the image used to generate the current mesh)
  sourceImage: string | null;
  setSourceImage: (image: string | null) => void;

  // Current text description of the model (null if started from image with no text)
  currentDescription: string | null;
  setCurrentDescription: (desc: string | null) => void;

  // Model
  modelUrl: string | null;
  mtlUrl: string | null;
  modelFormat: "obj" | "glb" | "stl" | "fbx" | null;
  setModel: (url: string, mtlUrl?: string, format?: "obj" | "glb" | "stl" | "fbx") => void;

  // Edit history
  editHistory: EditEntry[];
  addEdit: (entry: Omit<EditEntry, "id" | "timestamp">) => void;

  // Chat messages
  messages: Array<{ role: "user" | "assistant"; content: string }>;
  addMessage: (role: "user" | "assistant", content: string) => void;

  // Status
  isProcessing: boolean;
  setIsProcessing: (v: boolean) => void;

  // Reset
  reset: () => void;
}

const initialState = {
  pipelineStage: null as PipelineStage | null,
  sourceImage: null as string | null,
  currentDescription: null as string | null,
  modelUrl: null as string | null,
  mtlUrl: null as string | null,
  modelFormat: null as "obj" | "glb" | "stl" | "fbx" | null,
  editHistory: [] as EditEntry[],
  messages: [] as Array<{ role: "user" | "assistant"; content: string }>,
  isProcessing: false,
};

export const useProjectStore = create<ProjectState>()(
  persist(
    (set) => ({
      ...initialState,

      setPipelineStage: (stage) => set({ pipelineStage: stage }),

      setSourceImage: (image) => set({ sourceImage: image }),

      setCurrentDescription: (desc) => set({ currentDescription: desc }),

      setModel: (url, mtlUrl, format) =>
        set({ modelUrl: url, mtlUrl: mtlUrl ?? null, modelFormat: format ?? null }),

      addEdit: (entry) => {
        const newEntry: EditEntry = {
          ...entry,
          id: `edit-${Date.now()}`,
          timestamp: Date.now(),
        };
        set((s) => ({ editHistory: [...s.editHistory, newEntry] }));
      },

      addMessage: (role, content) =>
        set((s) => ({ messages: [...s.messages, { role, content }] })),

      setIsProcessing: (v) => set({ isProcessing: v }),

      reset: () => set(initialState),
    }),
    {
      name: "itera-project",
      partialize: (state) => ({
        pipelineStage: state.pipelineStage,
        sourceImage: state.sourceImage,
        currentDescription: state.currentDescription,
        modelUrl: state.modelUrl,
        mtlUrl: state.mtlUrl,
        modelFormat: state.modelFormat,
        editHistory: state.editHistory,
        messages: state.messages,
      }),
    },
  ),
);
