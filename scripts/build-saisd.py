#!/usr/bin/env python3
"""Build SAISD/saisd-data.json: San Antonio ISD trustee election results by precinct, 2017-2025.

  pip install pypdf pyshp pyproj shapely
  python3 scripts/build-saisd.py

Sources (downloaded into scripts/.saisd-cache/, which is gitignored):
  Results: Bexar County Elections official precinct reports (elections.bexar.gov/35/Historical)
    2017-05-06  "Election Totals Report" (HTM)        DocumentCenter/View/1558
    2019-05-04  "Election Totals Report" (HTM)        DocumentCenter/View/1437
    2021-05-01  "Precinct Report" (PDF, Electionware) DocumentCenter/View/1407
    2023-05-06  "Precinct by Precinct Results" (PDF)  DocumentCenter/View/1268
    2025-05-03  "Official Precinct Report" (CSV)      DocumentCenter/View/1224
  Precinct boundaries (the precinct set in force at each election):
    2017 -> TLC 2016 general-election precincts, via VEST (Harvard Dataverse doi:10.7910/DVN/NH5S2I,
            tx_2016, field PREC). Bexar renumbered/redrew precincts between May 2017 and Nov 2018, so
            2020 shapes would misplace 2017 precincts (verified: the May 2017 report's precinct numbers
            match the 2016 set exactly).
    2019, 2021 -> TLC VTDs20G (2020 general; identical to the 2018 set for these precincts)
    2023 -> TLC VTDs_22G     2025 -> TLC VTDs_24PG     (data.capitol.texas.gov/dataset/vtds)
    TLC stores some precincts in lettered parts (2039A, 2039B, ...): parts are unioned back together.
    A precinct missing from its vintage falls back to the same number in another vintage (flagged).
  Map geometry is clipped to the SAISD boundary (precincts straddling the district line are drawn
  only inside SAISD; vote counts are the precinct's full SAISD-race totals either way).
  SAISD boundary: Census TIGERweb Unified School Districts (GEOID 4838730).

Output geometry is simplified (~3 m) and rounded to 5 decimals.
"""
import csv, html, json, re, urllib.request, zipfile
from collections import OrderedDict
from pathlib import Path
import pypdf, shapefile
from pyproj import CRS, Transformer
from shapely.geometry import shape, mapping, MultiPolygon
from shapely.ops import transform, unary_union
from shapely.validation import make_valid

ROOT = Path(__file__).resolve().parent.parent
CACHE = ROOT / "scripts" / ".saisd-cache"
OUT = ROOT / "SAISD" / "saisd-data.json"
DOC = "https://elections.bexar.gov/DocumentCenter/View/"
TLC = "https://data.capitol.texas.gov/dataset/4d8298d0-d176-4c19-b174-42837027b73e/resource/"
ELECTIONS = [  # year, date, doc id, filename, parser, vtd vintage
    (2017, "2017-05-06", 1558, "2017.htm", "htm", "16"),
    (2019, "2019-05-04", 1437, "2019.htm", "htm", "20"),
    (2021, "2021-05-01", 1407, "2021.pdf", "pdf", "20"),
    (2023, "2023-05-06", 1268, "2023.pdf", "pdf", "22"),
    (2025, "2025-05-03", 1224, "2025.csv", "csv", "24"),
]
# Seats up that year but not on the ballot (unopposed; election cancelled for that seat).
UNCONTESTED = {2017: [7], 2025: [4, 7]}
VTDS = {"16": ("https://dataverse.harvard.edu/api/access/datafile/12070340", "tx_2016", "PREC"),
        "20": ("06157b97-40b8-43af-99d5-bd9b5850b15e/download/vtds20g_2020.zip", "VTDs20G_2020"),
        "22": ("037e1de6-a862-49de-ae31-ae609e214972/download/vtds_22g.zip", "VTDs_22G"),
        "24": ("906f47e4-4e39-4156-b1bd-4969be0b2780/download/vtds_24pg.zip", "VTDs_24PG")}
for _v in ("20", "22", "24"): VTDS[_v] = (TLC + VTDS[_v][0], VTDS[_v][1], "VTD")
BEXAR_FIPS = 29

