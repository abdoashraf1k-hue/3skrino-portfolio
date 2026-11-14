# Future: full 360° heads with DiffPortrait360

Status: research note (Sprint 15.5). Nothing here is built yet.

## The gap this would close

The Genesis hero turns a real photo sequence of the head. Today's AI Angle
Generator (LivePortrait on free Hugging Face Spaces, see `docs/AI-ANGLES.md`)
can only rotate a *visible face* by about ±20° per hop — it can't invent the
side profile or the **back of the head**. Those still need real photos, which
is why the live sequence has a hole between roughly +25° and +147°.

DiffPortrait360 generates the whole turn — back of the head included — from a
single portrait.

## What it is

- **Paper:** *DiffPortrait360: Consistent Portrait Diffusion for 360 View
  Synthesis* — Yuming Gu, Phong Tran, Yujian Zheng, Hongyi Xu, Heyuan Li,
  Adilbek Karmanov, Hao Li (USC, MBZUAI, ByteDance, CUHK-Shenzhen, Pinscreen).
  CVPR 2025. [arXiv:2503.15667](https://arxiv.org/abs/2503.15667) ·
  [project page](https://freedomgu.github.io/DiffPortrait360) ·
  [code](https://github.com/FreedomGu/DiffPortrait360)
- **Input:** one unposed portrait — real, stylized, with glasses or hats.
- **Output:** consistent 360° views of the head, including the back. The
  paper evaluates 36 views evenly spaced around the head (10° apart), at
  512×512 training resolution.
- **How:** a frozen Stable Diffusion backbone; a ControlNet that first
  generates a *back-of-head* reference image; a dual appearance module that
  conditions every view on both the front and the generated back; and a
  view-consistency module trained on continuous view sequences.

## Can we run it? (as of Nov 2026)

| Question | Answer |
|---|---|
| Code | Released — inference and training (`diffportrait360_release/`) |
| Weights | Linked from the README: `huggingface.co/gym890/diffportrait360` (three checkpoints: PanoHead, back-head, Diff360) — not verified file by file |
| License | README says **Apache-2.0** for the code; there's no LICENSE file in the repo root, and the **weights' terms aren't stated** — confirm before relying on it commercially |
| GPU | NVIDIA + CUDA, Linux; **≥ 30 GB VRAM** for a 32-frame sequence, 80 GB recommended (tested on one A6000) |
| Speed | ~5.6 s per view → a 36-view turn in roughly 3–4 minutes |
| Hosted demo / API | None found (a Gradio demo is "planned" in the README) |
| Preprocessing | Cropped + aligned input plus a `dataset.json` of camera parameters in PanoHead's convention (3DDFA_V2-based cropping guide in the repo) |

**Bottom line:** it can't run in the browser or on free Hugging Face Spaces
(no 30 GB GPUs there). It needs a rented GPU for a few minutes per portrait.

## How it would plug into this site

The site already has everything downstream: the 360° sequence format
(`model3d.sequenceImages`: `{ url, angle }`), uploads to the media bucket,
the backdrop matte, the hologram shader and the angle analyser. Only the
generator is new.

1. **Generate offline, once per portrait** — not per visitor.
   - Rent a ≥ 48 GB GPU for an hour (RunPod / Lambda / Vast A6000 or A100;
     a few dollars), or use any free research credits.
   - Prepare the best front photo with the repo's cropping guide, run
     `inference.sh` for 36 views (10° steps) — or 72 for the 5° grid.
2. **Bring the frames in through the existing admin flow.**
   - Name them `pose-001 … pose-036` and drop them on *Upload 360 Image
     Sequence* (admin → Poses → Genesis). Angles are spread evenly, which
     matches DiffPortrait360's evenly spaced output.
   - Click *Analyze All Images*, then *Use detected angles*, so the front
     half snaps to measured yaw.
   - Optionally keep the real photos for the front ±30° (sharper, true
     identity) and use DiffPortrait360 only for the profiles and back.
3. **Upscale.** 512 px output is soft next to the 1254 px real frames; run an
   upscaler (e.g. Real-ESRGAN, or Higgsfield's upscale) before uploading.
   The AI engine's `contrast(1.1) brightness(1.05)` finish then applies on top.
4. **Optional later step — a hosted pipeline.** A small worker
   (`app/api/ai/generate-360`) that sends one photo to a serverless GPU
   endpoint (Modal / Replicate custom model / RunPod Serverless) and
   streams frames back into the bucket. Worth it only if new portraits are
   frequent — for one hero, the offline run is cheaper and simpler.

## Risks to check first

- **Weights license** — get it in writing (HF model card / authors) before
  shipping generated frames on a commercial portfolio.
- **Identity drift and hair** — the paper itself notes small inconsistencies
  on some portraits and trouble with unusual headgear / unseen hairstyles;
  dense curly hair and the reflective wraparound glasses here are exactly the
  hard cases. Generate, then judge frame by frame.
- **Style match** — generated backs will be lit differently from the real
  studio photos; the hologram shader hides some of that, the cutout mode
  less so.
