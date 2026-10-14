"""One-off: convert us-atlas states-10m.json (TopoJSON) into app/static/us-states.geojson for the map's base layer.

Source: https://cdn.jsdelivr.net/npm/us-atlas@3.0.1/states-10m.json (US Census cartographic boundaries).
Usage:  python3 app/make_states.py path/to/states-10m.json
"""
import json, os, sys

topo = json.load(open(sys.argv[1]))
sx, sy = topo['transform']['scale']; tx, ty = topo['transform']['translate']
arcs = []
for arc in topo['arcs']:
    x = y = 0; pts = []
    for dx, dy in arc:
        x += dx; y += dy
        pts.append([round(x * sx + tx, 4), round(y * sy + ty, 4)])
    arcs.append(pts)


def ring(idxs):
    out = []
    for i in idxs:
        pts = arcs[i] if i >= 0 else arcs[~i][::-1]
        out.extend(pts if not out else pts[1:])
    return out


feats = []
for g in topo['objects']['states']['geometries']:
    if g['type'] == 'Polygon': coords = [ring(r) for r in g['arcs']]
    elif g['type'] == 'MultiPolygon': coords = [[ring(r) for r in poly] for poly in g['arcs']]
    else: continue
    feats.append({'type': 'Feature', 'properties': {'name': g['properties']['name']}, 'geometry': {'type': g['type'], 'coordinates': coords}})

out = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'static', 'us-states.geojson')
json.dump({'type': 'FeatureCollection', 'features': feats}, open(out, 'w'), separators=(',', ':'))
print(f'{len(feats)} states -> {out} ({os.path.getsize(out) // 1024} KB)')
