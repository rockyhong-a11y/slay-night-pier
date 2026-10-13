"""Read-only RGBA verification of a private Blender color restoration.

This tool never edits or saves images. Its JSON proves color/alpha invariants,
not anatomical quality, gait order, or correctness of a human-reviewed mask.
"""
import argparse
import hashlib
import json
from pathlib import Path

import numpy as np
from PIL import Image

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--output', type=Path, required=True)
args = parser.parse_args()
settings = json.loads((args.output / 'restore-settings.json').read_text())
source_path = Path(settings['input'])
restored_path, witness_path = [args.output / name for name in settings['outputs'][:2]]
source = np.asarray(Image.open(source_path).convert('RGBA')).astype(np.int16)
restored = np.asarray(Image.open(restored_path).convert('RGBA')).astype(np.int16)
witness = np.asarray(Image.open(witness_path).convert('RGBA')).astype(np.int16)
if source.shape != restored.shape or source.shape != witness.shape:
    raise ValueError('Color-only restoration must preserve the complete canvas')
delta = np.abs(source - restored)
marker = witness[:, :, 3] > 0
non_marker = ~marker
visible = source[:, :, 3] > 0
opaque = source[:, :, 3] > 180

def maximum(mask):
    return int(delta[:, :, :3][mask].max()) if mask.any() else 0

report = {
    'status': 'COLOR_ALPHA_INVARIANTS_VERIFIED',
    'scope': 'Structural pixel invariants only; marker membership and anatomy require visual review.',
    'actor': settings['actor'], 'dimensions': settings['dimensions'],
    'sourceSHA256': hashlib.sha256(source_path.read_bytes()).hexdigest(),
    'restoredSHA256': hashlib.sha256(restored_path.read_bytes()).hexdigest(),
    'maskSHA256': hashlib.sha256(witness_path.read_bytes()).hexdigest(),
    'markerPixels': int(marker.sum()),
    'alphaMaxError': int(delta[:, :, 3].max()),
    'alphaChangedPixels': int((delta[:, :, 3] > 0).sum()),
    'silhouetteAt180ChangedPixels': int(((source[:, :, 3] > 180) != (restored[:, :, 3] > 180)).sum()),
    'nonMarkerMaxRGBErrorAllAlpha': maximum(non_marker),
    'nonMarkerMaxRGBErrorVisible': maximum(non_marker & visible),
    'nonMarkerMaxRGBErrorOpaque': maximum(non_marker & opaque),
    'nonMarkerChangedVisibleRGBPixels': int(((delta[:, :, :3] > 0).any(axis=2) & non_marker & visible).sum()),
    'nonMarkerChangedOpaqueRGBPixels': int(((delta[:, :, :3] > 0).any(axis=2) & non_marker & opaque).sum()),
    'invisibleRGBNote': 'Blender may normalize unobservable RGB beneath zero alpha; exact alpha and visible RGB outside the selected marker mask are required.',
    'markerRGBMedian': np.median(restored[:, :, :3][marker & opaque], axis=0).tolist(),
    'settings': settings,
}
if report['alphaChangedPixels'] or report['nonMarkerMaxRGBErrorVisible']:
    report['status'] = 'FAILED_COLOR_ALPHA_INVARIANTS'
(args.output / 'pixel-verification.json').write_text(json.dumps(report, indent=2))
print(json.dumps({key: value for key, value in report.items() if key != 'settings'}, indent=2))
if report['status'] != 'COLOR_ALPHA_INVARIANTS_VERIFIED':
    raise SystemExit(1)