def fetch(url, name):
    p = CACHE / name
    if not p.exists():
        CACHE.mkdir(parents=True, exist_ok=True)
        req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
        with urllib.request.urlopen(req, timeout=300) as r: p.write_bytes(r.read())
    return p

def clean_name(n): return re.sub(r"\s+", " ", n.replace("\xa0", " ")).strip()

# ---- results parsers: each returns {district: {precinct: {candidate|OVER VOTES|UNDER VOTES: votes}}} ----
def parse_htm(path):
    """Old fixed-width 'Election Totals Report': per race, candidate legend then one row per precinct."""
    lines = html.unescape(re.sub(r"<[^>]+>", "", path.read_text(encoding="latin-1"))).splitlines()
    races, i = {}, 0
    while i < len(lines):
        m = re.match(r"\s*SAN ANTONIO ISD Trustee, District No\.\s*(\d+)", lines[i])
        if not m: i += 1; continue
        d, cands = int(m.group(1)), {}
        i += 1
        while not re.match(r"\s*-{5,}", lines[i]):
            for num, name in re.findall(r"(\d\d) = (.+?)\s{2,}[\d,]+(?:\s+[\d.]+)?(?=\s{3,}|\s*$)", lines[i]):
                cands[num] = clean_name(name)
            i += 1
        names = [cands[c] for c in lines[i + 1].split()]
        i += 3
        while i < len(lines) and re.match(r"^\d{4}\s", lines[i]):
            parts = lines[i].split()
            races.setdefault(d, {})[parts[0]] = dict(zip(names, map(int, parts[1:])))
            i += 1
    return races

def sections_pdf(path):
    secs = OrderedDict()
    for page in pypdf.PdfReader(str(path)).pages:
        L = (page.extract_text() or "").split("\n")
        k = L.index("Bexar County")
        secs.setdefault(L[k + 1].split()[0], []).extend(
            l for l in L[k + 2:] if not l.startswith(("Precinct Summary -", "Report generated with")))
    return secs

def sections_csv(path):
    secs, cur = OrderedDict(), None
    for r in csv.reader(open(path, encoding="utf-8-sig", errors="replace")):
        cells = [c.strip() for c in r if c.strip()]
        if not cells: continue
        if len(cells) == 1 and re.match(r"^\d{4}\b", r[0].strip()):
            cur = r[0].split()[0]; secs.setdefault(cur, []); continue
        if cur: secs[cur].append(" ".join(cells))
    return secs

CAND = re.compile(r"^(.+?) ([\d,]+) ([\d.]+%)(?: [\d,]+)*$")
def parse_electionware(secs):
    """Electionware 'Summary Results Report' by precinct (2021+ PDFs and the 2025 CSV)."""
    races = {}
    for pct, L in secs.items():
        i = 0
        while i < len(L):
            title = L[i] + (" " + L[i + 1] if i + 1 < len(L) and "Vote For" not in L[i + 1] and "San Antonio Independent" not in L[i] else "")
            m = re.match(r"^For Trustee, (?:Single-Member )?District(?: No\.)? (\d+) San Antonio Independent School", title)
            if not m: i += 1; continue
            res, i = {}, i + 1
            while i < len(L) and not L[i].startswith("Total Votes Cast"):
                c = CAND.match(L[i])
                if c and not L[i].startswith(("Overvotes", "Undervotes")): res[clean_name(c.group(1))] = int(c.group(2).replace(",", ""))
                i += 1
            for l in L[i + 1:i + 3]:
                m2 = re.match(r"^(Over|Under)votes ([\d,]+)", l)
                if m2: res[m2.group(1).upper() + " VOTES"] = int(m2.group(2).replace(",", ""))
            races.setdefault(int(m.group(1)), {})[pct] = res
    return races

# ---- geometry ----
def rnd(g, nd=5):
    return make_valid(shape(json.loads(json.dumps(mapping(g)), parse_float=lambda x: round(float(x), nd))))
def polys(g):
    """Polygons only: make_valid/union can return GeometryCollections with stray points/lines."""
    if g.geom_type == "Polygon": return [g]
    return [q for part in getattr(g, "geoms", []) for q in polys(part)]
def simp(g): return MultiPolygon([p for p in polys(rnd(g.simplify(0.00003, preserve_topology=True))) if p.area > 0])

