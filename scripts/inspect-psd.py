import sys,json
from pathlib import Path
from psd_tools import PSDImage
src=Path(sys.argv[1]); out=Path('public/private-assets'); out.mkdir(parents=True,exist_ok=True)
psd=PSDImage.open(src)
psd.topil().save(out/'original.png')
rows=[]
def walk(group,parent=''):
 for n,l in enumerate(group):
  ident=f'{parent}-{n}' if parent else str(n)
  row={'id':ident,'name':l.name,'kind':l.kind,'visible':l.visible,'effectiveVisible':l.is_visible(),'bbox':list(l.bbox),'opacity':l.opacity,'blend':str(l.blend_mode),'clipping':l.clipping,'mask':l.has_mask(),'effects':str(l.effects) if l.has_effects() else '', 'parent':parent}
  if l.kind=='type': row['text']=l.text
  rows.append(row)
  if l.is_group(): walk(l,ident)
  elif l.width and l.height:
   try:
    im=l.composite(force=True)
    if im: im.save(out/f'layer-{ident}.png')
   except Exception as e: row['error']=str(e)
walk(psd)
data={'width':psd.width,'height':psd.height,'layers':rows}
(out/'layers.json').write_text(json.dumps(data,ensure_ascii=False,indent=2),encoding='utf8')
print(json.dumps(data,ensure_ascii=False,indent=2))
