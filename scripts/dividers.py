"""Extract the supplied template's mutually exclusive divider layers."""
import json
import sys
from collections import Counter
from pathlib import Path
from psd_tools import PSDImage


def extract_dividers(psd, out):
    group_index, group = next((i, layer) for i, layer in enumerate(psd)
                              if layer.name == '分割线' and layer.is_group())
    names, seen = Counter(layer.name for layer in group), Counter()
    nodes, choices, default_id = [], [], None
    original = psd[4].composite().convert('RGBA')
    was_visible = group.visible
    # Hidden ancestors otherwise produce transparent exports.
    group.visible = True
    try:
        for i, layer in enumerate(group):
            ident = f'{group_index}-{i}'
            artwork = layer.composite().convert('RGBA')
            if not artwork.getchannel('A').getbbox():
                raise ValueError(f'Empty divider: {ident}')
            artwork.save(out / f'layer-{ident}.png')
            seen[layer.name] += 1
            name = layer.name if names[layer.name] == 1 else f'{layer.name}（{seen[layer.name]}）'
            x, y, right, bottom = layer.bbox
            nodes.append(dict(id=ident, name=f'分割线 {name}',
                              src=f'/private-assets/layer-{ident}.png',
                              x=x, y=y, width=right-x, height=bottom-y,
                              role='image', visible=False, opacity=layer.opacity / 255,
                              colorEditable=True, contentEditable=False, styleEditable=False,
                              positionEditable=False, sizeEditable=False, defaultText='',
                              originalText='', maxLength=60, fontSize=42, color='#a0a0a0'))
            choices.append(dict(id=ident, name=name, nodeIds=[ident]))
            if layer.bbox == psd[4].bbox and artwork.size == original.size and artwork.tobytes() == original.tobytes():
                default_id = ident
    finally:
        group.visible = was_visible
    if not default_id:
        raise ValueError('No divider matches the original standalone layer')
    return dict(nodes=nodes, option=dict(id='dividers', name='分割线', defaultId=default_id, choices=choices))


if __name__ == '__main__':
    out = Path('public/private-assets')
    out.mkdir(parents=True, exist_ok=True)
    result = extract_dividers(PSDImage.open(sys.argv[1]), out)
    (out / 'dividers.json').write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding='utf8')
    print(f"Extracted {len(result['nodes'])} dividers; default {result['option']['defaultId']}")
