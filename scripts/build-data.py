#!/usr/bin/env python3
"""Rebuild bx-outline.geojson and bx-precincts.geojson from Bexar County's public GIS.

  pip install shapely
  python3 scripts/build-data.py

Source (ArcGIS MapServer, public):
  maps.bexar.org  EL/VoterPrecincts/MapServer/0  -> "Bexar County Voter Precincts" (NAME = precinct number)
The county outline is the dissolved union of all precincts. Precincts are
simplified (~1.5 m tolerance) and coordinates rounded to 5 decimals to keep the
file small; output keeps only the `p` property.
"""
import json, urllib.request
from shapely.geometry import shape, mapping, MultiPolygon, Polygon
from shapely.validation import make_valid
from shapely.ops import unary_union

URL = "https://maps.bexar.org/arcgis/rest/services/EL/VoterPrecincts/MapServer/0/query"
KM2 = 111 * 96.7   # deg^2 -> km^2 at ~29.4N

def get(url):
    with urllib.request.urlopen(url, timeout=120) as r: return json.load(r)
def flatten(g):
    if g.geom_type == "Polygon": return [g]
    return [p for q in getattr(g, "geoms", []) for p in flatten(q)]
def mp(g): return MultiPolygon([p for p in flatten(g) if p.area > 0])
def rnd(g, nd=5): return make_valid(shape(json.loads(json.dumps(mapping(g)), parse_float=lambda x: round(float(x), nd))))

ids = get(f"{URL}?where=1%3D1&returnIdsOnly=true&f=json")["objectIds"]
feats = []
for i in range(0, len(ids), 200):
    chunk = ",".join(map(str, ids[i:i + 200]))
    feats += get(f"{URL}?objectIds={chunk}&outFields=NAME&outSR=4326&f=geojson")["features"]
print(f"fetched {len(feats)} precincts")

geoms, out = [], []
for f in feats:
    g = mp(make_valid(shape(f["geometry"])))
    geoms.append(g)
    s = mp(rnd(g.simplify(0.000015, preserve_topology=True)))
    out.append({"type": "Feature", "properties": {"p": int(str(f["properties"]["NAME"]).strip())}, "geometry": mapping(s)})
out.sort(key=lambda f: f["properties"]["p"])
json.dump({"type": "FeatureCollection", "features": out}, open("bx-precincts.geojson", "w"), separators=(",", ":"))

county = unary_union(geoms).buffer(0.00005).buffer(-0.00005)          # close hairline gaps between precincts
county = MultiPolygon([Polygon(p.exterior) for p in flatten(county) if p.area * KM2 > 0.05])  # drop slivers/holes
county = mp(rnd(county.simplify(0.00003, preserve_topology=True)))
json.dump({"type": "FeatureCollection", "features": [{"type": "Feature", "properties": {"county": "Bexar"}, "geometry": mapping(county)}]},
          open("bx-outline.geojson", "w"), separators=(",", ":"))
print(f"county {county.area*KM2:.0f} km2 ({len(county.geoms)} part(s)) | {len(out)} precincts | all valid: {all(shape(f['geometry']).is_valid for f in out)}")
