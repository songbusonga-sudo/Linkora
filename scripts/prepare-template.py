import json,sys,shutil
from pathlib import Path
from psd_tools import PSDImage
from PIL import Image,ImageChops,ImageDraw
import numpy as np
from dividers import extract_dividers
out=Path('public/private-assets'); psd=PSDImage.open(sys.argv[1]); W,H=psd.size
layers={}
def walk(g,p=''):
 for i,l in enumerate(g):
  k=f'{p}-{i}' if p else str(i);layers[k]=l
  if l.is_group():walk(l,k)
walk(psd)
def export(k):
 l=layers[k]
 # Cached raster preserves Photoshop's own edges, typography and vector styling.
 im=l.composite(force=False) if l.is_group() or l.kind=='gradientfill' or l.has_effects() else l.topil()
 if im is None: im=l.composite(force=True)
 im=im.convert('RGBA')
 if l.clipping and k in ['5-1','6-1','7-1']:
  base=layers[k[:-1]+'0'];mask=Image.new('L',(im.width*4,im.height*4));draw=ImageDraw.Draw(mask);inset=float(base.stroke.line_width);box=tuple(int(v*4) for v in (base.left+inset-l.left,base.top+inset-l.top,base.right-inset-l.left,base.bottom-inset-l.top))
  if k=='7-1':draw.ellipse(box,fill=255)
  else:draw.rounded_rectangle(box,radius=23*4,fill=255)
  im.putalpha(ImageChops.multiply(im.getchannel('A'),mask.resize(im.size,Image.Resampling.LANCZOS)))
 im.save(out/f'layer-{k}.png')
 return im
for k,l in layers.items():
 if l.width and l.height:
  try:export(k)
  except Exception as e:print(k,str(e))
# Split at the original stacking boundaries; no invented background or flattening of transparency.
nodes=[]
def node(k,role='image'):
 l=layers[k];x,y,r,b=l.bbox
 nodes.append({'id':k,'name':l.name,'src':f'/private-assets/layer-{k}.png','x':x,'y':y,'width':r-x,'height':b-y,'role':role,'visible':True,'opacity':l.opacity/255,'colorEditable':False,'contentEditable':role in ['background','avatar','signature','wechat','alipay','reward','rewardAvatar'],'styleEditable':role in ['wechat','alipay'],'positionEditable':False,'sizeEditable':False,'defaultText':l.text if l.kind=='type' else '', 'originalText':l.text if l.kind=='type' else '', 'maxLength':12 if role=='signature' else 60,'fontSize':76 if role=='signature' else 42,'color':'#aaaaaa'})
for k,r in [('0','background'),('1','image'),('2','avatar'),('4','image'),('5-0','image'),('5-1','wechat'),('6-0','image'),('6-1','alipay'),('7-0','image'),('7-1','reward'),('7-2','rewardAvatar'),('7-3','image'),('7-4','rewardIcon'),('8-0','image'),('8-1','image'),('8-2','image'),('9-0','image'),('9-1','image'),('9-2','image'),('9-3','image'),('9-4','image'),('10-0','signature')]:node(k,r)
for n in nodes:
 if n['id'].startswith('8-'):n['visible']=False
label_option={'id':'label-language','name':'二维码下方文字','defaultId':'en','choices':[{'id':'zh','name':'中文','nodeIds':['8-0','8-1','8-2']},{'id':'en','name':'英文','nodeIds':['9-0','9-3','9-4']}]}
# Build a full-size recomposition for direct comparison.
canvas=Image.new('RGBA',(W,H))
for n in nodes:
 if not n['visible']:continue
 im=Image.open(out/Path(n['src']).name).convert('RGBA');canvas.alpha_composite(im,(n['x'],n['y']))
canvas.save(out/'reconstructed.png')
original=psd.topil().convert('RGBA');a=np.array(original).astype(float);b=np.array(canvas).astype(float)
metrics={'meanAbsoluteError':float(np.abs(a-b).mean()),'pixelsOver8':float((np.abs(a-b).max(axis=2)>8).mean()),'note':'RGBA comparison against embedded Photoshop composite'}
(out/'comparison.json').write_text(json.dumps(metrics,indent=2));print(metrics)
font=layers['10-0'].engine_dict
(out/'font-engine.txt').write_text(str(font),encoding='utf8')
template={'id':'starlight','name':'星光 · 三码收款卡','description':'轻盈星光，留住每一份心意。','width':W,'height':H,'cover':'/private-assets/original.png','font':'/private-assets/template.ttf','nodes':nodes,'options':[label_option],'assets':[],'verified':False,'version':1}
for n in nodes:
 if n['id'] in ['9-1','9-2']:
  text=n['defaultText'].strip('-')
  n.update(role='text',name='付款提示' if n['id']=='9-1' else '联系与工作时间',contentEditable=True,fixedDashes=True,defaultText=text,originalText=text,x=(W-n['width'])/2,color='#bfbfbf')
dividers=extract_dividers(psd,out)
divider_index=next(i for i,n in enumerate(nodes) if n['id']=='4')
nodes[divider_index:divider_index+1]=dividers['nodes']
template['options'].append(dividers['option'])
for n in nodes:
 if n['role']=='signature' or n.get('fixedDashes'):
  n.update(colorEditable=True,color='#bebcbc')
 if n['id'] in ['5-0','6-0','7-0']:
  n.update(colorEditable=True,color='#bebcbc',strokeOnly=True)
template['colorDefaultsVersion']=1
Path('data').mkdir(exist_ok=True)
Path('data/seed.json').write_text(json.dumps(template,ensure_ascii=False,indent=2),encoding='utf8')
