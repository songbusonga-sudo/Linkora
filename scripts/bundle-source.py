from pathlib import Path
from zipfile import ZipFile,ZIP_DEFLATED
allowed=['src','scripts','tests','third_party','package.json','package-lock.json','tsconfig.json','next.config.ts','next-env.d.ts','LICENSE','THIRD_PARTY_NOTICES.md','README.md','.gitignore','AGENTS.md','CLAUDE.md']
Path('.local').mkdir(exist_ok=True)
with ZipFile('.local/linkora-source.zip','w',compression=ZIP_DEFLATED) as z:
 for item in allowed:
  p=Path(item)
  for f in p.rglob('*') if p.is_dir() else [p]:
   if f.is_file() and '__pycache__' not in f.parts:z.write(f,f.as_posix())
