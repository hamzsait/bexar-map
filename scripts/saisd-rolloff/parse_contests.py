#!/usr/bin/env python3
"""Parse EVERY contest (not just SAISD) from the Bexar County precinct reports, May 2017-2025.

Reads the cached source files in bexar-map/scripts/.saisd-cache/ (read-only) and writes
contests_long.csv: one row per (year, precinct, contest) with votes, undervotes, overvotes.

  python3 -I parse_contests.py
"""
import csv, html, re, sys
from collections import OrderedDict
from pathlib import Path
import pypdf

HERE = Path(__file__).resolve().parent
CACHE = HERE.parent / ".saisd-cache"
OUTDIR = CACHE / "rolloff"; OUTDIR.mkdir(parents=True, exist_ok=True)
FILES = {2017: ("2017.htm", "htm"), 2019: ("2019.htm", "htm"), 2021: ("2021.pdf", "pdf"),
         2023: ("2023.pdf", "pdf"), 2025: ("2025.csv", "csv")}
num = lambda s: int(s.replace(",", ""))


def parse_htm(path):
    """Old fixed-width report. Returns (stats{pct:(reg,ballots)}, rows, official{contest:{label:total}})."""
    L = html.unescape(re.sub(r"<[^>]+>", "", path.read_text(encoding="latin-1"))).splitlines()
    stats, rows, official = {}, [], {}
    i = 0
    # statistics block: "1001      709 . 162 22.85"  (also ". . 4" when ballots < 10)
    while i < len(L) and "VOTE FOR" not in L[i]:
        m = re.match(r"^(\d{4})\s+(\d+)\s[ .]*?(\d+)\s+[\d.]+\s*$", L[i])
        if m: stats[m.group(1)] = (int(m.group(2)), int(m.group(3)))
        i += 1
    while i < len(L):
        m = re.match(r"\s*VOTE FOR\s+(\d+)", L[i])
        if not m: i += 1; continue
        title, vote_for = L[i - 1].strip(), int(m.group(1))
        legend = {}
        i += 1
        while not re.match(r"\s*-{5,}", L[i]):
            for n, name, tot in re.findall(r"(\d\d) = (.+?)\s{2,}([\d,]+)(?:\s+[\d.]+)?(?=\s{3,}|\s*$)", L[i]):
                legend[n] = (re.sub(r"\s+", " ", name).strip(), num(tot))
            i += 1
        cols = L[i + 1].split()
        assert set(cols) == set(legend), (title, cols, legend)
        names = [legend[c][0] for c in cols]
        official[title] = {legend[c][0]: legend[c][1] for c in cols}
        i += 3
        while i < len(L) and re.match(r"^\d{4}\s", L[i]):
            pct = L[i][:4]
            vals = [int(x) for x in L[i][4:].split()[-len(cols):]] if re.search(r"\d\s*$", L[i]) else None
            # rows like "7777 Medina County  0 0 0": keep only real 4-digit Bexar precincts
            if vals and len(vals) == len(cols) and not re.match(r"^\d{4}\s+[A-Za-z]", L[i]):
                d = dict(zip(names, vals))
                u, o = d.pop("UNDER VOTES"), d.pop("OVER VOTES")
                rows.append((pct, title, vote_for, sum(d.values()), u, o))
            i += 1
    return stats, rows, official


def sections_pdf(path):
    secs = OrderedDict()
    for page in pypdf.PdfReader(str(path)).pages:
        P = (page.extract_text() or "").split("\n")
        k = P.index("Bexar County")
        secs.setdefault(P[k + 1].split()[0], []).extend(
            l for l in P[k + 2:] if not l.startswith(("Precinct Summary -", "Report generated with")))
    return secs


def sections_csv(path):
    secs, cur = OrderedDict(), None
    for r in csv.reader(open(path, encoding="utf-8-sig", errors="replace")):
        cells = [c.strip() for c in r if c.strip()]
        if not cells: continue
        if len(cells) == 1 and re.match(r"^\d{4}\b", r[0].strip()):
            cur = r[0].split()[0]; secs.setdefault(cur, []); continue
        if cur and not cells[0].startswith(("Precinct Summary -", "Report generated with", "Summary Results Report", "May 3")):
            secs[cur].append(" ".join(cells))
    return secs


# "Name 12 5.00% 3 4 5"; zero-vote rows in an empty precinct print no percentage: "Name 0 0 0 0"
CAND = re.compile(r"^(.+?) ([\d,]+)(?: [\d.]+%)?(?: [\d,]+)*$")
HEADER_JUNK = ("TOTAL", "Day", "Absentee", "Voting", "Statistics", "Election")

