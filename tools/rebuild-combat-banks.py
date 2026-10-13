#!/usr/bin/env python3
"""Rebuild reviewed combat sheets from an explicitly supplied PNG directory.
Download the URLs in combat-sheets.json to each listed file name first.
python3 tools/rebuild-combat-banks.py --source-dir /path/to/downloaded/sheets
"""
from pathlib import Path
import argparse,json,subprocess,sys
ROOT=Path(__file__).resolve().parents[1]
parser=argparse.ArgumentParser();parser.add_argument('--source-dir',required=True,type=Path)
options=parser.parse_args()
sheets=json.loads((ROOT/'tools/combat-sheets.json').read_text())['sheets']
missing=[sheet['file'] for sheet in sheets if not (options.source_dir/sheet['file']).is_file()]
if missing:raise SystemExit('Missing reviewed source sheets: '+', '.join(missing))
for sheet in sheets:
 subprocess.run([sys.executable,str(ROOT/'tools/import-combat-poses.py'),sheet['character'],'--sheet',str(options.source_dir/sheet['file']),'--keys',','.join(sheet['keys']),'--cols',str(sheet['cols']),'--rows',str(sheet['rows']),'--key',sheet['keyColor'],'--job',sheet['job'],'--source-url',sheet['url']],check=True,cwd=ROOT)
