# Future: full 360° heads with DiffPortrait360 — integration plan

Status: plan (Sprint 15.6). The admin already shows a disabled
**✦ Generate Full 360 (DiffPortrait360)** button in *Poses → 360° sequence ·
AI Reality Engine* with a "Setup required" tooltip; this document is what it
takes to switch it on.

## 1. Why

The Genesis hero turns a real photo sequence. The current AI Angle Generator
(LivePortrait on free Hugging Face Spaces, `docs/AI-ANGLES.md`) can only
rotate a *visible face* ≈ ±20° per hop, so it reaches about ±60–85° from the
front. The **profiles and the back of the head** still need real photos —
today's sequence has a hole between roughly +25° and +147°.

DiffPortrait360 generates the whole turn, back of the head included, from one
front-facing portrait.

## 2. The model (facts checked 2026-11-14)

- *DiffPortrait360: Consistent Portrait Diffusion for 360 View Synthesis* —
  Yuming Gu, Phong Tran, Yujian Zheng, Hongyi Xu, Heyuan Li, Adilbek Karmanov,
  Hao Li (USC, MBZUAI, ByteDance, CUHK-Shenzhen, Pinscreen). **CVPR 2025**.
  [arXiv:2503.15667](https://arxiv.org/abs/2503.15667) ·
  [project page](https://freedomgu.github.io/DiffPortrait360) ·
  [code](https://github.com/FreedomGu/DiffPortrait360)
- **Input:** one unposed portrait (real or stylized; glasses and hats OK).
- **Output:** consistent 360° views; the paper evaluates **36 views evenly
  spaced** (10° apart) at **512 × 512**.
- **How:** frozen Stable Diffusion backbone + a ControlNet that first
  generates a **back-of-head reference**; a dual appearance module conditions
  every view on front + back; a view-consistency module keeps the sequence
  coherent.
- **Code:** inference and training released (`diffportrait360_release/`).
  **Weights:** linked from the README —
  `huggingface.co/gym890/diffportrait360` (three checkpoints: PanoHead,
  back-head, Diff360). **License:** the README says Apache-2.0 for the code;
  the weights' terms aren't stated — confirm before commercial use (§9).
- **Requirements (README):** Linux, NVIDIA + CUDA (tested CUDA 12.2 on one
  A6000), Python 3.9 (`conda env create -n diffportrait360 python=3.9`,
  `pip install -r requirements.txt`). **≥ 30 GB VRAM** for a 32-frame run,
  80 GB recommended. **~5.6 s per view** → a 36-view turn in ≈ 3.5 min.
- **Preprocessing:** a cropped, aligned input plus a `dataset.json` of camera
  parameters in PanoHead's convention (the repo links a 3DDFA_V2-based
  cropping guide).
- **No hosted demo or API** exists yet (a Gradio demo is "planned").

## 3. Hardware — what actually fits

The hard limit is **one GPU with ≥ 30 GB VRAM** (the model doesn't split
across GPUs in the released code).

| Option | GPU (VRAM) | Fits? | Notes |
|---|---|---|---|
| AWS EC2 **G5** (any size) | A10G (24 GB per GPU) | ❌ | Below the 30 GB minimum — even g5.48xlarge is 8 × 24 GB, not one big GPU |
| AWS EC2 **G6e** (g6e.xlarge and up) | L40S (48 GB) | ✅ | The cheapest AWS fit; use a Deep Learning AMI (PyTorch, CUDA 12) |
| AWS EC2 P4d / P5 | A100 40/80 GB, H100 80 GB | ✅ | 8-GPU nodes — overkill and costly for this |
| **RunPod** (recommended) | RTX A6000 48 GB / L40S 48 GB / A100 80 GB | ✅ | The authors' own GPU class (A6000); per-second billing, PyTorch templates |
| RunPod **Serverless** / Modal | 48–80 GB classes | ✅ | Scales to zero between jobs; cold start loads several GB of weights (budget ~1–2 min) |
| Hugging Face free Spaces / Colab free | ≤ 16–24 GB | ❌ | Not enough VRAM |

Prices change — check the provider's page; for one portrait it's roughly an
hour of a 48 GB GPU, i.e. a few dollars.

## 4. Stand up the GPU service (one time)

On a RunPod "PyTorch 2.x / CUDA 12" pod (A6000 or L40S, ≥ 60 GB disk) or a
G6e Deep Learning AMI:

```bash
git clone https://github.com/FreedomGu/DiffPortrait360 && cd DiffPortrait360/diffportrait360_release
conda env create -n diffportrait360 python=3.9 && conda activate diffportrait360
pip install -r requirements.txt
# weights → ./checkpoints (three paths the README's inference.sh expects)
huggingface-cli download gym890/diffportrait360 --local-dir ./checkpoints
# preprocessing: follow the repo's PanoHead / 3DDFA_V2 cropping guide for the crop + dataset.json
bash inference.sh   # smoke test on the repo's sample input first
```

Then wrap it in a small HTTP API. **ComfyUI:** no DiffPortrait360 node exists
today, and its three-stage pipeline (crop → back-head ControlNet → view
synthesis) doesn't map onto stock nodes — a thin **FastAPI** (or Gradio
`gr.Interface` with `api_name`) service is simpler and is what this plan
assumes.

### API contract (the Next.js side codes against this)

```http
POST /jobs                      Authorization: Bearer <DIFF360_API_TOKEN>
Content-Type: application/json
{
  "image_url": "https://…/hero/front.png",     // a presigned GET of the front photo
  "views": 36,                                   // evenly spaced from 0°
  "upscale": 2,                                  // 512 → 1024 with Real-ESRGAN in the worker
  "background": "black",                         // composite on pure black (the site mattes black)
  "uploads": ["https://<bucket>/hero/…?X-Amz-…", …]   // one presigned PUT per view, minted by Next.js
}
→ 202 { "id": "job_123" }

GET /jobs/job_123               Authorization: Bearer <DIFF360_API_TOKEN>
→ { "status": "queued" | "preprocessing" | "generating" | "uploading" | "done" | "error",
    "progress": 0.42, "done_views": 15, "error": null }
```

The worker downloads the front photo, runs crop → inference → upscale →
composite on black, and **PUTs each view straight to the media bucket**
through the presigned URLs. Nothing large passes through Vercel (its request
bodies cap at 4.5 MB), and the GPU box never holds bucket credentials.

## 5. The Next.js side

1. **Env** (server-only): `DIFF360_API_URL`, `DIFF360_API_TOKEN`.
2. **`app/api/ai/generate-360/route.ts`** (admin key required, like
   `generate-angles`):
   - `POST { frontUrl }` → mint 36 keys with `makeKey("hero", …)` and a
     presigned PUT for each (`getPresignedPutUrl` in
     `lib/admin/storage/bucket.ts`), plus a presigned GET for the front photo;
     call `POST /jobs`; return `{ jobId, keys }`.
   - `GET ?job=…` → proxy `GET /jobs/:id` (so the token stays server-side).
3. **Admin button** (`components/admin/AngleEnginePanel.tsx →
   DiffPortraitButton`): enabled when the route reports the env is set.
   Flow: pick the front frame (the 0° one by default) → confirm ("~4 min on a
   rented GPU") → poll every 3 s with a progress bar → on `done`, append
   `keys.map((k, i) => ({ url: publicUrlFor(k), angle: normAngle(i * 10) }))`
   to `model3d.sequenceImages`. Each new frame uses the existing glowing
   drop-in animation, then: *Analyze All Images* → *Use detected angles* so
   the front half snaps to measured yaw → Save.
4. **Merge policy:** keep the real photos for the front ±30° (sharper, true
   identity) and take DiffPortrait360's views for the rest — an "Only fill
   gaps" toggle that skips views whose angle already has a real frame within
   5°.
5. **Everything downstream already exists:** the backdrop matte, the
   hologram shader, the cross-fade, the GPU texture cache and the calibration
   work on these frames unchanged.

## 6. Quality steps

- **Front photo:** sharp, even light, the face filling most of the frame,
  neutral expression, glasses as in the other frames.
- **Upscale** 512 → 1024 (Real-ESRGAN `RealESRGAN_x2plus`) in the worker so
  the generated frames sit next to the 1254 px real ones.
- **Black backdrop:** composite onto `#000` in the worker (or matte with
  `rembg` first) — the site's matte removes black backdrops by connectivity.
- **Review** frame by frame before saving; drop any with identity drift.

## 7. Cost and time per portrait

36 views × ~5.6 s ≈ 3.5 min of inference + preprocessing, upscaling and
uploads ≈ 5–8 min end to end on one 48 GB GPU. A one-off run on a pod is the
cheapest path; serverless only pays off if new portraits are frequent.

## 8. Rollout

1. Smoke-test the repo on a pod with the sample input (half a day).
2. Run it on the real front photo by hand; judge the 36 views; upload the
   good ones with *Upload 360 Image Sequence* — this alone fills the gap.
3. Only if it's worth repeating: wrap the FastAPI service, deploy to RunPod
   Serverless, add the route and enable the button (§4–5, ~1–2 days).

## 9. Risks to check first

- **Weights license** — get the terms in writing (HF model card / authors)
  before shipping generated frames on a commercial portfolio.
- **Identity drift and hair** — the paper notes small inconsistencies on some
  portraits and trouble with unusual headgear / unseen hairstyles; dense curly
  hair and reflective wraparound glasses are exactly the hard cases.
- **Lighting match** — generated backs won't match the studio lighting of the
  real photos; the hologram mode hides more of that than cutout mode.
