# SD characters and combat animation sources

Atlas and Nova are the two playable original SD identities. Atlas specializes in powerbombs; Nova specializes in suplexes. Viper, Lynx, Raven, Seraph, Tempest, Ember, Valkyrie and Onyx are the eight original enemy identities; Onyx is the final boss. Hair, faces, SD proportions and character palettes are checked against Rocky Hong’s supplied games.

## Original art and licenses

- [slay](https://github.com/rockyhong-a11y/slay), commit `7a1bfbe261862f7c6a44981faf6ae9fb63eddb8c`: original SD fighters under that source repository’s `public/assets/sd2d` directory.
- [slay-beach-volley](https://github.com/rockyhong-a11y/slay-beach-volley), commit `5ffed009aa658bf8ac86e25157b5637c0a42f346`: optimized fighter WebP sheets, portraits and six-frame directional whole-body running artwork.
- Both carry the MIT License, copyright 2026 Rocky Hong. The notice is retained in `public/assets/SOURCE_LICENSE.txt`.
- Outfit and Do Hyeon are bundled with their SIL Open Font License notices in `public/assets/fonts`.

`tools/prepare-sprites.py /path/to/slay-beach-volley` takes an explicit local clone path. Base rectangles reference the actual 888 × 444 optimized sheets. Run atlases have 256 × 256 cells and a 216-pixel body-height reference. Their source images remain original whole-body artwork.

## Reviewed Higgsfield combat poses

The current combat banks contain **82 reviewed Higgsfield drawings**, plus the original whole-body hurt drawing for each hero. The two hero banks each have 18 distinct drawings and 10 explicit semantic aliases. Each of the eight enemy banks has six distinct drawings and 22 aliases. All ten banks therefore expose 28 semantic pose keys, backed by 84 distinct runtime drawings. Aliases reuse existing pixels; they do not consume extra atlas cells.

The six hero sheets cover attacks, grappling and counters; the eight enemy sheets cover windup, extended jab, extended cross, kick, hurt and rear-facing stun. Arms and legs visibly extend in the actual raster art. Charge and launcher reuse the reviewed attack poses while Blender supplies their weight shift and paired trajectory. The original cutout rig remains an editable authoring experiment only; its narrow side silhouettes and segment seams are excluded from runtime atlases.

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

Runtime WebP banks are lossless RGBA with **384 × 384 cells**, a **270-pixel body-height reference**, floor pivot `[165,346.5]` and body-center pivot `[165,211.5]`. Heroes use 5 × 4 banks; enemies use 3 × 2 banks. The total decoded combat image footprint is **49.5 MiB**, rather than ten large 512-cell cutout sheets. The packed authoring scenes are separate from runtime downloads.

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

## Twenty-eight sampled Blender combat clips

Actual Blender 5.2.2 LTS authors and samples `public/assets/motion/combat.json`. Its editable packed source is `tools/sd-combat.blend`. The scene contains reviewed textured 2D fighter planes, independent hero/opponent motion objects, pose-visibility keys, and contact, lift-apex, impact, regrip and release timeline markers. Source textures are packed into the `.blend`.

- Six strike clips: jab, cross, low kick, roundhouse, launcher and charge strike. Each has 11 authored keys, anticipation, extended-limb contact, follow-through and return to idle. The extended pose begins at least 85 ms before contact so the runtime pose crossfade completes before damage.
- Sixteen directional grapples: front/rear × up/down/left/right for each hero. Every move has 12 authored keys and a distinct opponent path with different height, throw direction, turnover, speed and landing. Atlas uses lift-and-slam powerbomb variants; Nova uses vertical, belly-to-belly, fisherman, snap, German, dragon, side and rolling suplex variants.
- Two chain throws have 17 authored keys, a real second lift and two impact events at 38% and 78%; they are not a replay of one throw.
- Four counters cover paired reversal slams and arm-lock takedowns. Each has 12 authored keys, a guard/parry entry, waist or wrist-grip interval, impact and recovery.

All clips are sampled from evaluated Blender object transforms and actual visible texture poses at 60 Hz. Scale remains 1 throughout; the engine blends into and out of each motion. `combat-inspection.json` records clip frame spans, sample counts, contact/impact frames, end transforms, maximum opponent lift and minimum scale for structured inspection. The `grip` field is a paired hold marker between the actor centers, useful for phase inspection; it is not a hand-bone IK constraint.

```js
{
  version: 2, sampleRate: 60, unit: 'bodyHeight', pivot: 'bodyCenter',
  clips: {
    atlas_front_up: {
      type: 'grapple', heroId: 'atlas', direction: 'front', duration: 1.55,
      contactAt: 0.11, impactAt: 0.72, recoveryAt: 0.81,
      authoredKeyCount: 12, poseBlend: 0.085,
      frames: [{
        t: 0, // normalized 0–1
        hero: {x:0,z:0,angle:0,scaleX:1,scaleY:1,pose:'clinch'},
        victim: {x:0.54,z:0,angle:0,scaleX:1,scaleY:1,pose:'idle'},
        grip: {active:false,type:'waist',x:0.27,z:0}
      }]
    }
  }
}
```

`x` is along the hero’s facing direction and `z` is upward, both in body-height units. `angle` is clockwise Canvas radians. The pair mirrors together with facing. Transform pivots are at the body center. `t`, `contactAt`, `impactAt`, `recoveryAt`, event times and grip periods are normalized; elapsed seconds equal phase × duration. The manifest resolves each string pose to a rectangle and its center pivot. Named aliases are explicit, so the renderer does not guess numerical artwork indices.

Rebuild after the reviewed banks are ready:

```sh
/Applications/Blender.app/Contents/MacOS/Blender --background --factory-startup \
  --python tools/build-combat-motion.py
```

`tools/build-combat-poses.py` and `tools/sd-combat-poses.blend` retain the original articulated cutout authoring experiment. That script takes `--source` and `--output` for its original cutout-kit inputs; its raster output is not imported into runtime banks.

## First-version authoring archive

The initial two paired tracks remain in `grapples.json`: a 1.35-second powerbomb and 1.30-second suplex, sampled from `tools/sd-grapples.blend`. Their actual Blender-rendered contact sheets are `powerbomb-preview.webp` and `suplex-preview.webp`. The initial four Atlas powerbomb drawings are `atlas-grapple.webp`, generated with Higgsfield job [eda09d17-ab8e-4c1e-a23e-8d827bfb6131](https://d8j0ntlcm91z4.cloudfront.net/user_3Jx4IFW1oMtuHLRGsebq6Lj642q/hf_20261012_152409_eda09d17-ab8e-4c1e-a23e-8d827bfb6131.png). These preserve the original implementation’s editable source and provenance.

Reference games (Streets of Rage 4 and Capcom belt-scrolling games) inform pacing, movement and impact timing. Their assets are not copied.
