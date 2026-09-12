from pathlib import Path
import shutil,re,hashlib,json,sys
base=Path('.local/upstream/qrbtf-main'); src=base/'src/lib/qrbtf_lib'; dst=Path('src/lib/qrbtf_lib'); (dst/'qrcodes/param').mkdir(parents=True,exist_ok=True)
for f in ['encoder.ts','constants.ts','qrcodes/a1.tsx','qrcodes/a2.tsx']:
 s=(src/f).read_text(encoding='utf8')
 s=s.replace('import { rand } from "@/lib/utils";', 'import { seededRandom } from "./random";')
 s=s.replace('const points: React.ReactNode[] = [];','const points: React.ReactNode[] = [];\n    const rand = seededRandom(props.url);')
 s=s.replace('      {...props}', '      width="1024" height="1024"')
 (dst/f).write_text('// QRBTF contributors, GPL-3.0. Adapted for Linkora; see THIRD_PARTY_NOTICES.md.\n'+s,encoding='utf8')
for name in ['a1','a2']:
 s=(src/f'qrcodes/{name}_config.ts').read_text(encoding='utf8')
 s=s[s.index(f'export type {name.upper()}PresetKeys'):s.index(f'export function use{name.upper()}Params')]
 (dst/f'qrcodes/{name}_config.ts').write_text(f'import type {{ QrbtfRenderer{name.upper()}Props }} from "./{name}";\n'+s,encoding='utf8')
shutil.copyfile(base/'LICENSE','LICENSE')
Path('third_party/qrbtf').mkdir(parents=True,exist_ok=True)
shutil.copyfile(base/'LICENSE','third_party/qrbtf/LICENSE')
Path('third_party/qrbtf/upstream.json').write_text(json.dumps({'url':'https://github.com/ciaochaos/qrbtf','archive_sha256':hashlib.sha256(Path(sys.argv[1] if len(sys.argv)>1 else 'D:/qrbtf-main.zip').read_bytes()).hexdigest(),'files':{str(p.relative_to(src)):hashlib.sha256(p.read_bytes()).hexdigest() for p in src.rglob('*') if p.is_file() and (p.name.startswith(('a1','a2')) or p.name in ['encoder.ts','constants.ts'])}},indent=2))
