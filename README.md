# Itera

Generate and iterate on 3D models from images or text — in the browser.

Upload a photo, type a description, or do both. Itera converts it into a 3D mesh and gives you a natural language editor to keep refining it.

---

## How it works

1. **Upload or describe** — drop an image, type a prompt, or both
2. **Generate** — the pipeline runs: brief analysis → image (if needed) → 3D mesh
3. **Iterate** — open the editor and describe changes in plain language; the model regenerates

---

## Setup

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

### Environment variables

Create `.env.local` at the project root:

```env
# Which providers to use
MESH_PROVIDER=meshy         # meshy | huggingface | mock
IMAGE_PROVIDER=huggingface  # huggingface | mock

# Meshy AI (mesh generation)
MESHY_API_KEY=your_key_here

# HuggingFace (image generation)
HF_API_TOKEN=your_token_here
HF_IMAGE_MODEL=stabilityai/stable-diffusion-xl-base-1.0
HF_ENDPOINT=your_inference_endpoint  # for HF mesh generation

# OpenAI (brief analysis + edit refinement)
OPENAI_API_KEY=your_key_here
```

Everything defaults to `mock` providers, so you can run locally with no API keys.

---

## Providers

Itera has a swappable provider system for image and mesh generation, configured via env vars.

### Mesh generation (`MESH_PROVIDER`)

| Value | Description |
|-------|-------------|
| `meshy` | [Meshy AI](https://meshy.ai) — image-to-3D and text-to-3D |
| `huggingface` | HuggingFace Inference Endpoint |
| `mock` | Placeholder, no API key needed (default) |

### Image generation (`IMAGE_PROVIDER`)

| Value | Description |
|-------|-------------|
| `huggingface` | HuggingFace Serverless Inference (Stable Diffusion) |
| `mock` | Placeholder, no API key needed (default) |

---

## Project structure

```
src/
├── app/
│   ├── page.tsx                # Home — upload / prompt / generate
│   ├── project/editor/         # 3D editor with chat panel
│   └── api/
│       ├── brief/              # Analyze image + prompt → structured brief
│       ├── image-generate/     # Text → image
│       ├── generate/           # Image → mesh (starts async job)
│       ├── status/[jobId]/     # Poll mesh job status
│       ├── edit/               # Description + instruction → new prompt
│       ├── export/             # Model export
│       └── proxy/              # CORS proxy for external model URLs
├── components/
│   ├── upload/                 # Image uploader
│   ├── viewer/                 # 3D viewer (React Three Fiber)
│   ├── editor/                 # Chat panel
│   └── pipeline/               # Generation progress indicator
├── providers/
│   ├── types.ts                # Shared interfaces
│   ├── image-generation/       # mock, HuggingFace
│   └── mesh-generation/        # mock, HuggingFace, Meshy
├── stores/
│   └── project-store.ts        # Zustand state (model, description, history)
└── lib/
    ├── base64.ts               # Image encoding helpers
    └── zip-utils.ts            # Extract OBJ from zip archives
```

---

## Tech stack

- **Next.js 16** (Turbopack, App Router)
- **React Three Fiber + Drei** — 3D rendering
- **Zustand** — state management
- **Tailwind CSS v4** — styling
- **TypeScript**

---

## Export formats

OBJ, GLB, STL, FBX — download directly from the editor toolbar.
