# SD characters and wrestling animation sources

The ten characters retain the names, hair, faces, costumes and SD proportions in Rocky Hong's original games. New gameplay assignments are Atlas (powerbomb specialist), Nova (suplex specialist), and Viper, Lynx, Raven, Seraph, Tempest, Ember, Valkyrie and Onyx as the eight enemy identities. Onyx is the final boss.

## Original art

- [slay](https://github.com/rockyhong-a11y/slay), commit `7a1bfbe261862f7c6a44981faf6ae9fb63eddb8c`: original three-pose SD fighters, in `public/assets/sd2d`.
- [slay-beach-volley](https://github.com/rockyhong-a11y/slay-beach-volley), commit `5ffed009aa658bf8ac86e25157b5637c0a42f346`: optimized original fighter WebP sheets, portraits, and six-frame directional whole-body run artwork. Runtime assets are copied or losslessly normalized from these files. No character identities were invented or replaced.
- Both sources carry the MIT License, copyright 2026 Rocky Hong. The notice is retained at `public/assets/SOURCE_LICENSE.txt`.
- Outfit and Do Hyeon fonts are shipped locally with their original SIL Open Font License notices in `public/assets/fonts`.

`tools/prepare-sprites.py` reproduces the original fighter and run assets from a local clone of `slay-beach-volley`. Base rectangles are scaled to the actual optimized sheet size of 888 × 444. Run poses use ground-aligned 256 × 256 cells, with a 216-pixel body-height reference.

## New Atlas powerbomb poses — Higgsfield

Four additional Atlas poses were generated with the Higgsfield plugin using the existing Atlas SD character as the reference: ready clinch, two-handed grip, overhead lift and sit-out slam. The generated artwork was visually reviewed against the source: orange hair, dark gloves, black outfit with orange trim, knee pads and orange-laced boots remain consistent.

- Provider/model: Higgsfield `nano_banana_2_1`
- Job: `eda09d17-ab8e-4c1e-a23e-8d827bfb6131`
- [Generated source strip](https://d8j0ntlcm91z4.cloudfront.net/user_3Jx4IFW1oMtuHLRGsebq6Lj642q/hf_20261012_152409_eda09d17-ab8e-4c1e-a23e-8d827bfb6131.png)
- Output: `public/assets/sprites/atlas-grapple.webp`
- Processing: `tools/prepare-higgsfield.py` removes the generated green screen using a continuous alpha matte, unmixes edge colors, suppresses green spill and aligns the four authored cells. The result is transparent WebP with four 320 × 320 cells. The first standing pose establishes a 295-pixel body-height reference; the floor pivot is `[160,316]` and center pivot is `[160,168.5]`.
- Runtime sprite pose indices 3, 4, 5 and 6 map to the four extra frames. Indices 0–2 continue to use the original source poses.

Nova uses the original SD poses with its newly authored Blender suplex trajectory. Nova reference upload was declined by the provider's content filter; no alternate upload or bypass was attempted.

## New paired grapple animations — Blender

Actual Blender 5.2.2 LTS was used to author and sample both moves. The editable source `tools/sd-grapples.blend` contains the original textured SD planes, Atlas's extra Higgsfield poses packed as image textures, separate hero/victim action tracks, and grip, ground-impact and recovery markers.

- **Powerbomb:** crouch and grip → opponent rotates upward → inverted overhead hold → accelerated forward descent → sit-out ground impact → release. Duration 1.35 seconds; authored impact at 73%.
- **Suplex:** close grip → upward lift → backward arch → opponent crosses behind the hero → rear ground impact → release. Duration 1.30 seconds; authored impact at 70%.
- The runtime asset `public/assets/motion/grapples.json` is sampled from the Blender object transforms at 60 Hz. These are game-playable paired motion tracks rather than a pre-rendered cutscene. The engine applies the tracks to each actual enemy character's original sprite.
- Developer contact sheets `powerbomb-preview.webp` and `suplex-preview.webp` are assembled from actual Blender renders.

JSON schema:

```js
{
  version: 1, sampleRate: 60, unit: 'bodyHeight', pivot: 'bodyCenter',
  clips: {
    powerbomb: {
      duration: 1.35, impactAt: 0.73,
      frames: [{
        t: 0, // normalized 0–1, not seconds
        hero:   { x: 0, z: 0, angle: 0, scaleX: 1, scaleY: 1, pose: 3 },
        victim: { x: 0.56, z: 0, angle: 0, scaleX: 1, scaleY: 1, pose: 0 }
      }]
    },
    suplex: { /* same schema */ }
  }
}
```

`x` and `z` are relative to a fighter's body height; positive `z` moves up. `angle` is radians, clockwise on Canvas. The entire pair mirrors with the hero's facing direction. The sprite transform pivot is at the body center, not the feet. `impactAt` is normalized; convert to elapsed seconds with `impactAt * duration`. Visibility is sampled from Blender's authored texture-pose keys.

Rebuild with Python 3 + Pillow and Blender:

```sh
python3 tools/prepare-sprites.py /path/to/slay-beach-volley
python3 tools/prepare-higgsfield.py atlas /path/to/downloaded-atlas-strip.png
python3 tools/prepare-blender-textures.py
/Applications/Blender.app/Contents/MacOS/Blender --background --factory-startup --python tools/build-grapples.py
python3 tools/finish-motion-previews.py
```

Blender image textures are packed into the saved `.blend`; the authoring scene remains editable without the temporary texture folder. Regeneration creates texture PNGs locally from runtime sheets before the Blender command.

Reference games (Streets of Rage 4 and Capcom belt-scrolling games) inform pacing, impact timing and movement only. Their copyrighted assets are not copied.
