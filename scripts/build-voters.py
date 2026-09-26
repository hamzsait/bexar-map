#!/usr/bin/env python3
"""Build bx-voters.json (per-precinct counts) and bx-voters/<XX>.json (name-lookup shards)
from the Bexar County voter list report (the county's registered-voter list, a public
record under Tex. Elec. Code 18.008; delivered as one CSV per commissioner precinct).

  python3 scripts/build-voters.py VOTERLISTREPORT_BC_PCT1.csv ... VOTERLISTREPORT_BC_PCT4.zip

Accepts .csv files or .zip files containing one CSV.
Only NAME, Status, Residential Address and Precinct are kept; VUID, DOB, gender,
mailing address, vote history and everything else are dropped.

Shards: each voter goes in the shard(s) named for the first two letters of each
part of their last name (e.g. GARCIA-LOPEZ -> GA.json and LO.json). The widget
loads the shards for the first two letters of every word the user types, so
"Maria Garcia" and "Garcia Maria" both work, and nobody downloads the whole roll.
Rows: [name, precinct, active (1/0), residential address]  ("***" = confidential).
"""
import csv, io, json, re, sys, zipfile, collections
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT_DIR = ROOT / "bx-voters"

def rows(path):
    if path.endswith(".zip"):
        z = zipfile.ZipFile(path)
        f = io.TextIOWrapper(z.open(z.namelist()[0]), encoding="utf-8", errors="replace")
    else:
        f = open(path, encoding="utf-8", errors="replace")
    yield from csv.DictReader(f)

def clean_addr(a):
    a = re.sub(r"\s+", " ", a).strip()
    if "***" in a: return "***"
    a = re.sub(r"\s*-\s*$", "", a)              # "... TX 78214 -" -> "... TX 78214"
    a = re.sub(r"(\d{5}) -(\d{4})$", r"\1-\2", a)  # "78239 -1933" -> "78239-1933"
    return re.sub(r"(\d{5}) -\d{1,3}$", r"\1", a)      # truncated ZIP+4 in the source -> drop it

counts = collections.defaultdict(lambda: {"total": 0, "active": 0})
shards = collections.defaultdict(list)
n = 0
for path in sys.argv[1:]:
    for r in rows(path):
        m = re.search(r"\d+", r["Precinct"] or "")
        if not m: continue
        pct, active = int(m.group()), 1 if r["Status"].strip().upper() == "ACTIVE" else 0
        name = re.sub(r"\s+", " ", r["NAME"]).strip().upper()
        addr = clean_addr(r["Residential Address"])
        n += 1
        counts[str(pct)]["total"] += 1
        counts[str(pct)]["active"] += active
        last = name.split(",")[0]
        for k in {w[:2] for w in re.split(r"[\s\-']+", last) if len(re.sub(r"[^A-Z]", "", w)) >= 2 and w[:2].isalpha()}:
            shards[k].append([name, pct, active, addr])

json.dump(dict(sorted(counts.items(), key=lambda kv: int(kv[0]))), open(ROOT / "bx-voters.json", "w"), separators=(",", ":"))
OUT_DIR.mkdir(exist_ok=True)
for old in OUT_DIR.glob("*.json"): old.unlink()
for k, v in shards.items():
    v.sort()
    (OUT_DIR / f"{k}.json").write_text(json.dumps(v, separators=(",", ":")))
sizes = sorted((p.stat().st_size, p.name) for p in OUT_DIR.glob("*.json"))
print(f"voters: {n:,} | precincts: {len(counts)} | active: {sum(c['active'] for c in counts.values()):,}")
print(f"shards: {len(sizes)} | total {sum(s for s, _ in sizes)/1e6:.1f} MB | largest {sizes[-1][1]} {sizes[-1][0]/1e6:.1f} MB")
