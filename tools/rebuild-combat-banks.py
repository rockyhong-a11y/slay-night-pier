#!/usr/bin/env python3
"""Rebuild reviewed combat sheets from an explicitly supplied PNG directory.
Download the URLs in combat-sheets.json to each listed file name first.
python3 tools/rebuild-combat-banks.py --source-dir /path/to/downloaded/sheets
"""
from pathlib import Path
import argparse,hashlib,json,subprocess,sys
ROOT=Path(__file__).resolve().parents[1]
parser=argparse.ArgumentParser();parser.add_argument('--source-dir',type=Path);parser.add_argument('--catalog',type=Path,default=ROOT/'tools/combat-sheets.json');parser.add_argument('--version-only',action='store_true',help='Refresh cache hashes without changing any image bytes or atlas rectangles.')
options=parser.parse_args()
if not options.version_only:
 if options.source_dir is None:parser.error('--source-dir is required unless --version-only is selected')
 sheets=json.loads(options.catalog.read_text())['sheets']
 missing=[sheet['file'] for sheet in sheets if not (options.source_dir/sheet['file']).is_file()]
 if missing:raise SystemExit('Missing reviewed source sheets: '+', '.join(missing))
 for sheet in sheets:
  subprocess.run([sys.executable,str(ROOT/'tools/import-combat-poses.py'),sheet['character'],'--sheet',str(options.source_dir/sheet['file']),'--keys',','.join(sheet['keys']),'--cols',str(sheet['cols']),'--rows',str(sheet['rows']),'--key',sheet['keyColor'],'--job',sheet['job'],'--source-url',sheet['url']],check=True,cwd=ROOT)

# Refresh from actual final image bytes, then merge into a fresh manifest so
# concurrently authored walking/rig fields survive this metadata-only update.
manifest_path=ROOT/'public/assets/sprites/manifest.json'
snapshot=json.loads(manifest_path.read_text());versions={}
for actor,entry in snapshot.items():
 if 'combat' not in entry:continue
 image=entry['combat']['image'];versions[actor]=(image,hashlib.sha256((ROOT/'public'/image.lstrip('/')).read_bytes()).hexdigest()[:16])
latest=json.loads(manifest_path.read_text())
for actor,(image,version) in versions.items():
 current=latest[actor]['combat']['image']
 if current!=image:version=hashlib.sha256((ROOT/'public'/current.lstrip('/')).read_bytes()).hexdigest()[:16]
 latest[actor]['combat']['imageVersion']=version
temporary=manifest_path.with_name('manifest.combat.tmp');temporary.write_text(json.dumps(latest,separators=(',',':')));temporary.replace(manifest_path)
print(f'Combat image cache versions refreshed for {len(versions)} actors.')
