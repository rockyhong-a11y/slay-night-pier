# Ring Night verification

These records accompany the 2026-10-13 transition to one-on-one wrestling. The source Blender scene is `../sd-ring-motion.blend`; its exported runtime clips are `../../public/assets/motion/ring.json`.

- `reopen-integrity.json`: actual Blender 5.2.2 LTS scene reopen, sampled poses, impact anchors, packed textures and isotropic scale checks; includes the exact scene and sprite hashes.
- `reaction-mapping-verification.json`: all sixteen directional hero-versus-hero grapples resolve existing whole-body opponent art.
- `ring-motion-board.png`: rendered motion/contact review board from the packed Blender scene.
- `ui-report.json`: 39 checks across portrait, landscape and desktop layouts, including touch long presses and native controls. Mobile testing uses Chromium emulation; physical iOS Safari callouts were not tested.
- `gameplay-report.json`: complete matches driven through normal movement/action input with active AI and real health. No injected match outcome, damage, position or finisher meter.

Reproduce the current automated checks with `npm test`, `npm run build`, `npm run qa:ui`, `npm run qa:match` and `npm run qa:visual`. Browser QA needs a running dev/preview server; set `QA_URL` for any port other than5173. The visual fixtures intentionally position actors and adjust health to inspect exact animation states and are not evidence of fair match outcomes.

The hero banks have no dedicated face-down prone picture. DDT/bulldog victims use the nearest existing low side-fall drawing. The original combat and walking banks are preserved unchanged.
