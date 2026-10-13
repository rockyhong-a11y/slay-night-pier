# SD characters and combat animation sources

Atlas and Nova are the two active original SD identities in the current one-on-one wrestling game. Atlas specializes in power techniques; Nova specializes in suplexes and technical grappling. Viper, Lynx, Raven, Seraph, Tempest, Ember, Valkyrie and Onyx are shown as dimmed, unavailable future roster entries. Their earlier belt-scrolling enemy assets are retained as authoring history. Hair, faces, SD proportions and character palettes are checked against Rocky Hong’s supplied games.

## Original art and licenses

- [slay](https://github.com/rockyhong-a11y/slay), commit `7a1bfbe261862f7c6a44981faf6ae9fb63eddb8c`: original SD fighters under that source repository’s `public/assets/sd2d` directory.
- [slay-beach-volley](https://github.com/rockyhong-a11y/slay-beach-volley), commit `5ffed009aa658bf8ac86e25157b5637c0a42f346`: optimized fighter WebP sheets, portraits and six-frame directional whole-body running artwork.
- Both carry the MIT License, copyright 2026 Rocky Hong. The notice is retained in `public/assets/SOURCE_LICENSE.txt`.
- Outfit and Do Hyeon are bundled with their SIL Open Font License notices in `public/assets/fonts`.

`tools/prepare-sprites.py /path/to/slay-beach-volley` takes an explicit local clone path. Base rectangles reference the actual 888 × 444 optimized sheets. Run atlases have 256 × 256 cells and a 216-pixel body-height reference. Their source images remain original whole-body artwork.

## Reviewed Higgsfield combat poses

The current combat banks contain **176 reviewed Higgsfield drawings**, plus the original whole-body hurt drawing for each hero. The two hero banks each have 33 distinct drawings and 11 explicit semantic aliases. Each of the eight enemy banks has 14 distinct drawings and 22 aliases. Hero banks expose 44 semantic keys each; enemy banks expose 36 each, backed by 178 distinct runtime drawings total. Aliases reuse existing pixels; they do not consume extra atlas cells.

The first six hero sheets cover attacks, grappling and counters; the first eight enemy sheets cover windup, extended jab, extended cross, kick, hurt and rear-facing stun. Twelve additional technique sheets add 30 new hero drawings and 64 character-specific opponent postures for the iconic technique update described below. Arms and legs visibly extend in the actual raster art. Charge and launcher reuse the reviewed attack poses while Blender supplies their weight shift and paired trajectory. The initial combat cutout rig remains an editable authoring experiment only; its narrow side silhouettes and segment seams are excluded from combat atlases. Complete-body walking has its own authoring pipeline described below.

All sheets were generated through the Higgsfield plugin with `nano_banana_2_1`. The approved original Nova portrait was the identity reference. Nova’s first grab/counter results had long trousers inconsistent with her attack sheet, so the approved attack result became the costume reference for two provider edits. Only the corrected black/red shorts versions listed below are shipped. The earlier rejected full-sprite upload was not retried or bypassed.

| Reviewed sheet | Key background | Generation job and source image |
| --- | --- | --- |
| Atlas attack | green | [8aebe56d-013d-425b-9ec8-35968a79bc3a](https://d8j0ntlcm91z4.cloudfront.net/user_3Jx4IFW1oMtuHLRGsebq6Lj642q/hf_20261013_023625_8aebe56d-013d-425b-9ec8-35968a79bc3a.png) |
| Atlas grab | green | [8c1673b3-5020-46e1-bc16-5cda63de395e](https://d8j0ntlcm91z4.cloudfront.net/user_3Jx4IFW1oMtuHLRGsebq6Lj642q/hf_20261013_024001_8c1673b3-5020-46e1-bc16-5cda63de395e.png) |
| Atlas counter | green | [68fbb266-7d46-4670-91a5-24b1b3a59623](https://d8j0ntlcm91z4.cloudfront.net/user_3Jx4IFW1oMtuHLRGsebq6Lj642q/hf_20261013_024057_68fbb266-7d46-4670-91a5-24b1b3a59623.png) |
| Nova attack | green | [2afa5b66-33d9-477a-869e-03a967fee036](https://d8j0ntlcm91z4.cloudfront.net/user_3Jx4IFW1oMtuHLRGsebq6Lj642q/hf_20261013_023508_2afa5b66-33d9-477a-869e-03a967fee036.png) |
| Nova grab | green | [b91cbcf2-aa4a-4334-81d0-023e13d323cc](https://d8j0ntlcm91z4.cloudfront.net/user_3Jx4IFW1oMtuHLRGsebq6Lj642q/hf_20261013_025726_b91cbcf2-aa4a-4334-81d0-023e13d323cc.png) |
| Nova counter | green | [e3bb4808-e001-4ede-835d-a3f2fd9a5991](https://d8j0ntlcm91z4.cloudfront.net/user_3Jx4IFW1oMtuHLRGsebq6Lj642q/hf_20261013_025858_e3bb4808-e001-4ede-835d-a3f2fd9a5991.png) |
| Viper attack | magenta | [20844757-c81b-4ba5-ba56-5f2c6113eb61](https://d8j0ntlcm91z4.cloudfront.net/user_3Jx4IFW1oMtuHLRGsebq6Lj642q/hf_20261013_024631_20844757-c81b-4ba5-ba56-5f2c6113eb61.png) |
| Lynx attack | green | [d097cf7e-6a39-49e0-ad04-cb883553fec5](https://d8j0ntlcm91z4.cloudfront.net/user_3Jx4IFW1oMtuHLRGsebq6Lj642q/hf_20261013_024754_d097cf7e-6a39-49e0-ad04-cb883553fec5.png) |
| Raven attack | green | [dd1eb224-0e42-42a9-9f47-a7f5df260b9e](https://d8j0ntlcm91z4.cloudfront.net/user_3Jx4IFW1oMtuHLRGsebq6Lj642q/hf_20261013_024855_dd1eb224-0e42-42a9-9f47-a7f5df260b9e.png) |
| Seraph attack | green | [60c3208b-8e74-4258-8556-3deb47ebc5e5](https://d8j0ntlcm91z4.cloudfront.net/user_3Jx4IFW1oMtuHLRGsebq6Lj642q/hf_20261013_025037_60c3208b-8e74-4258-8556-3deb47ebc5e5.png) |
| Tempest attack | magenta | [13e2792e-30aa-4f3f-be69-6907687227ad](https://d8j0ntlcm91z4.cloudfront.net/user_3Jx4IFW1oMtuHLRGsebq6Lj642q/hf_20261013_025136_13e2792e-30aa-4f3f-be69-6907687227ad.png) |
| Ember attack | green | [4043cc18-4cf9-4ca6-a1a2-8ee61392fae5](https://d8j0ntlcm91z4.cloudfront.net/user_3Jx4IFW1oMtuHLRGsebq6Lj642q/hf_20261013_025331_4043cc18-4cf9-4ca6-a1a2-8ee61392fae5.png) |
| Valkyrie attack | green | [58641fa1-55aa-4bd1-9878-204b09a305df](https://d8j0ntlcm91z4.cloudfront.net/user_3Jx4IFW1oMtuHLRGsebq6Lj642q/hf_20261013_025420_58641fa1-55aa-4bd1-9878-204b09a305df.png) |
| Onyx attack | green | [6178f7cd-01b4-4612-b594-3fb369665db5](https://d8j0ntlcm91z4.cloudfront.net/user_3Jx4IFW1oMtuHLRGsebq6Lj642q/hf_20261013_025637_6178f7cd-01b4-4612-b594-3fb369665db5.png) |

The complete machine-readable source records, crop-grid dimensions and pose ordering are in `tools/combat-sheets.json`. Raven’s returned sheet contains eight cells on a 4 × 2 grid; the two extra strike/reaction drawings are deliberately omitted. Atlas’s parry image includes an extra opponent arm, so parry uses the same sheet’s complete open-hand hip-turn pose. Nova’s parry is also aliased to the complete hip-turn pose to preserve a clean silhouette during the guard transition.

`tools/import-combat-poses.py` uses continuous green/magenta alpha keying, edge-color unmixing and spill suppression. It separates each connected main character silhouette across the entire source sheet before cropping: this removes neighboring feet/hands and faint cell-boundary fragments even when a generated pose crosses its nominal grid border. A shared scale from the first standing pose preserves relative pose size; each extracted silhouette is centered and aligned to the floor individually. Viper and Tempest use magenta keying to preserve their green clothing.

Runtime WebP banks are lossless RGBA, derived from **384 × 384 authoring cells** with a **270-pixel body-height reference**, floor pivot `[165,346.5]` and body-center pivot `[165,211.5]` before packing. Runtime atlases tightly pack cropped rectangles instead of transparent full cells; each rectangle has an adjusted floor/body-center pivot, preserving the same physical scale. The physical 384-cell authoring basis is retained; sprite rectangles are never independently stretched. Final combat banks occupy **49.42 MiB decoded / 9.79 MiB compressed**, with maximum image dimension **1658 pixels**; measured results are in `tools/combat-asset-inspection.json`. The packed authoring scenes are separate from runtime downloads. Each combat image has `imageVersion`, the first 16 characters of its file-byte SHA-256; the loader uses this version in the URL so cached pixels cannot be combined with new atlas rectangles. Final imports/rebuilds refresh it automatically; `python3 tools/rebuild-combat-banks.py --version-only` refreshes metadata without changing image bytes.

To reproduce, download each URL in `combat-sheets.json` using its listed `file` name into one directory, then run:

```sh
python3 tools/rebuild-combat-banks.py --source-dir /path/to/downloaded/sheets
```

The importer can also replace one sheet explicitly:

```sh
python3 tools/import-combat-poses.py atlas --sheet /path/to/atlas-attack.png \
  --keys windup,jab,cross,lowKick,roundhouse,strikeRecovery \
  --cols 3 --rows 2 --key green --job JOB_ID --source-url SOURCE_URL
```

## Iconic professional-wrestling techniques

The preserved sixteen input IDs now select these techniques:

| Hero | Front ↑ / ↓ / ← / → | Rear ↑ / ↓ / ← / → |
| --- | --- | --- |
| Atlas | Powerbomb / DDT / Backbreaker / Spinebuster | German suplex / Reverse DDT / Russian leg sweep / Bulldog |
| Nova | Vertical suplex / Snapmare / Arm drag / Hurricanrana | Dragon suplex / Back suplex / Neckbreaker / Rolling cradle |

Four newly generated hero sheets provide technique-specific holds and follow-throughs. Eight new opponent sheets retain each enemy’s identity while adding seated, kneeling, forward-folded, back-bent, supine, prone, tucked and over-shoulder postures. Each new 3 × 3 sheet begins with an upright calibration drawing, excluded from runtime, followed by eight action drawings. One uniform scale from that reference applies to the entire sheet. No pose is enlarged to fill its cell, and runtime `scaleX`/`scaleY` remain 1 throughout. Blender uses signed unit X mirroring solely for facing, preserving shape and limb lengths. Atlas’s generated reverse-DDT landing and Nova’s back-suplex landing stayed upright, so they explicitly reuse the same hero’s reviewed reclining follow-through instead. The newly drawn horizontal opponent is held across the raised knee for backbreaker; a standing bridge is not substituted there.

The different landing/hold families have separate two-person trajectories. DDT and bulldog finish prone, snapmare finishes seated, arm drag and head-scissors use folded/tucked rotation, backbreaker strikes the knee above ground, leg sweep drops both performers together, and cradle rolls two tucked bodies through a complete coupled 360° turn into a low pin before release. Cradle, bulldog and hurricanrana retain their forward ending positions; the game commits the final position so recovery does not rewind to the move’s starting point. Grounding during the roll uses the actual visible raster bounds rather than the empty authoring cell. `tools/wrestling_techniques.py` authors these trajectories and grip controls. `tools/wrestling-sheets.json` records the twelve new Higgsfield job IDs, source URLs, grids and semantic ordering. Provider model remains `nano_banana_2_1`, resolution 1K; twelve successfully submitted sheets cost 18 credits total. An explicitly rejected 429 submission created no job and was retried after the active job completed.

To rebuild the newly reviewed poses, download the URLs using the listed file names and run:

```sh
python3 tools/rebuild-combat-banks.py --catalog tools/wrestling-sheets.json \
  --source-dir /path/to/new-technique-sheets
```

Technique-name and visual references include WWE’s [50 coolest maneuvers](https://www.wwe.com/classics/classic-lists/the-50-coolest-maneuvers-of-all-time). No WWE footage, logos, names or artwork are used as game assets.

## Twenty-eight sampled Blender combat clips

Actual Blender 5.2.2 LTS authors and samples `public/assets/motion/combat.json`. Its editable packed source is `tools/sd-combat.blend`. The scene contains reviewed textured 2D fighter planes, independent hero/opponent motion objects, pose-visibility keys, and contact, lift-apex, impact, regrip and release timeline markers. Source textures are packed into the `.blend`.

- Six strike clips: jab, cross, low kick, roundhouse, launcher and charge strike. Each has 11 authored keys, anticipation, extended-limb contact, follow-through and return to idle. The extended pose begins at least 85 ms before contact so the runtime pose crossfade completes before damage.
- Sixteen directional grapples: front/rear × up/down/left/right for each hero. Every move now has 13 authored keys and an individually authored, recognizable wrestling technique, including headlocks, knee backbreakers, shoulder/wrist throws, head scissors, leg sweeps and rolling pins. The input IDs are retained.
- Two chain throws have 17 authored keys, a real second lift and two impact events at 38% and 78%; they are not a replay of one throw.
- Four counters cover paired reversal slams and arm-lock takedowns. Each has 12 authored keys, a guard/parry entry, waist or wrist-grip interval, impact and recovery.

All clips are sampled from evaluated Blender object transforms and actual visible texture poses at 60 Hz. Absolute scale remains 1 throughout; the engine blends into and out of each motion. Facing is exported separately as `relativeFacing` (+1 or −1). `combat-inspection.json` records clip frame spans, sample counts, contact/impact frames, end transforms, maximum opponent lift and minimum scale for structured inspection. The `grip` field is evaluated from a Blender control parented to the hero and keyed to the technique’s headlock, wrist, shoulder, waist, knee or scissors hold. It is not a midpoint between actors. `impactAnchor` is likewise sampled from an actual authored Blender control: ground contacts follow the landing; body contacts follow the raised knee or cradle hold.

```js
{
  version: 2, sampleRate: 60, unit: 'bodyHeight', pivot: 'bodyCenter',
  clips: {
    atlas_front_left: {
      type: 'grapple', family:'backbreaker', heroId:'atlas', duration:1.45,
      contactAt:0.12, impactAt:0.47, recoveryAt:0.82,
      impactSurface:'body', impactHeight:0.27,
      authoredKeyCount:13, poseBlend:0.085,
      frames: [{
        t: 0, // normalized 0–1
        hero:{x:0,z:0,angle:0,scaleX:1,scaleY:1,pose:'clinch',relativeFacing:1},
        victim:{x:0.52,z:0,angle:0,scaleX:1,scaleY:1,pose:'idle',relativeFacing:-1},
        grip:{active:false,type:'raisedKnee',x:0,z:0},
        impactAnchor:{surface:'body',x:0.23,z:-0.23}
      }]
    }
  }
}
```

`x` is along the hero’s facing direction and `z` is upward, both in body-height units. `angle` is clockwise Canvas radians. The pair mirrors together with facing. Transform pivots are at the body center. `t`, `contactAt`, `impactAt`, `recoveryAt`, event times and grip periods are normalized; elapsed seconds equal phase × duration. The manifest resolves each string pose to a rectangle and its center pivot. Named aliases are explicit, so the renderer does not guess numerical artwork indices.

`tools/export-pose-hulls.py` analyzes the final WebP alpha without changing pixels or metadata. It exports exact convex support vertices of alpha > 160 pixel squares for Nova’s `cradleTuck`/`cradleRoll` and Viper’s `tuck`, normalized around each actual frame center pivot and body-height reference. `tools/pose-contact-hulls.json` includes source SHA-256 hashes. Collinear edge sampling preserves exact support geometry; transparent rectangle corners do not control rolling contact. Regenerate after any relevant sprite change with `python3 tools/export-pose-hulls.py`, then rebuild the Blender motion.

Rebuild after the reviewed banks are ready:

```sh
/Applications/Blender.app/Contents/MacOS/Blender --background --factory-startup \
  --python tools/build-combat-motion.py
```

`tools/build-combat-poses.py` and `tools/sd-combat-poses.blend` retain the original articulated cutout authoring experiment. That script takes `--source` and `--output` for its original cutout-kit inputs; its raster output is not imported into runtime banks.

## Complete-body walking — Blender and Higgsfield

Each character has twelve complete walking drawings. Atlas uses actual frames from the [Higgsfield Genjutsu walking video](https://d8j0ntlcm91z4.cloudfront.net/user_3Jx4IFW1oMtuHLRGsebq6Lj642q/hf_20261013_081957_d52d9b49-c6df-437e-8c6b-9a859b85a2d8.mp4), job `d52d9b49-c6df-437e-8c6b-9a859b85a2d8`. The driving reference is an original opaque 3D SD mannequin made in Blender, with alternating support and passing legs. The character reference is the exact current Atlas combat-idle drawing. Both uploads and the single free motion-transfer generation were approved by the user.

Nova and Viper use built-in Imagegen identity edits of their current combat-idle drawings, with the completed Atlas cycle as a pose guide. The other seven use four approved complete-body contact/passing poses followed by twelve complete walking drawings. An actual Blender mannequin guide identifies the near and far legs with different colors, making the opposing foot contacts and swings inspectable before the final colors are restored. The temporary colors belong only to the authoring sources. Costume, face, head/chin and chin/waist proportions are compared with each character's own idle and striking drawings. Anatomy changes are revised as artwork. One character reference scales the entire sequence uniformly.

`tools/walk-source/marked/` retains the four-key seeds, twelve-frame marked masters and two provider revisions. Only the approved complete source-cell9 body is selected from the Ember and Lynx revisions with `tools/replace-walk-source-cell.py`, using an actual Blender compositor at unchanged canvas dimensions. Its padded selection includes the whole hair/body/boots and excludes every neighboring body. `tools/restore-walk-marker-colors.py` then restores diagnostic skin or pant colors through actual Blender compositor nodes, sampled from the canonical idle drawing. It passes source alpha unchanged and preserves every visible RGB byte outside the reviewed marker mask. Pixel verification proves those invariants; independent image review establishes that the mask selected the intended material. No part transforms, silhouette edits, pose fitting or image resampling occur in either step. The selected restored sheets, hashes, recipes and per-character calibration are recorded in `tools/walk-source/`.

`tools/extract-wholebody-walk-sheets.py` separates the twelve connected body silhouettes. It preserves original RGBA pixels and excludes neighboring poses even when a boot or hair tip crosses a nominal sheet row. Reviewed `frameOrder` permutations rearrange complete source poses into contact→passing→opposite contact→passing order; `sourceCellIndex` remains attached to each exported frame. Every character uses one calibrated source reference for all twelve frames. Head, chin, neck and waist comparisons determine that reference; long hair and full-pose bounding boxes cannot independently set body scale. Tempest's forehead/chin and chin/waist agree with the reference, while the new ponytail crown is approximately7% taller; it is not separately compressed.

`tools/build-higgs-wholebody-walk.py` places each Atlas frame on one complete textured plane and removes its green background through Blender's compositor. `tools/build-wholebody-walk-scene.py` authors the other nine twelve-frame sequences as complete RGBA planes, with textures packed in the editable scene. Neither builder skins, stretches or separately scales the head, torso or legs. `tools/pack-wholebody-walk.py` crops transparency and adjusts coordinates, then merges only the current manifest's `walk` fields.

The game loads one combat bank and one complete walking bank per character. A walking frame is drawn once with a uniform scale from `walk.bodyHeight`; facing changes only its signed horizontal mirror. Actual clamped displacement advances the cycle, so walls, idle, pause and hit knockback cannot create footsteps. Walking-to-combat switches remove the old walking picture immediately, preventing overlapping heads and legs. The 70-world-pixel loop is calibrated for readable game cadence (Atlas approximately178 steps/minute). It is an artistic sprite cycle, not a claim of exact physical sole locking in every depth direction.

The previous mixed-direction part renderer and its regeneration tools are retired. Their equal bone lengths and sole-coordinate checks did not establish visible anatomy: actual captures showed mismatched head views, folded calves and altered costumes. The retained `tools/wholebody-walk-qa.mjs` was used on the earlier belt-scrolling build to capture complete bodies and idle→walk→strike transitions for all ten characters, including slow sticks, direction changes, depth, diagonal movement, pause and tag. The current ring build uses `npm run qa:ui`, `npm run qa:match` and `npm run qa:visual` for its two active fighters. Runtime assertions establish frame selection, isotropic drawing and input lifecycle; anatomical acceptance requires inspecting the actual comparison images and videos.

`public/assets/motion/strike-contacts.json` stores 50 reviewed fist/boot contact points from the final combat pixels, normalized around each cell's actual body-center pivot. `tools/export-strike-contacts.py` measures the forward opaque limb cluster inside its semantic height band and records the source SHA-256 and crop. The game applies the same Blender translation/rotation and signed facing as the attack drawing, so the contact flash follows the visible striking limb. Multiple victims of one strike share one flash; each grappling impact keeps its authored knee/pin/floor control. Regenerate contacts after a combat bank change with `python3 tools/export-strike-contacts.py`; add `--grid artifacts/strike-contacts/contact-grid.png` for visual inspection.

Rebuild selected complete-body sources:

```sh
/Applications/Blender.app/Contents/MacOS/Blender --background --factory-startup \
  --python tools/build-higgs-wholebody-walk.py -- \
  --input tools/walk-source/atlas-frames --output /path/to/atlas-renders
python3 tools/extract-wholebody-walk-sheets.py \
  --sources tools/walk-source/sources.json \
  --calibration tools/walk-source/calibration.json --output /path/to/extracted
/Applications/Blender.app/Contents/MacOS/Blender --background --factory-startup \
  --python tools/build-wholebody-walk-scene.py -- \
  --input /path/to/extracted/manifest.json --output /path/to/other-renders
python3 tools/pack-wholebody-walk.py --input /path/to/atlas-renders --merge
python3 tools/pack-wholebody-walk.py --input /path/to/other-renders --merge
```

The retained restored sheets are the selected build inputs. To reproduce the preceding color restoration, use the actor's input, marker set, material and lower-band values in `tools/walk-source/color-restoration.json`. For example:

```sh
/Applications/Blender.app/Contents/MacOS/Blender --background --factory-startup \
  --python tools/restore-walk-marker-colors.py -- \
  --actor onyx --input tools/walk-source/marked/onyx-walk-markers12.png \
  --markers blue-red --material skin --rows 3 --cols 4 \
  --reference tools/walk-source/references/onyx-idle.png --output /path/to/onyx-restoration
python3 tools/verify-walk-color-restore.py --output /path/to/onyx-restoration
```

Ember and Lynx first require `tools/replace-walk-source-cell.py` with their recipe's original/edited canvases and cell index9. Review the selected complete body and the other eleven bodies before using the resulting sheet as the color-restoration input. The packed selection and restoration scenes retain their source textures and compositor controls.

Combat and walking importers reread the current manifest and merge only their own field. Atomic replacement prevents partially written metadata and preserves the independently generated banks.

The selected raw frames, restored sheets, marked masters, hashes, exact archived generation prompts and color/selection recipes live in `tools/walk-source/`. Nova's unavailable exact request is explicitly labeled as a reproduction instruction. Editable packed scenes are `tools/atlas-higgs-wholebody-walk.blend` and `tools/sd-wholebody-walk.blend`; their complete image textures remain available inside the scenes. The original driving mannequin and its video are retained in `tools/walk-source/driving-reference/`; colored motion guides are in `tools/walk-source/guides/`. Sources and calibration are authoring files, excluded from the web app's downloads.

## First-version authoring archive

The initial two paired tracks remain in `grapples.json`: a 1.35-second powerbomb and 1.30-second suplex, sampled from `tools/sd-grapples.blend`. Their actual Blender-rendered contact sheets are `powerbomb-preview.webp` and `suplex-preview.webp`. The initial four Atlas powerbomb drawings are `atlas-grapple.webp`, generated with Higgsfield job [eda09d17-ab8e-4c1e-a23e-8d827bfb6131](https://d8j0ntlcm91z4.cloudfront.net/user_3Jx4IFW1oMtuHLRGsebq6Lj642q/hf_20261012_152409_eda09d17-ab8e-4c1e-a23e-8d827bfb6131.png). These preserve the original implementation’s editable source and provenance.

Reference games (Streets of Rage 4 and Capcom belt-scrolling games) inform pacing, movement and impact timing. Their assets are not copied.

## Ring Night genre transition — 2026-10-13

The current game uses a single wrestling ring and only Atlas and Nova as active fighters. Original complete-body walk and combat banks remain byte-for-byte unchanged. The renderer draws an original canvas mat, apron, three ropes, padded corner posts and crowd with Canvas 2D. Characters retain one isotropic body scale at every mat depth. No reference-game imagery or audio is redistributed.

Reference: [the supplied Rumble Roses XX gameplay](https://www.youtube.com/watch?v=cra_ZRVD9Vc), visually inspected in the browser, and [Konami's original Rumble Roses XX manual](https://www.videogamemanual.com/xbox360/Rumble%20Roses%20XX.pdf), particularly its controls, singles matches, grappling and finishing gauge descriptions. These inform the ring-focused match rules, not an exact recreation of that game's full feature set.

New ring trajectories are authored in real Blender through `tools/build-ring-motion.py`, saved in `tools/sd-ring-motion.blend` and sampled into `public/assets/motion/ring.json`. They combine existing reviewed whole-body semantic drawings with paired translations and rotations; artwork is never stretched per limb or per axis. Cover, submission, escape, rope rebound, running attack, character-specific corner moves and finishers have separate animation clips. Ring bell, referee count, rope and escape sounds are original Web Audio synthesis alongside the existing unified impact family.

For hero-versus-hero matches, `ring.json` explicitly maps eight original opponent reaction semantics to existing Atlas/Nova whole-body poses. Runtime load validates every resolved pose against the correct character bank. The old standing-jab fallback cannot silently substitute for a missing wrestling reaction. Neither hero bank contains a dedicated face-down prone drawing; DDT/bulldog reactions reuse the closest existing low side-fall art. This is an art-library limitation, recorded in `ring.json`, rather than a newly generated prone animation.
