#!/usr/bin/env python3
"""Build bx-polling.json: geocoded Bexar County polling places for the Nov 3, 2026 election.

Input:  scripts/polling-locations.csv — transcribed from the county's official
        "Early Voting Sites and Hours" PDF (https://elections.bexar.gov/DocumentCenter/View/1712).
        kind  = ev (early voting) / ed (election day) / both
        hours = full   (main + regular sites: Oct 19-23 8a-6p, Sat 24 7a-7p, Sun 25 12-6p, Oct 26-30 7a-7p)
                branch (branch sites: weekdays 8a-6p, closed weekends)
        Election-day vote centers aren't published yet (the county posts them in
        October); add them as kind=ed rows and rerun.
Output: bx-polling.json — minified [{n, r, a, k, h, lat, lng, note?}]

Geocoding: Bexar County's own locator (maps.bexar.org Locators/BeCoMultiRole, the
same one the widget uses), then the US Census geocoder, then HAND_FIXES.
Results cached in scripts/.geocode-cache.json.
"""
import csv, json, math, sys, urllib.parse, urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
CSV_PATH, OUT_PATH = ROOT / "scripts" / "polling-locations.csv", ROOT / "bx-polling.json"
CACHE_PATH = ROOT / "scripts" / ".geocode-cache.json"
BEXAR = "https://maps.bexar.org/arcgis/rest/services/Locators/BeCoMultiRole/GeocodeServer/findAddressCandidates"
CENSUS = "https://geocoding.geo.census.gov/geocoder/locations/onelineaddress"
UA = "bexar-map-polling-builder/1.0"
BBOX = (29.10, 29.80, -98.83, -98.10)  # lat_min, lat_max, lng_min, lng_max (Bexar County + margin)

# Manually verified coordinates for addresses no geocoder resolves cleanly: "address|city|zip": (lat, lng)
HAND_FIXES = {}

def key(r): return f"{r['address']}|{r['city']}|{r['zip']}"
def fetch(url):
    with urllib.request.urlopen(urllib.request.Request(url, headers={"User-Agent": UA}), timeout=30) as resp: return json.load(resp)
def inside(lat, lng): return BBOX[0] <= lat <= BBOX[1] and BBOX[2] <= lng <= BBOX[3]

def bexar(r):
    q = urllib.parse.urlencode({"f": "json", "outSR": "4326", "maxLocations": "1",
                                "SingleLine": f"{r['address']}, {r['city']}, TX {r['zip']}"})
    c = (fetch(f"{BEXAR}?{q}").get("candidates") or [None])[0]
    if c and c["score"] >= 90: return {"lat": c["location"]["y"], "lng": c["location"]["x"], "src": "bexar", "score": c["score"]}

def census(r):
    q = urllib.parse.urlencode({"address": f"{r['address']}, {r['city']}, TX {r['zip']}", "benchmark": "Public_AR_Current", "format": "json"})
    m = fetch(f"{CENSUS}?{q}")["result"]["addressMatches"]
    if m: return {"lat": m[0]["coordinates"]["y"], "lng": m[0]["coordinates"]["x"], "src": "census"}

def miles(a, b):
    p1, p2 = math.radians(a[0]), math.radians(b[0])
    h = math.sin((p2 - p1) / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(math.radians(b[1] - a[1]) / 2) ** 2
    return 2 * 3958.8 * math.asin(math.sqrt(h))

def main():
    rows = list(csv.DictReader(CSV_PATH.open()))
    cache = json.loads(CACHE_PATH.read_text()) if CACHE_PATH.exists() else {}
    for r in rows:
        k = key(r)
        if k in HAND_FIXES:
            cache[k] = {"lat": HAND_FIXES[k][0], "lng": HAND_FIXES[k][1], "src": "hand"}
        if k in cache: continue
        for fn in (bexar, census):
            try: hit = fn(r)
            except Exception as e: print(f"{fn.__name__} error for {k}: {e}", file=sys.stderr); hit = None
            if hit and inside(hit["lat"], hit["lng"]): cache[k] = hit; break
        else:
            print(f"UNRESOLVED: {k}  (add to HAND_FIXES)", file=sys.stderr)
    CACHE_PATH.write_text(json.dumps(cache, indent=1))
    missing = [key(r) for r in rows if key(r) not in cache]
    if missing: sys.exit(f"FATAL: {len(missing)} unresolved: {missing}")

    out = []
    for r in rows:
        c = cache[key(r)]
        item = {"n": r["name"], "r": r["room"], "a": f"{r['address']}, {r['city']} TX {r['zip']}",
                "k": r["kind"], "h": r["hours"], "lat": round(c["lat"], 5), "lng": round(c["lng"], 5)}
        if r["note"].strip(): item["note"] = r["note"].strip()
        out.append(item)
    OUT_PATH.write_text(json.dumps(out, ensure_ascii=False, separators=(",", ":")) + "\n")

    kinds, srcs = {}, {}
    for r in rows:
        kinds[r["kind"]] = kinds.get(r["kind"], 0) + 1
        s = cache[key(r)]["src"]; srcs[s] = srcs.get(s, 0) + 1
    print(f"sites: {len(out)}  kinds: {kinds}  geocoder sources: {srcs}")
    close = [(a["n"], b["n"], round(miles((a["lat"], a["lng"]), (b["lat"], b["lng"])) * 1609)) for i, a in enumerate(out)
             for b in out[i + 1:] if miles((a["lat"], a["lng"]), (b["lat"], b["lng"])) * 1609 < 30]
    print(f"pairs <30m apart: {close or 'none'}")

if __name__ == "__main__":
    main()