def load_vtds(v):
    url, stem, field = VTDS[v]
    z = fetch(url, f"vtds{v}.zip")
    d = CACHE / f"vtds{v}"
    if not d.exists(): zipfile.ZipFile(z).extractall(d)
    path = str(d / stem)
    tf = Transformer.from_crs(CRS.from_wkt(open(path + ".prj").read()), 4326, always_xy=True).transform
    parts = {}
    for sr in shapefile.Reader(path).iterShapeRecords():
        rec = sr.record.as_dict()
        if rec["CNTY"] == BEXAR_FIPS:
            key = re.sub(r"[A-Z]+$", "", str(rec[field]).strip().lstrip("0"))   # 2039A, 2039B -> 2039
            parts.setdefault(key, []).append(make_valid(transform(tf, shape(sr.shape.__geo_interface__))))
    return {k: unary_union(g) if len(g) > 1 else g[0] for k, g in parts.items()}

def main():
    vtds = {v: load_vtds(v) for v in VTDS}
    saisd = shape(json.loads(fetch(
        "https://tigerweb.geo.census.gov/arcgis/rest/services/TIGERweb/School/MapServer/0/query?where=GEOID%3D%274838730%27&outSR=4326&f=geojson",
        "saisd.geojson").read_text())["features"][0]["geometry"])
    saisd = make_valid(saisd)
    data = {"saisd": mapping(simp(saisd)), "elections": [], "vintages": {}}
    used = {v: set() for v in VTDS}
    for year, date, doc, fname, kind, vint in ELECTIONS:
        p = fetch(DOC + str(doc), fname)
        races = parse_htm(p) if kind == "htm" else parse_electionware(sections_pdf(p) if kind == "pdf" else sections_csv(p))
        el = {"year": year, "date": date, "source": DOC + str(doc), "vintage": vint, "races": [], "unmapped": [], "fallback": [],
              "uncontested": UNCONTESTED.get(year, [])}
        for d in sorted(races):
            pcts = races[d]
            cands = [c for c in next(iter(pcts.values())) if not c.endswith(" VOTES")]
            totals = {c: sum(v.get(c, 0) for v in pcts.values()) for c in cands}
            cands.sort(key=lambda c: -totals[c])
            rows, geoms = {}, []
            for pct, v in sorted(pcts.items()):
                rows[pct] = [v.get(c, 0) for c in cands] + [v.get("UNDER VOTES", 0), v.get("OVER VOTES", 0)]
                if pct in vtds[vint]: used[vint].add(pct); geoms.append(vtds[vint][pct])
                else:
                    alt = next((w for w in ("22", "24", "20") if pct in vtds[w]), None)
                    if alt: used[alt].add(pct); el["fallback"].append([pct, alt]); geoms.append(vtds[alt][pct])
                    else: el["unmapped"].append(pct)
            # Approximate district outline: union of the race's precincts (SAISD publishes no district GIS).
            outline = unary_union([g.buffer(0.00005) for g in geoms]).buffer(-0.00005).intersection(saisd)
            el["races"].append({"district": d, "candidates": cands, "totals": [totals[c] for c in cands], "precincts": rows,
                                "outline": mapping(simp(outline))})
            print(year, "D%d" % d, {c: totals[c] for c in cands}, "precincts:", len(rows))
        el["unmapped"] = sorted(set(el["unmapped"])); el["fallback"] = sorted(set(map(tuple, el["fallback"])))
        if el["unmapped"] or el["fallback"]: print("   unmapped:", el["unmapped"], "fallback:", el["fallback"])
        data["elections"].append(el)
    for v, ps in used.items():
        data["vintages"][v] = {"type": "FeatureCollection", "features": [
            {"type": "Feature", "properties": {"p": p}, "geometry": mapping(simp(vtds[v][p].intersection(saisd)))} for p in sorted(ps)]}
    OUT.parent.mkdir(exist_ok=True)
    OUT.write_text(json.dumps(data, ensure_ascii=False, separators=(",", ":")))
    print(f"wrote {OUT.relative_to(ROOT)} ({OUT.stat().st_size/1e3:.0f} KB)")

if __name__ == "__main__":
    main()
