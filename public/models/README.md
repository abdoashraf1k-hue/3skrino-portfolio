# public/models

`hero.glb` — the 3D hero character (admin → Heroes → 3D model).

- **RobotExpressive** by Tomás Laulhé ([Quaternius](https://www.patreon.com/quaternius)),
  modifications by Don McCurdy. **CC0 1.0** (public domain).
- Source: three.js examples, `examples/models/gltf/RobotExpressive/RobotExpressive.glb` (r170).
- Rigged; clips: Dance, Death, Idle, Jump, No, Punch, Running, Sitting, Standing,
  ThumbsUp, Walking, WalkJump, Wave, Yes. The hero loops `Idle` and plays `Wave` on click.

To swap the character, drop another rigged `.glb` here (or anywhere under `public/`)
and set admin → Poses → Hero 3D controls → Model. Any size works — the scene
normalises its height and centres it; clips named like "idle" / "wave" are picked up.
