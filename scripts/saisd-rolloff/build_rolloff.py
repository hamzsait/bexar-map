#!/usr/bin/env python3
"""Ballot roll-off in SAISD trustee elections vs. the contests above them on the ballot.

Input : contests_long.csv (from parse_contests.py), saisd-data.json (cross-check only)
Output: rolloff_by_race.csv, rolloff_summary.csv, rolloff_by_precinct.csv

Definitions
  contest_ballots = votes + undervotes + overvotes  (ballots that carried the contest in that precinct)
  roll-off %      = undervotes / contest_ballots
  precinct_set
    all     = every precinct that reports the SAISD race (split precincts included: there the mayor /
              council / proposition figures also include voters who live outside that trustee district)
    matched = precincts where mayor, council and trustee were on the same ballots: each one's
              contest_ballots within TOL of the precinct's ballots cast... i.e. of the mayor's ballots
              (mayor > 0). Only there are raw vote counts comparable ("votes for mayor vs trustee").

  python3 -I build_rolloff.py
"""
import csv, json, collections
from pathlib import Path

HERE = Path(__file__).resolve().parent
JSON = HERE.parent.parent / "SAISD" / "saisd-data.json"
OUTDIR = HERE.parent / ".saisd-cache" / "rolloff"
TOL = 0.03
pct = lambda a, b: "" if not b else round(100 * a / b, 2)

R = list(csv.DictReader(open(OUTDIR / "contests_long.csv")))
for r in R:
    for k in ("votes", "undervotes", "overvotes", "vote_for"): r[k] = int(r[k])
    r["ballots"] = (r["votes"] + r["undervotes"] + r["overvotes"]) / r["vote_for"]
by = collections.defaultdict(list)
for r in R: by[(r["year"], r["precinct"])].append(r)

# ---- cross-check trustee numbers against saisd-data.json ----
J = json.load(open(JSON))
for el in J["elections"]:
    for race in el["races"]:
        lab = "SAISD Trustee D%d" % race["district"]
        mine = {r["precinct"]: r for r in R if r["year"] == str(el["year"]) and r["contest"] == lab}
        assert set(mine) == set(race["precincts"]), (el["year"], lab)
        for p, v in race["precincts"].items():
            assert (mine[p]["votes"], mine[p]["undervotes"], mine[p]["overvotes"]) == (sum(v[:-2]), v[-2], v[-1]), (el["year"], lab, p)
print("trustee votes / undervotes / overvotes match saisd-data.json for every precinct of every race")

ORDER = {"mayor": 0, "council_all": 1, "council": 2, "city_prop": 3, "acc": 4, "saisd": 5, "other": 6}
COUNCIL_ALL = "City Council (all districts in these precincts)"
race_rows, sum_rows, pct_rows = [], [], []
short = lambda c: c.replace("City of San Antonio ", "").replace("Alamo Community College District", "ACC")

def analyse(year, dist, tlabels):
    """tlabels: the SAISD contest label(s) that define the precinct set (one district, or all of that year's)."""
    tr = collections.defaultdict(list)                       # precinct -> trustee rows
    for r in R:
        if r["year"] == year and r["contest"] in tlabels: tr[r["precinct"]].append(r)
    tsum = lambda p, k: sum(r[k] for r in tr[p])
    info = {}
    for p in sorted(tr):
        cs = by[(year, p)]
        m = [r for r in cs if r["kind"] == "mayor"]
        c = [r for r in cs if r["kind"] == "council"]
        mb, cb, tb = sum(r["ballots"] for r in m), sum(r["ballots"] for r in c), tsum(p, "ballots")
        if tb == 0: status = "no_trustee_ballots"
        elif not m or mb == 0: status = "no_mayor_on_ballot"      # SAISD territory outside the City of San Antonio
        elif abs(tb - mb) <= TOL * mb and abs(cb - mb) <= TOL * mb: status = "matched"
        else: status = "split"
        info[p] = status
        if dist != "ALL":
            pct_rows.append([year, dist, p, tr[p][0]["ballots_cast"], status, ";".join(r["contest"] for r in c),
                             int(mb), sum(r["votes"] for r in m), sum(r["undervotes"] for r in m),
                             int(cb), sum(r["votes"] for r in c), sum(r["undervotes"] for r in c),
                             int(tb), tsum(p, "votes"), tsum(p, "undervotes"), tsum(p, "overvotes")])
    summ = {}
    tname = tlabels[0] if len(tlabels) == 1 else "SAISD Trustee (all districts on ballot)"
    for pset in ("all", "matched"):
        ps = [p for p in tr if pset == "all" or info[p] == "matched"]
        groups = collections.defaultdict(list)
        for p in ps:
            for r in by[(year, p)]:
                if r["contest"] in tlabels: groups[("saisd", tname)].append(r)
                else: groups[(r["kind"], r["contest"])].append(r)
                if r["kind"] == "council": groups[("council_all", COUNCIL_ALL)].append(r)
        for (kind, contest), rows in sorted(groups.items(), key=lambda x: (ORDER[x[0][0]], x[0][1] != tname, x[0][1])):
            b = sum(r["ballots"] for r in rows); v = sum(r["votes"] for r in rows)
            u = sum(r["undervotes"] for r in rows); o = sum(r["overvotes"] for r in rows)
            live = {r["precinct"] for r in rows if r["ballots"] > 0}
            if b == 0 and contest != tname: continue          # listed on a split precinct but no ballots here
            if dist == "ALL" and kind in ("council", "other"): continue
            race_rows.append([year, dist, pset, kind, contest, len({r["precinct"] for r in rows}), len(live),
                              int(b) if b == int(b) else b, v, u, o, pct(u, b), pct(o, b)])
            key = "trustee" if contest == tname else kind
            if key in ("mayor", "council_all", "trustee"): summ[(pset, key)] = (b, v, u, o)
            if kind in ("city_prop", "acc"): summ.setdefault((pset, "measures"), []).append((contest, pct(u, b)))
    st = collections.Counter(info.values())
    g = lambda ps, k, i: summ.get((ps, k), (0, 0, 0, 0))[i]
    ro = lambda ps, k: pct(g(ps, k, 2), g(ps, k, 0))
    tb_all = g("all", "trustee", 0)
    nomayor_b = sum(tsum(p, "ballots") for p in tr if info[p] == "no_mayor_on_ballot")
    mv, cv, tv = g("matched", "mayor", 1), g("matched", "council_all", 1), g("matched", "trustee", 1)
    sum_rows.append([year, dist, len(tr), sum(1 for p in tr if tsum(p, "ballots") > 0),
                     int(tb_all), g("all", "trustee", 1), g("all", "trustee", 2),
                     ro("all", "mayor"), ro("all", "council_all"), ro("all", "trustee"),
                     "; ".join("%s %.2f%%" % (short(c), x) for c, x in summ.get(("all", "measures"), [])),
                     st["matched"], st["split"], st["no_mayor_on_ballot"], st["no_trustee_ballots"],
                     int(g("matched", "trustee", 0)), pct(g("matched", "trustee", 0), tb_all), int(nomayor_b),
                     ro("matched", "mayor"), ro("matched", "council_all"), ro("matched", "trustee"),
                     mv, cv, tv, pct(mv - cv, mv), pct(cv - tv, cv), pct(mv - tv, mv)])

