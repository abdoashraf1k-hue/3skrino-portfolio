# AI angles (admin → Poses → AI Reality Engine)

Fills gaps in the hero's 360° image sequence for free, with
[LivePortrait](https://github.com/KwaiVGI/LivePortrait)'s expression editor
(the head turns, your identity stays). It runs on Hugging Face Spaces — no
payment method, no API key required.

## How it works

1. **Analyze All Images** — runs `@vladmandic/human` in your browser and
   reads each frame's yaw / pitch / roll, then maps them onto 36 steps of 10°.
2. **Generate Missing Angles** — for each step the model can reach (±20° per
   pass, up to the "AI reach" setting), the admin sends the nearest real face to
   `POST /api/ai/generate-angles`, which tries:
   - **Plan A** — `fffiloni/expression-editor` on ZeroGPU (~8 s an image).
   - **Plan B** — automatically, CPU copies of the same app
     (`slfrtny/…`, `ahmad085awbx/…`, `Native72/expression-editor`), ~25 s+ each.
3. Each result is re-measured; only frames that land on an empty step are kept,
   uploaded to B2 and inserted in angle order. Save to publish.

The back of the head (beyond ~±90°) can't be generated — a face model has no
face to turn. Those steps need real photos.

The result has no transparency (the background turns black), so the floating
orbit can't pass behind AI frames the way it can behind transparent photos.

## Limits

ZeroGPU gives free accounts a few minutes of GPU a day. Anonymous calls share
the quota of the server's IP (Vercel), so set **`HF_TOKEN`** (a free read token
from https://huggingface.co/settings/tokens) to use your own account's quota.
When every Space refuses, the admin shows: *"Free AI queue is busy or quota
exceeded. Please wait a few minutes and try again, or upload the photo
manually."*

## Unlimited, still free

- **Your own Space:** on huggingface.co open `fffiloni/expression-editor` →
  ⋮ → *Duplicate this Space*, pick the free **CPU basic** hardware. Then set
  `HF_SPACE_PRIMARY=<you>/expression-editor` (and `HF_TOKEN` if it's private).
  Slower than ZeroGPU, but nobody else's queue and no daily quota.
- **Locally** (NVIDIA GPU): clone https://github.com/KwaiVGI/LivePortrait,
  follow its README, and use its Gradio app's pose sliders by hand; upload the
  results with "Upload 360 Image Sequence" or as extra frames.

## Env

| Variable | |
|---|---|
| `HF_TOKEN` | optional — your HF account's ZeroGPU quota instead of the shared IP one |
| `HF_SPACE_PRIMARY` | optional — Plan A Space(s), comma-separated |
| `HF_SPACE_FALLBACKS` | optional — Plan B Space(s), comma-separated |
