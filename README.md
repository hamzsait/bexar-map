# Bexar County Public Map

Read-only interactive map of Bexar County, Texas with all 806 voting precinct
boundaries, a voter lookup, address search, and a polling place finder. It's the
countywide counterpart of [district1-map](https://github.com/hamzsait/district1-map)
(Austin City Council District 1) and works the same way, including the embed.

| File | What |
|------|------|
| `bx-outline.geojson` | Bexar County boundary (dissolved from the precincts) |
| `bx-precincts.geojson` | 806 Bexar County voting precincts; only property is `p` (precinct number) |
| `bx-voters.json` | Registered/active voter counts per precinct (shown in hover tooltips) |
| `bx-voters/XX.json` | Voter lookup shards: `[name, precinct, active, registered address]`, one file per first two letters of the last name. The widget loads only the shards for the words typed (~0.1–4 MB each) |
| `bx-polling.json` | Nov 3, 2026 early-voting sites (geocoded), with hours |
| `bx-map.js` | Tiny bootstrap the website points at. **Never changes.** Loads `bx-widget.js` from GitHub Pages |
| `bx-widget.js` | The whole widget: markup, styles, Leaflet loader, search, geolocation |
| `embed.html` | The 2-line snippet to paste into Squarespace |
| `index.html` | Standalone page (GitHub Pages / local preview / iframe target) |

## Data sources

- **Precincts:** Bexar County GIS, `maps.bexar.org` → `EL/VoterPrecincts`. Rebuild with `python3 scripts/build-data.py` (needs `shapely`).
- **Voters:** the Bexar County Elections Dept. voter list report (a public record under Tex. Elec. Code §18.008), delivered as one file per commissioner precinct. Current data: **September 24, 2026** (1,316,595 voters: 1,156,918 active, 159,677 suspense). Rebuild with a fresh list:

  ```sh
  python3 scripts/build-voters.py VoterList_BexarCounty_Pct1_Sep2026.csv VoterList_BexarCounty_Pct2_Sep2026.csv VoterList_BexarCounty_Pct3_Sep2026.csv VoterList_BexarCounty_Pct4_Sep2026.csv
  ```

  The script accepts the older files, which have a combined "Residential Address" column, and the Sep 2026 files, which only have the address parts (Street Number 1, Pre-Direction, Street Name 1, …) and are assembled into one address. It never uses the mailing address.
  Only name, status, residential address, and precinct are kept. VUID, DOB, gender, mailing address, vote history, and everything else are dropped. Addresses in the address-confidentiality program arrive from the county as `***` and are shown as "Address confidential".
- **Polling places:** the county's official [Early Voting Sites and Hours PDF](https://elections.bexar.gov/DocumentCenter/View/1712) for Nov 3, 2026, transcribed into `scripts/polling-locations.csv`. Rebuild with `python3 scripts/build-polling.py`, which geocodes with the county locator and falls back to Census. **Election Day vote centers aren't published yet.** When the county posts them (usually in October), add them as `kind=ed` rows (or `both` for sites used for both) and rerun the script. The widget shows a placeholder card until then.
- **Geocoder:** `maps.bexar.org/arcgis/rest/services/Locators/BeCoMultiRole/GeocodeServer`, Bexar County's own public locator. It has typeahead and CORS, and needs no API key. It only knows Bexar County addresses, so out-of-county searches report "Couldn't find that address". If it were ever retired, `suggest()`/`geocode()` in `bx-widget.js` are the only two functions to swap.

## Features

Three tools, shown as tabs. Choose which appear with `data-mode` on the embed div: `voter`, `address`, `polling`, or a comma list, e.g. `<div id="bx-map-root" data-mode="polling"></div>`.

- **Voter lookup.** Type a name in any order ("Maria Garcia" or "Garcia Maria"). Every word must match the start of a word in the name. Results show Active/Suspense, registered address, and precinct, with exact last+first name matches ranked first. Clicking a result pins the address.
- **Address search** with autocomplete and **Use my location**. Shows **In Bexar County · Precinct N**, computed in-browser against the GeoJSON.
- **Polling place finder.** Shows the closest early-voting site (with that site's hours; branch sites are weekday-only) and, once published, the closest Election Day site. Includes a Google Maps directions link. Bexar County uses countywide vote centers, and the UI says so.
- Precinct hover tooltips with registered/active voter counts.

## SAISD board elections page (`/SAISD/`)

**https://hamzsait.github.io/bexar-map/SAISD/** shows San Antonio ISD trustee results by voting precinct for the May 2017, 2019, 2021, 2023 and 2025 elections. Pick a year and either "All races" or a single district. Precincts are colored by the leading candidate, and darker means a bigger margin. Hover or tap a precinct for its vote counts. Links work per view, e.g. `/SAISD/#2021-d7`.

| File | What |
|------|------|
| `SAISD/index.html` | The page |
| `SAISD/saisd.js` | The widget (embeddable: `<div id="saisd-root"></div><script src="https://hamzsait.github.io/bexar-map/SAISD/saisd.js"></script>`; optional `data-year`, `data-title`, `data-header="off"`) |
| `SAISD/saisd-data.json` | Results + precinct shapes, built by `python3 scripts/build-saisd.py` |
| `SAISD/saisd-rolloff.json` | Data for the "How many voters skip the school board race?" chart under the map. It's the share of ballots left blank for mayor, city council and SAISD trustee in SAISD precincts, per election. Rebuild with `scripts/saisd-rolloff/parse_contests.py` → `build_rolloff.py` → `export_json.py` (same cached county reports) |

Sources and caveats:

- **Results:** Bexar County Elections official precinct reports, parsed from the HTML (2017, 2019), PDF (2021, 2023) and CSV (2025) versions. Candidate totals match the county's official summary reports exactly.
- **Precinct shapes:** each election uses the precinct boundaries in force that year.
  - 2017 uses the Texas Legislative Council's 2016 general-election precincts, from [VEST on Harvard Dataverse](https://doi.org/10.7910/DVN/NH5S2I). Bexar renumbered and redrew precincts between May 2017 and late 2018, so 2020 shapes would put several 2017 precincts in the wrong place.
  - 2019 and 2021 use TLC's 2020 file (the same as 2018 for these precincts), 2023 uses 2022, and 2025 uses 2024.
  - Precincts TLC stores in lettered parts (e.g. 2039A/2039B) are merged back together, so every precinct in every race is mapped.
  - Geometry is clipped to the SAISD boundary.
- **Trustee districts:** SAISD redrew its trustee districts in 2022, so 2017–2021 use the old plan and 2023–2025 the new one. Uncontested seats with no election (2017 D7, 2025 D4 and D7) are noted on the page.
- **Display:** ties are drawn gray, and precincts with fewer than 25 votes are drawn fainter.
- **District outlines** are the union of the precincts that voted in each race, because SAISD doesn't publish its trustee districts as GIS data. They're approximate where a precinct is split between districts.
- **Independent check (Oct 2026):** a separate parse of all five official reports matched every precinct row in all 15 races, and every race total matched the county's official summaries.
- **SAISD boundary:** Census TIGERweb.

## Embed in Squarespace

Push this folder to a public GitHub repo named `bexar-map` under `hamzsait` and enable GitHub Pages (main branch, root). Then paste into a Code Block:

```html
<div id="bx-map-root"></div>
<script src="https://hamzsait.github.io/bexar-map/bx-map.js"></script>
```

Or use an iframe:

```html
<iframe src="https://hamzsait.github.io/bexar-map/" style="width:100%;height:640px;border:0" allow="geolocation" loading="lazy" title="Bexar County map"></iframe>
```

If the repo gets a different name, update `PAGES` in `bx-map.js` and the URLs above.

## Preview locally

```sh
python3 -m http.server 8080
# open http://localhost:8080
```