for year in sorted({r["year"] for r in R}):
    labels = sorted({r["contest"] for r in R if r["year"] == year and r["kind"] == "saisd"})
    for t in labels: analyse(year, t.split("D")[-1], [t])
    analyse(year, "ALL", labels)        # that year's SAISD races pooled, each precinct counted once

def write(name, header, rows):
    with open(OUTDIR / name, "w", newline="") as f:
        w = csv.writer(f); w.writerow(header); w.writerows(rows)
write("rolloff_by_race.csv", ["year", "saisd_district", "precinct_set", "contest_kind", "contest", "precincts", "precincts_with_ballots",
      "ballots_carrying_contest", "votes_cast", "undervotes", "overvotes", "rolloff_pct", "overvote_pct"],
      sorted(race_rows, key=lambda r: (r[0], r[1] == "ALL", r[1], r[2], ORDER[r[3]])))
write("rolloff_summary.csv", ["year", "saisd_district", "precincts", "precincts_with_trustee_ballots",
      "trustee_ballots_all", "trustee_votes_all", "trustee_undervotes_all",
      "mayor_rolloff_pct_all", "council_rolloff_pct_all", "trustee_rolloff_pct_all", "other_measures_rolloff_pct_all",
      "matched_precincts", "split_precincts", "precincts_no_mayor_on_ballot", "precincts_no_trustee_ballots",
      "matched_trustee_ballots", "matched_share_of_trustee_ballots_pct", "trustee_ballots_in_precincts_without_mayor",
      "mayor_rolloff_pct_matched", "council_rolloff_pct_matched", "trustee_rolloff_pct_matched",
      "mayor_votes_matched", "council_votes_matched", "trustee_votes_matched",
      "drop_mayor_to_council_pct", "drop_council_to_trustee_pct", "drop_mayor_to_trustee_pct"],
      sorted(sum_rows, key=lambda r: (r[0], r[1] == "ALL", r[1])))
write("rolloff_by_precinct.csv", ["year", "saisd_district", "precinct", "precinct_ballots_cast", "status", "council_contests",
      "mayor_ballots", "mayor_votes", "mayor_undervotes", "council_ballots", "council_votes", "council_undervotes",
      "trustee_ballots", "trustee_votes", "trustee_undervotes", "trustee_overvotes"], pct_rows)

print("\nyear dist | ALL precincts: mayor/council/trustee roll-off % | MATCHED n(share of trustee ballots): roll-off M/C/T | votes M/C/T | drop M->T")
for r in sorted(sum_rows, key=lambda r: (r[0], r[1] == "ALL", r[1])):
    print(f"{r[0]} D{r[1]:<3} | {r[7]:>5} {r[8]:>5} {r[9]:>5} | n={r[11]:<2} split={r[12]} noMayor={r[13]}({r[17]}) empty={r[14]} share={r[16]}% | {r[18]:>5} {r[19]:>5} {r[20]:>5} | {r[21]:>6} {r[22]:>6} {r[23]:>6} | {r[24]}% {r[25]}% {r[26]}% | {r[10]}")
