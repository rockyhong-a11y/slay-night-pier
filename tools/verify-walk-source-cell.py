"""Read-only proof that Blender selected one complete body from an edited sheet.

No image pixels are written. This verifies selection/preservation, not anatomy
or phase order. Source-cell geometry is an independently approved art revision.
"""
from pathlib import Path
import argparse
import hashlib
import json

import numpy as np
from PIL import Image

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--output', type=Path, required=True)
parser.add_argument('--original', type=Path, help='Optional retained path replacing the receipt input path')
parser.add_argument('--edited', type=Path, help='Optional retained path replacing the receipt edit path')
args = parser.parse_args()
selection = json.loads((args.output / 'cell-selection.json').read_text())
original_path = args.original or Path(selection['original'])
edited_path = args.edited or Path(selection['edited'])
output_path = args.output / selection['output']
assert hashlib.sha256(original_path.read_bytes()).hexdigest() == selection['originalSHA256']
assert hashlib.sha256(edited_path.read_bytes()).hexdigest() == selection['editedSHA256']
original, edited, output = [np.asarray(Image.open(path).convert('RGBA')).astype(np.int16)
                            for path in [original_path, edited_path, output_path]]
assert original.shape == edited.shape == output.shape, 'Whole source canvas units are preserved'
x0, y0, x1, y1 = selection['rectangle']
outside = np.ones(original.shape[:2], dtype=bool); outside[y0:y1, x0:x1] = False
delta_original, delta_edited = np.abs(original - output), np.abs(edited - output)
report = {'status': 'SELECTED_WHOLE_CELL_INVARIANTS_VERIFIED',
          'scope': 'Exact source selection and other-body preservation; anatomy and chronology require visual review.',
          'dimensions': selection['dimensions'], 'rectangle': selection['rectangle'],
          'originalSHA256': selection['originalSHA256'], 'editedSHA256': selection['editedSHA256'],
          'outputSHA256': hashlib.sha256(output_path.read_bytes()).hexdigest(),
          'outsideAlphaMaxError': int(delta_original[:, :, 3][outside].max()),
          'outsideVisibleRGBMaxError': int(delta_original[:, :, :3][outside & (original[:, :, 3] > 0)].max()),
          'insideEditedAlphaMaxError': int(delta_edited[y0:y1, x0:x1, 3].max()),
          'insideEditedVisibleRGBMaxError': int(delta_edited[y0:y1, x0:x1, :3][edited[y0:y1, x0:x1, 3] > 0].max()),
          'other11BodyErrors': []}
for index, (x, y, right, bottom) in enumerate(selection['allOriginalBodyBounds']):
    if index == selection['sourceCellIndex']: continue
    report['other11BodyErrors'].append({'index': index,
        'alphaMaxError': int(delta_original[y:bottom, x:right, 3].max()),
        'visibleRGBMaxError': int(delta_original[y:bottom, x:right, :3][original[y:bottom, x:right, 3] > 0].max())})
errors = [value for key, value in report.items() if key.endswith('MaxError')]
errors += [value for row in report['other11BodyErrors'] for key, value in row.items() if key.endswith('MaxError')]
if any(errors): report['status'] = 'FAILED_SELECTED_WHOLE_CELL_INVARIANTS'
(args.output / 'pixel-verification.json').write_text(json.dumps(report, indent=2))
print(json.dumps(report, indent=2))
if any(errors): raise SystemExit(1)
