#!/usr/bin/env python3
"""Write SAISD/saisd-rolloff.json (the chart's data) from rolloff_summary.csv.

Run in order:  parse_contests.py -> build_rolloff.py -> export_json.py
Inputs are the official Bexar County precinct reports cached by scripts/build-saisd.py.

Roll-off % = undervotes / (votes + undervotes + overvotes) for a contest, over the ballots
that carried it, in the precincts of each SAISD trustee race ("ALL" = that year's races pooled).
"matched" figures use only precincts where mayor, council and trustee were on the same ballots.
"""
import csv, json
from pathlib import Path
HERE = Path(__file__).resolve().parent
rows = list(csv.DictReader(open(HERE.parent / ".saisd-cache" / "rolloff" / "rolloff_summary.csv")))
def f(x): return round(float(x), 2)
out = []
for r in rows:
    out.append({"year": int(r["year"]), "district": r["saisd_district"],
                "mayor": f(r["mayor_rolloff_pct_all"]), "council": f(r["council_rolloff_pct_all"]), "trustee": f(r["trustee_rolloff_pct_all"]),
                "ballots": int(r["trustee_ballots_all"]),
                "matched": {"share": f(r["matched_share_of_trustee_ballots_pct"]), "mayor": int(r["mayor_votes_matched"]),
                            "council": int(r["council_votes_matched"]), "trustee": int(r["trustee_votes_matched"]),
                            "drop": f(r["drop_mayor_to_trustee_pct"])}})
p = HERE.parent.parent / "SAISD" / "saisd-rolloff.json"
p.write_text(json.dumps(out, separators=(",", ":")))
print("wrote", p, len(out), "rows")