def parse_electionware(secs):
    stats, rows, problems = {}, [], []
    for pct, L in secs.items():
        reg = bal = None
        title_buf, i = [], 0
        while i < len(L):
            l = L[i]
            m = re.match(r"^Registered Voters - Total ([\d,]+)", l)
            if m: reg = num(m.group(1))
            m = re.match(r"^Ballots Cast - Total ([\d,]+)", l)
            if m: bal = num(m.group(1))
            if re.match(r"^(Registered Voters|Ballots Cast|Voter Turnout|Statistics)", l) or l in ("Day", "Voting") \
               or l.startswith(("Absentee Early", "Undervotes", "Overvotes", "Total Votes Cast")):
                title_buf = []; i += 1; continue
            m = re.match(r"^Vote For (\d+)", l)
            if not m:
                title_buf.append(l); i += 1; continue
            title, vote_for = re.sub(r"\s+", " ", " ".join(title_buf)).strip(), int(m.group(1))
            title_buf, csum, tv, u, o = [], 0, None, None, None
            i += 1
            while i < len(L):
                l = L[i]
                if l.startswith("Total Votes Cast"): tv = num(re.findall(r"[\d,]+", l[16:])[0])
                elif l.startswith("Overvotes"): o = num(l.split()[1])
                elif l.startswith("Undervotes"): u = num(l.split()[1]); i += 1; break
                else:
                    c = CAND.match(l)
                    if c: csum += num(c.group(2))
                    elif not l.startswith(HEADER_JUNK): problems.append((pct, title, l))
                i += 1
            if tv is None or u is None or o is None or csum != tv: problems.append((pct, title, "sum", csum, tv, u, o))
            rows.append((pct, title, vote_for, tv, u, o))
        stats[pct] = (reg, bal)
    return stats, rows, problems


def canon(title):
    """Normalise contest titles across formats -> (kind, label)."""
    t = title
    if re.search(r"san antonio", t, re.I) and re.search(r"mayor", t, re.I): return "mayor", "Mayor, City of San Antonio"
    m = re.search(r"CITY OF SAN ANTONIO Council, Place No\. (\d+)|For Council, City of San Antonio, District (\d+)|For Council, District (\d+) City of San Antonio", t, re.I)
    if m: return "council", "City Council D%s" % next(g for g in m.groups() if g)
    m = re.search(r"SAN ANTONIO ISD Trustee, District No\. (\d+)|For Trustee, (?:Single-Member )?District(?: No\.)? (\d+) San Antonio Independent School", t)
    if m: return "saisd", "SAISD Trustee D%s" % next(g for g in m.groups() if g)
    m = re.match(r"CITY OF SAN ANTONIO\s*-?\s*Proposition\s*(?:No\. )?(\w+)", t, re.I)
    if m: return "city_prop", "City of San Antonio Prop %s" % m.group(1)
    if re.search(r"alamo c", t, re.I): return "acc", re.sub(r"\s+", " ", t).title().replace("District ", "District ")
    return "other", t


def main():
    out = csv.writer(open(OUTDIR / "contests_long.csv", "w", newline=""))
    out.writerow(["year", "precinct", "registered", "ballots_cast", "kind", "contest", "raw_title", "vote_for",
                  "votes", "undervotes", "overvotes", "contest_ballots"])
    for year, (fn, kind) in FILES.items():
        p = CACHE / fn
        if kind == "htm":
            stats, rows, official = parse_htm(p)
            # internal check: per-precinct rows must add up to the legend (official) totals
            agg = {}
            for pct, t, vf, v, u, o in rows:
                a = agg.setdefault(t, [0, 0, 0]); a[0] += v; a[1] += u; a[2] += o
            bad = 0
            for t, leg in official.items():
                ou, oo = leg["UNDER VOTES"], leg["OVER VOTES"]
                ov = sum(x for k, x in leg.items() if not k.endswith(" VOTES"))
                if agg.get(t) != [ov, ou, oo]: bad += 1; print("  MISMATCH vs legend", year, t, agg.get(t), [ov, ou, oo])
            print(year, "contests:", len(official), "legend mismatches:", bad, "precincts w/ stats:", len(stats))
        else:
            stats, rows, problems = parse_electionware(sections_pdf(p) if kind == "pdf" else sections_csv(p))
            print(year, "contests:", len({r[1] for r in rows}), "parse problems:", len(problems), "precincts:", len(stats))
            for x in problems[:15]: print("   ", x)
        for pct, t, vf, v, u, o in rows:
            k, label = canon(t)
            reg, bal = stats.get(pct, (None, None))
            tot = v + u + o
            out.writerow([year, pct, reg, bal, k, label, t, vf, v, u, o, tot // vf if tot % vf == 0 else round(tot / vf, 2)])

if __name__ == "__main__":
    main()
