/*!
 * SAISD board election results by precinct — https://github.com/hamzsait/bexar-map (SAISD/)
 *
 * Embed with:
 *   <div id="saisd-root"></div>
 *   <script src="https://hamzsait.github.io/bexar-map/SAISD/saisd.js"></script>
 * Optional on the div: data-year="2023" (default: latest), data-title="...", data-header="off".
 *
 * Data: saisd-data.json next to this file (built by scripts/build-saisd.py).
 * Same state rules as the main map: one canvas for precincts, one highlighted
 * precinct at a time, and switching year/race rebuilds the layer from scratch.
 */
(function () {
  var LEAFLET_CSS = { href: "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css", integrity: "sha256-p4NxAoJBhIIN+hmNHrzRCf9tD/miZyoHS5obTRR9BMY=" };
  var LEAFLET_JS  = { src:  "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js",  integrity: "sha256-20nQCchB9co0qIjJZRGuk2/Z9VM+kNiyxNV1lvTlZBo=" };

  var me = document.currentScript || (function () { var s = document.getElementsByTagName("script"); return s[s.length - 1]; })();
  var HERE = me && me.src ? me.src.replace(/\/[^\/]*$/, "") : ".";
  function here(p) { return HERE.replace(/\/$/, "") + "/" + p; }

  var root = document.getElementById("saisd-root") || (function () {
    var d = document.createElement("div"); d.id = "saisd-root"; me.parentNode.insertBefore(d, me); return d;
  })();
  if (root.getAttribute("data-sd-loaded")) return;
  root.setAttribute("data-sd-loaded", "1");

  var INK = "#1a1a1a", RED = "#ec1f27", RED_DARK = "#c4161d", MUTED = "#666666";
  // Candidate colors by finish (winner first). Red is reserved for the brand/outlines.
  var CAND_COLORS = ["#1d4ed8", "#f59e0b", "#059669", "#7c3aed"], TIE = "#8a8a8a";

  var CSS = [
    "#sd-wrap { font-family: inherit; color:#fff; background:" + RED + "; border-radius:20px; padding:18px; box-sizing:border-box; width:100%; line-height:1.35; text-align:left; }",
    "#sd-wrap *, #sd-wrap *::before, #sd-wrap *::after { box-sizing:border-box; }",
    "#sd-wrap .sd-header { display:flex; align-items:center; gap:16px; margin:0 0 16px; }",
    "#sd-wrap .sd-logo { flex:0 0 88px; width:88px; height:88px; border-radius:50%; background:#fff; display:flex; align-items:center; justify-content:center; box-shadow:0 2px 8px rgba(0,0,0,.18); }",
    "#sd-wrap .sd-logo img { width:70px; height:auto; display:block; margin:0; }",
    "#sd-wrap .sd-title { font-size:26px; font-weight:800; letter-spacing:-.01em; line-height:1.15; text-transform:uppercase; color:#fff; }",
    "#sd-wrap .sd-sub { font-size:14px; font-weight:500; margin-top:3px; color:#fff; }",
    "#sd-wrap .sd-row { display:flex; gap:8px; flex-wrap:wrap; align-items:center; margin:0 0 10px; }",
    "#sd-wrap .sd-label { font-size:13px; font-weight:700; text-transform:uppercase; letter-spacing:.05em; margin-right:4px; min-width:52px; color:#fff; }",
    "#sd-wrap .sd-tab { margin:0; -webkit-appearance:none; appearance:none; text-transform:none; font-family:inherit; line-height:1.2; padding:9px 18px; border-radius:999px; font-size:14px; font-weight:600; letter-spacing:0; cursor:pointer; background:#fff; color:" + INK + "; border:2px solid " + INK + "; }",
    "#sd-wrap .sd-tab.active { background:" + INK + "; color:#fff; }",
    "#sd-wrap .sd-tab small { font-weight:500; opacity:.75; margin-left:4px; }",
    "#sd-card { background:#fff; color:" + INK + "; border-radius:14px; padding:12px 14px; margin:0 0 12px; font-size:15px; }",
    "#sd-card .sd-races { display:flex; gap:10px; flex-wrap:wrap; }",
    "#sd-card .sd-race { flex:1 1 260px; border:2px solid " + INK + "; border-radius:14px; padding:10px 12px; }",
    "#sd-card .sd-race.clickable { cursor:pointer; } #sd-card .sd-race.clickable:hover { background:#fdeceb; }",
    "#sd-card .sd-kicker { font-size:12px; font-weight:700; letter-spacing:.05em; text-transform:uppercase; color:" + RED_DARK + "; margin-bottom:4px; }",
    "#sd-card .sd-cand { display:flex; align-items:center; gap:8px; margin:3px 0; font-size:14px; }",
    "#sd-card .sd-sw { flex:0 0 12px; width:12px; height:12px; border-radius:3px; }",
    "#sd-card .sd-name { flex:1 1 auto; min-width:0; }",
    "#sd-card .sd-num { font-variant-numeric:tabular-nums; white-space:nowrap; color:" + MUTED + "; }",
    "#sd-card .sd-bar { height:6px; border-radius:3px; background:#eee; margin:0 0 4px 20px; overflow:hidden; }",
    "#sd-card .sd-bar span { display:block; height:100%; }",
    "#sd-card .sd-note { font-size:12.5px; color:" + MUTED + "; margin-top:8px; }",
    "#sd-card .sd-note a { color:" + INK + "; }",
    "#sd-map { height:600px; width:100%; border-radius:16px; overflow:hidden; background:#f2f2f2; border:3px solid #fff; }",
    "#sd-map.leaflet-container { font: 13px/1.4 Roboto, -apple-system, BlinkMacSystemFont, \"Segoe UI\", sans-serif; }",
    "#sd-map.leaflet-container:focus:not(:focus-visible) { outline:none; }",
    "#sd-map .leaflet-tile-pane { filter: grayscale(1) contrast(.9) brightness(1.06); }",
    "#sd-map .sd-tip { background:#fff; color:" + INK + "; border:2px solid " + INK + "; border-radius:10px; padding:8px 10px; box-shadow:0 4px 12px rgba(0,0,0,.2); min-width:190px; }",
    "#sd-map .sd-tip::before { display:none; }",
    "#sd-map .sd-tip .sd-cand { display:flex; gap:6px; align-items:center; font-size:12.5px; margin:2px 0; }",
    "#sd-map .sd-tip .sd-sw { width:10px; height:10px; border-radius:2px; flex:0 0 10px; }",
    "#sd-map .sd-tip .sd-v { margin-left:auto; padding-left:10px; font-variant-numeric:tabular-nums; }",
    "#sd-map .sd-dlabel { background:" + INK + "; color:#fff; border:0; border-radius:999px; padding:2px 8px; font-weight:700; font-size:12px; box-shadow:none; }",
    "#sd-map .sd-dlabel::before { display:none; }",
    "#sd-map .sd-legend { background:#fff; color:" + INK + "; padding:8px 12px; border-radius:10px; border:2px solid " + INK + "; line-height:1.6; font-size:12.5px; max-width:240px; }",
    "#sd-map .sd-legend .sd-sw { display:inline-block; width:12px; height:12px; border-radius:3px; vertical-align:-1px; margin-right:6px; }",
    "#sd-map .sd-ramp { display:flex; height:8px; border-radius:4px; overflow:hidden; margin:3px 0 1px; }",
    "#sd-map .sd-ramp span { flex:1; }",
    "#sd-map .leaflet-control-attribution { font-size:10.5px; }",
    // drop-off chart (roles: --sd-s1 mayor, --sd-s2 council, --sd-s3 trustee; text stays in ink tokens)
    "#sd-rolloff { --sd-s1:#2a78d6; --sd-s2:#eb6834; --sd-s3:#1baf7a; background:#fff; color:" + INK + "; border-radius:14px; padding:16px 16px 12px; margin:12px 0 0; }",
    "#sd-rolloff:empty { display:none; }",
    "#sd-rolloff h3 { margin:0; font-size:19px; font-weight:800; line-height:1.2; color:" + INK + "; text-transform:none; letter-spacing:0; }",
    "#sd-rolloff .sd-ro-sub { font-size:13.5px; color:" + MUTED + "; margin:3px 0 10px; }",
    "#sd-rolloff .sd-ro-legend { display:flex; flex-wrap:wrap; gap:6px 16px; font-size:13px; margin:0 0 6px; }",
    "#sd-rolloff .sd-ro-legend span { display:inline-flex; align-items:center; gap:6px; }",
    "#sd-rolloff .sd-ro-legend i { width:12px; height:12px; border-radius:3px; display:inline-block; }",
    "#sd-rolloff .sd-ro-plot { position:relative; }",
    "#sd-rolloff svg { display:block; width:100%; height:auto; overflow:visible; }",
    "#sd-rolloff svg text { font-family:inherit; fill:" + MUTED + "; }",
    "#sd-rolloff svg .sd-ro-val { fill:" + INK + "; font-weight:700; }",
    "#sd-rolloff svg .sd-ro-year { fill:" + INK + "; font-weight:600; }",
    "#sd-rolloff svg .sd-ro-grp { cursor:default; }",
    "#sd-rolloff svg .sd-ro-grp .sd-ro-band { fill:transparent; }",
    "#sd-rolloff svg .sd-ro-grp:hover .sd-ro-band, #sd-rolloff svg .sd-ro-grp:focus .sd-ro-band { fill:rgba(0,0,0,.045); }",
    "#sd-rolloff svg .sd-ro-grp:focus { outline:none; }",
    "#sd-rolloff .sd-ro-tip { position:absolute; z-index:5; pointer-events:none; background:#fff; color:" + INK + "; border:2px solid " + INK + "; border-radius:10px; padding:8px 10px; font-size:12.5px; line-height:1.45; box-shadow:0 4px 12px rgba(0,0,0,.2); min-width:200px; }",
    "#sd-rolloff .sd-ro-tip[hidden] { display:none; }",
    "#sd-rolloff .sd-ro-tip .r { display:flex; align-items:center; gap:6px; }",
    "#sd-rolloff .sd-ro-tip .r i { width:10px; height:10px; border-radius:2px; flex:0 0 10px; }",
    "#sd-rolloff .sd-ro-tip .r b { margin-left:auto; padding-left:12px; font-variant-numeric:tabular-nums; }",
    "#sd-rolloff .sd-ro-take { font-size:14.5px; margin:10px 0 4px; }",
    "#sd-rolloff .sd-ro-note { font-size:12.5px; color:" + MUTED + "; margin:4px 0 0; }",
    "#sd-rolloff .sd-ro-toggle { margin:8px 0 0; -webkit-appearance:none; appearance:none; font-family:inherit; font-size:13px; font-weight:600; text-transform:none; letter-spacing:0; line-height:1.2; padding:6px 14px; border-radius:999px; background:#fff; color:" + INK + "; border:2px solid " + INK + "; cursor:pointer; }",
    "#sd-rolloff .sd-ro-toggle:hover { background:#fdeceb; }",
    "#sd-rolloff .sd-ro-tablewrap { overflow-x:auto; margin-top:10px; }",
    "#sd-rolloff table { border-collapse:collapse; width:100%; font-size:13px; font-variant-numeric:tabular-nums; }",
    "#sd-rolloff th, #sd-rolloff td { padding:5px 8px; text-align:right; border-bottom:1px solid #e5e5e5; white-space:nowrap; background:none; color:" + INK + "; }",
    "#sd-rolloff th { font-weight:700; border-bottom:2px solid " + INK + "; }",
    "#sd-rolloff th:first-child, #sd-rolloff td:first-child { text-align:left; }",
    "#sd-rolloff tr.pooled td { font-weight:700; }",
    "@media (max-width:520px) {",
    "  #sd-wrap { padding:14px; border-radius:16px; }",
    "  #sd-wrap .sd-title { font-size:19px; }",
    "  #sd-wrap .sd-logo { flex-basis:64px; width:64px; height:64px; } #sd-wrap .sd-logo img { width:50px; }",
    "  #sd-wrap .sd-label { flex-basis:100%; }",
    "  #sd-map { height:440px; }",
    "  #sd-map .sd-legend { font-size:11px; padding:5px 8px; max-width:170px; }",
    "}"
  ].join("\n");
  var st = document.createElement("style"); st.textContent = CSS; document.head.appendChild(st);

  var TITLE = (root.getAttribute("data-title") || "SAISD Board Elections").replace(/[<>&"]/g, "");
  var header = root.getAttribute("data-header") === "off" ? "" :
    '<div class="sd-header"><span class="sd-logo"><img src="' + here("../sa-dsa-logo.png") + '" alt="San Antonio DSA" /></span>' +
    '<div><div class="sd-title">' + TITLE + '</div><div class="sd-sub">San Antonio ISD trustee races &middot; results by voting precinct, 2017&ndash;2025</div></div></div>';
  root.innerHTML = '<div id="sd-wrap">' + header +
    '<div class="sd-row" role="tablist" aria-label="Election year"><span class="sd-label">Year</span><span id="sd-years" style="display:contents"></span></div>' +
    '<div class="sd-row" role="tablist" aria-label="Race"><span class="sd-label">Race</span><span id="sd-races" style="display:contents"></span></div>' +
    '<div id="sd-card" role="status" aria-live="polite">Loading results&hellip;</div><div id="sd-map"></div><div id="sd-rolloff"></div></div>';

  function loadLeaflet(cb) {
    if (!document.querySelector('link[href="' + LEAFLET_CSS.href + '"]')) {
      var l = document.createElement("link"); l.rel = "stylesheet"; l.href = LEAFLET_CSS.href;
      l.integrity = LEAFLET_CSS.integrity; l.crossOrigin = ""; document.head.appendChild(l);
    }
    if (window.L && L.geoJSON) return cb();
    var s = document.createElement("script"); s.src = LEAFLET_JS.src; s.integrity = LEAFLET_JS.integrity;
    s.crossOrigin = ""; s.onload = cb;
    s.onerror = function () { document.getElementById("sd-card").innerHTML = "Map library failed to load. Please refresh the page."; };
    document.head.appendChild(s);
  }

  function esc(t) { return String(t).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
  function fmt(n) { return n.toLocaleString(); }
  function pct(a, b) { return b ? (100 * a / b).toFixed(1) + "%" : "&ndash;"; }
  function fmtDate(iso) {
    var d = new Date(iso + "T12:00:00");
    return d.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" });
  }
  // Fill strength from the winner's margin in that precinct (0 = tie, 50+ points = darkest),
  // faded for precincts with very few votes so a 3-vote precinct doesn't look like a landslide.
  var FEW_VOTES = 25;
  function shade(margin, votes) {
    var s = 0.18 + 0.67 * Math.min(1, Math.max(0, margin) / 0.5);
    return votes == null || votes >= FEW_VOTES ? s : Math.max(0.12, s * (0.35 + 0.65 * votes / FEW_VOTES));
  }

function start() {
  var $ = function (id) { return document.getElementById(id); };
  var card = $("sd-card");
  var map = L.map("sd-map", { scrollWheelZoom: false, zoomSnap: 0.25 }).setView([29.42, -98.49], 12);
  map.attributionControl.setPrefix(false);
  L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 18,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &middot; Results: Bexar County Elections &middot; Precincts: Texas Legislative Council, VEST'
  }).addTo(map);

  var DATA = null, year = null, race = "all";
  var precinctLayer = null, districtLayer = L.layerGroup().addTo(map), saisdLayer = null, legend = null, hovered = null, boundsAll = null;

  function unhighlight() { if (hovered) { precinctLayer.resetStyle(hovered); hovered.closeTooltip(); hovered = null; } }
  function highlight(layer) {
    if (hovered === layer) return;
    unhighlight(); hovered = layer;
    layer.setStyle({ weight: 3, color: INK, opacity: 1 });
    layer.bringToFront();
  }
  map.on("click", unhighlight);
  map.getContainer().addEventListener("mouseleave", unhighlight);
  function onResize() { map.invalidateSize(); }
  if (window.ResizeObserver) new ResizeObserver(onResize).observe($("sd-map"));

  fetch(here("saisd-data.json")).then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); }).then(function (d) {
    DATA = d;
    saisdLayer = L.geoJSON(d.saisd, { style: { color: INK, weight: 2.5, dashArray: "6 5", fill: true, fillColor: RED, fillOpacity: 0.04 }, interactive: false }).addTo(map);
    boundsAll = saisdLayer.getBounds();
    map.fitBounds(boundsAll, { padding: [10, 10], animate: false });
    var years = d.elections.map(function (e) { return e.year; });
    var want = parseInt(root.getAttribute("data-year"), 10);
    var hashYear = parseInt((location.hash.match(/(\d{4})/) || [])[1], 10);
    var hashRace = (location.hash.match(/[-\/]d(\d)/i) || [])[1];
    year = years.indexOf(hashYear) !== -1 ? hashYear : years.indexOf(want) !== -1 ? want : years[years.length - 1];
    $("sd-years").innerHTML = years.map(function (y) {
      return '<button type="button" class="sd-tab" role="tab" data-year="' + y + '">' + y + "</button>";
    }).join("");
    Array.prototype.forEach.call(document.querySelectorAll("#sd-years .sd-tab"), function (b) {
      b.addEventListener("click", function () { selectYear(parseInt(b.getAttribute("data-year"), 10), "all"); });
    });
    selectYear(year, hashRace ? parseInt(hashRace, 10) : "all");
  }).catch(function (e) {
    console.error("SAISD map:", e);
    card.innerHTML = '<span style="color:' + RED_DARK + '">The results didn&rsquo;t load. Please refresh the page.</span>';
  });

  function election() { for (var i = 0; i < DATA.elections.length; i++) if (DATA.elections[i].year === year) return DATA.elections[i]; }

  function selectYear(y, r) {
    year = y;
    var el = election();
    Array.prototype.forEach.call(document.querySelectorAll("#sd-years .sd-tab"), function (b) {
      var on = parseInt(b.getAttribute("data-year"), 10) === y;
      b.classList.toggle("active", on); b.setAttribute("aria-selected", on ? "true" : "false");
    });
    $("sd-races").innerHTML = '<button type="button" class="sd-tab" role="tab" data-race="all">All races</button>' +
      el.races.map(function (rc) { return '<button type="button" class="sd-tab" role="tab" data-race="' + rc.district + '">District ' + rc.district + "</button>"; }).join("");
    Array.prototype.forEach.call(document.querySelectorAll("#sd-races .sd-tab"), function (b) {
      b.addEventListener("click", function () { var v = b.getAttribute("data-race"); selectRace(v === "all" ? "all" : parseInt(v, 10)); });
    });
    var ok = r === "all" || el.races.some(function (rc) { return rc.district === r; });
    selectRace(ok ? r : "all");
  }

  function selectRace(r) {
    race = r;
    Array.prototype.forEach.call(document.querySelectorAll("#sd-races .sd-tab"), function (b) {
      var on = b.getAttribute("data-race") === String(r);
      b.classList.toggle("active", on); b.setAttribute("aria-selected", on ? "true" : "false");
    });
    try { history.replaceState(null, "", "#" + year + (r === "all" ? "" : "-d" + r)); } catch (e) {}
    draw();
  }

  // ---- map + card ----
  function draw() {
    var el = election(), races = race === "all" ? el.races : el.races.filter(function (rc) { return rc.district === race; });
    hovered = null;
    if (precinctLayer) map.removeLayer(precinctLayer);
    districtLayer.clearLayers();
    if (legend) map.removeControl(legend);

    var geo = {};
    [el.vintage].concat(Object.keys(DATA.vintages)).forEach(function (v) {
      (DATA.vintages[v] ? DATA.vintages[v].features : []).forEach(function (f) { if (!(f.properties.p in geo)) geo[f.properties.p] = f.geometry; });
    });
    // Prefer the election's own vintage, then any other vintage (fallback precincts).
    var own = {}; (DATA.vintages[el.vintage].features).forEach(function (f) { own[f.properties.p] = f.geometry; });

    // One feature per precinct. A precinct split between two races (rare) is drawn once, colored by
    // the race with more votes there; its tooltip lists both.
    var byPct = {};
    races.forEach(function (rc) {
      Object.keys(rc.precincts).forEach(function (p) { (byPct[p] = byPct[p] || []).push(rc); });
    });
    var feats = [];
    Object.keys(byPct).forEach(function (p) {
      var g = own[p] || geo[p];
      if (!g) return;
      var list = byPct[p].slice().sort(function (a, b) { return total(b.precincts[p]) - total(a.precincts[p]); });
      feats.push({ type: "Feature", properties: { p: p, races: list }, geometry: g });
    });

    precinctLayer = L.geoJSON({ type: "FeatureCollection", features: feats }, {
      renderer: L.canvas({ padding: 0.5, tolerance: 0 }),
      style: function (f) {
        var rc = f.properties.races[0], v = rc.precincts[f.properties.p], t = total(v);
        if (!t) return { color: "#999", weight: 0.8, opacity: 0.7, fillColor: "#bbb", fillOpacity: 0.25 };
        var lead = leader(v, rc.candidates.length);
        if (lead.tie) return { color: "#fff", weight: 0.8, opacity: 0.9, fillColor: TIE, fillOpacity: 0.45 };
        return { color: "#fff", weight: 0.8, opacity: 0.9, fillColor: CAND_COLORS[lead.i] || "#888", fillOpacity: shade(lead.margin, t) };
      },
      onEachFeature: function (f, layer) {
        layer.bindTooltip(tipHtml(f.properties.p, f.properties.races), { sticky: true, className: "sd-tip", direction: "top", opacity: 1 });
        layer.on({
          mouseover: function (e) { highlight(e.target); },
          mouseout: function (e) { if (hovered === e.target) unhighlight(); },
          click: function (e) { L.DomEvent.stopPropagation(e); highlight(e.target); e.target.openTooltip(e.latlng); }
        });
      }
    }).addTo(map);

    // District outlines: union of each race's precincts, built in scripts/build-saisd.py
    // (approximate — SAISD doesn't publish district GIS).
    races.forEach(function (rc) {
      var fs = feats.filter(function (f) { return f.properties.races.indexOf(rc) !== -1; });
      if (!fs.length) return;
      var lyr = L.geoJSON(rc.outline, { style: { color: INK, weight: 3, opacity: 0.9, fill: false }, interactive: false }).addTo(districtLayer);
      var b = lyr.getBounds();
      // label at the precinct with the most votes, so it lands inside the district
      var best = fs.reduce(function (a, f) { return total(rc.precincts[f.properties.p]) > total(rc.precincts[a.properties.p]) ? f : a; });
      var c = L.geoJSON(best).getBounds().getCenter();
      L.tooltip({ permanent: true, direction: "center", className: "sd-dlabel", interactive: false })
        .setLatLng(c).setContent("D" + rc.district).addTo(districtLayer);
      rc._bounds = b;
    });

    var fitTo = race === "all" ? boundsAll : (races[0] && races[0]._bounds) || boundsAll;
    map.fitBounds(fitTo, { padding: [16, 16], animate: false });

    legend = L.control({ position: "bottomleft" });
    legend.onAdd = function () {
      var d = L.DomUtil.create("div", "sd-legend");
      var ramp = '<div class="sd-ramp">' + [0, 0.1, 0.2, 0.3, 0.4, 0.5].map(function (m) {
        return '<span style="background:' + CAND_COLORS[0] + ';opacity:' + shade(m) + '"></span>';
      }).join("") + '</div><div style="display:flex;justify-content:space-between;font-size:11px;color:' + MUTED + '"><span>close</span><span>won by 50+ pts</span></div>';
      if (race === "all") {
        d.innerHTML = "<strong>Color = precinct leader</strong><br>" +
          '<span class="sd-sw" style="background:' + CAND_COLORS[0] + '"></span>Race winner<br>' +
          '<span class="sd-sw" style="background:' + CAND_COLORS[1] + '"></span>Runner-up' +
          (el.races.some(function (rc) { return rc.candidates.length > 2; }) ? '<br><span class="sd-sw" style="background:' + CAND_COLORS[2] + '"></span>3rd place' : "") +
          ramp + extraLegend() + '<div style="margin-top:4px"><span class="sd-sw" style="background:none;border:2px dashed ' + INK + ';width:14px;height:10px"></span>SAISD boundary</div>';
      } else {
        var rc = races[0];
        d.innerHTML = "<strong>District " + rc.district + ", " + year + "</strong><br>" + rc.candidates.map(function (c, i) {
          return '<span class="sd-sw" style="background:' + CAND_COLORS[i] + '"></span>' + esc(c);
        }).join("<br>") + ramp + extraLegend();
      }
      return d;
    };
    legend.addTo(map);

    renderCard(el, races);
  }

  function extraLegend() {
    return '<div style="margin-top:4px;font-size:11.5px"><span class="sd-sw" style="background:' + TIE + ';opacity:.6"></span>Tie' +
      ' &nbsp;&middot;&nbsp; fainter = under ' + FEW_VOTES + " votes</div>";
  }
  function total(v) { var t = 0; for (var i = 0; i < v.length - 2; i++) t += v[i]; return t; }
  function leader(v, n) {
    var best = -1, bi = 0, second = -1;
    for (var i = 0; i < n; i++) { if (v[i] > best) { second = best; best = v[i]; bi = i; } else if (v[i] > second) second = v[i]; }
    var t = total(v);
    return { i: bi, tie: best === second, margin: t ? (best - Math.max(second, 0)) / t : 0 };
  }

  function tipHtml(p, list) {
    return list.map(function (rc, k) {
      var v = rc.precincts[p], t = total(v);
      return (k ? '<hr style="border:0;border-top:1px solid #ddd;margin:6px 0">' : "") +
        "<strong>Precinct " + esc(p) + "</strong> &middot; District " + rc.district +
        rc.candidates.map(function (c, i) {
          return '<div class="sd-cand"><span class="sd-sw" style="background:' + CAND_COLORS[i] + '"></span>' + esc(c) +
            '<span class="sd-v">' + fmt(v[i]) + " &middot; " + pct(v[i], t) + "</span></div>";
        }).join("") +
        '<div style="font-size:11.5px;color:' + MUTED + ';margin-top:3px">' + fmt(t) + " votes in this race" +
        (v[v.length - 2] ? " &middot; " + fmt(v[v.length - 2]) + " left it blank" : "") + "</div>";
    }).join("");
  }

  function renderCard(el, races) {
    var boxes = races.map(function (rc) {
      var t = rc.totals.reduce(function (a, b) { return a + b; }, 0);
      return '<div class="sd-race' + (race === "all" ? " clickable" : "") + '" data-d="' + rc.district + '">' +
        '<div class="sd-kicker">District ' + rc.district + " &middot; " + Object.keys(rc.precincts).length + " precincts</div>" +
        rc.candidates.map(function (c, i) {
          return '<div class="sd-cand"><span class="sd-sw" style="background:' + CAND_COLORS[i] + '"></span><span class="sd-name">' +
            (i === 0 ? "<strong>" + esc(c) + " &#10003;</strong>" : esc(c)) + '</span><span class="sd-num">' + fmt(rc.totals[i]) + " &middot; " + pct(rc.totals[i], t) + "</span></div>" +
            '<div class="sd-bar"><span style="width:' + (t ? 100 * rc.totals[i] / t : 0) + "%;background:" + CAND_COLORS[i] + '"></span></div>';
        }).join("") + "</div>";
    }).join("");
    var notes = [];
    notes.push(fmtDate(el.date) + " &middot; official results: <a href=\"" + el.source + '" target="_blank" rel="noopener">Bexar County Elections</a>.');
    if (el.uncontested && el.uncontested.length) notes.push("Also up this year but unopposed (no election held): District " + el.uncontested.join(" and ") + ".");
    notes.push(el.year < 2023
      ? "Trustee districts as drawn before SAISD&rsquo;s 2022 redistricting."
      : "Trustee districts as redrawn by SAISD in 2022.");
    if (el.unmapped.length) notes.push("Not on the map (no published boundary): precinct " + el.unmapped.join(", ") + " &mdash; its votes are included in the totals.");
    notes.push("Precincts are drawn with the boundaries in use at that election, clipped to the SAISD line; district outlines are approximate (built from the precincts that voted in each race).");
    card.innerHTML = '<div class="sd-races">' + boxes + "</div><div class=\"sd-note\">" + notes.join(" ") + "</div>";
    if (race === "all") {
      Array.prototype.forEach.call(card.querySelectorAll(".sd-race.clickable"), function (b) {
        b.addEventListener("click", function () { selectRace(parseInt(b.getAttribute("data-d"), 10)); });
      });
    }
  }
}

  // ---- Drop-off chart: share of ballots left blank for mayor / city council / SAISD trustee ----
  // Independent of the map. Data: saisd-rolloff.json (scripts/saisd-rolloff/).
  function rolloff() {
    var box = document.getElementById("sd-rolloff");
    var SERIES = [["mayor", "Mayor", "--sd-s1"], ["council", "City council", "--sd-s2"], ["trustee", "SAISD trustee", "--sd-s3"]];
    fetch(here("saisd-rolloff.json")).then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); }).then(function (rows) {
      var pooled = rows.filter(function (r) { return r.district === "ALL"; });
      var drops = pooled.map(function (r) { return r.matched.drop; });
      var lo = Math.round(Math.min.apply(null, drops)), hi = Math.round(Math.max.apply(null, drops));
      box.innerHTML =
        "<h3>How many voters skip the school board race?</h3>" +
        '<div class="sd-ro-sub">Share of ballots left blank in each race, in the precincts that voted for SAISD trustee</div>' +
        '<div class="sd-ro-legend">' + SERIES.map(function (s) { return '<span><i style="background:var(' + s[2] + ')"></i>' + s[1] + "</span>"; }).join("") + "</div>" +
        '<div class="sd-ro-plot"><div class="sd-ro-svg"></div><div class="sd-ro-tip" hidden></div></div>' +
        '<div class="sd-ro-take">In every election, about <strong>' + lo + "&ndash;" + hi + " of every 100 people who voted for mayor</strong> in these precincts cast no vote for SAISD trustee.</div>" +
        '<div class="sd-ro-note">Blank rate = ballots that had the race on them but left it unmarked. The vote-count comparison uses precincts where all three races were on the same ballots. ' +
        'Source: Bexar County Elections official precinct reports.</div>' +
        '<button type="button" class="sd-ro-toggle" aria-expanded="false">Show table</button><div class="sd-ro-tablewrap" hidden></div>';

      var svgBox = box.querySelector(".sd-ro-svg"), tip = box.querySelector(".sd-ro-tip"), plot = box.querySelector(".sd-ro-plot");
      function draw() {
        var W = Math.max(280, Math.round(plot.clientWidth)), H = W < 520 ? 240 : 280;
        var m = { t: 22, r: 8, b: 30, l: 38 }, iw = W - m.l - m.r, ih = H - m.t - m.b;
        var max = 15, ticks = [0, 5, 10, 15];
        var y = function (v) { return m.t + ih - ih * v / max; };
        var gw = iw / pooled.length, bw = Math.min(34, Math.floor((gw * 0.72 - 4) / 3)), gap = 2;
        var fs = W < 520 ? 10.5 : 12;
        var out = '<svg viewBox="0 0 ' + W + " " + H + '" role="img" aria-label="Share of ballots left blank for mayor, city council and SAISD trustee, by election year">';
        ticks.forEach(function (t) {
          out += '<line x1="' + m.l + '" x2="' + (W - m.r) + '" y1="' + y(t) + '" y2="' + y(t) + '" stroke="' + (t ? "#e8e8e8" : "#9a9a9a") + '" stroke-width="1"/>' +
            '<text x="' + (m.l - 6) + '" y="' + (y(t) + 4) + '" text-anchor="end" font-size="' + fs + '">' + t + "%</text>";
        });
        pooled.forEach(function (r, gi) {
          var cx = m.l + gw * gi + gw / 2, x0 = cx - (3 * bw + 2 * gap) / 2;
          out += '<g class="sd-ro-grp" tabindex="0" data-i="' + gi + '"><rect class="sd-ro-band" x="' + (m.l + gw * gi + 2) + '" y="' + m.t + '" width="' + (gw - 4) + '" height="' + (ih + 2) + '" rx="6"/>';
          SERIES.forEach(function (s, si) {
            var v = r[s[0]], bx = x0 + si * (bw + gap), by = y(v), bh = Math.max(1, y(0) - by), rad = Math.min(4, bw / 2, bh);
            // rounded top, square at the baseline
            out += '<path d="M' + bx + "," + y(0) + "V" + (by + rad) + "Q" + bx + "," + by + " " + (bx + rad) + "," + by + "H" + (bx + bw - rad) + "Q" + (bx + bw) + "," + by + " " + (bx + bw) + "," + (by + rad) + "V" + y(0) + 'Z" fill="var(' + s[2] + ')"/>';
            if (s[0] === "trustee") out += '<text class="sd-ro-val" x="' + (bx + bw / 2) + '" y="' + (by - 5) + '" text-anchor="middle" font-size="' + fs + '">' + v.toFixed(1) + "%</text>";
          });
          out += '<text class="sd-ro-year" x="' + cx + '" y="' + (H - 9) + '" text-anchor="middle" font-size="' + (fs + 1) + '">' + r.year + "</text></g>";
        });
        svgBox.innerHTML = out + "</svg>";
        Array.prototype.forEach.call(svgBox.querySelectorAll(".sd-ro-grp"), function (g) {
          var r = pooled[+g.getAttribute("data-i")];
          function show() {
            tip.innerHTML = "<strong>May " + r.year + "</strong> &middot; left blank" +
              SERIES.map(function (s) { return '<div class="r"><i style="background:var(' + s[2] + ')"></i>' + s[1] + "<b>" + r[s[0]].toFixed(1) + "%</b></div>"; }).join("") +
              '<div style="margin-top:5px;color:' + MUTED + '">Votes on the same ballots:<br>mayor ' + fmt(r.matched.mayor) + " &rarr; council " + fmt(r.matched.council) +
              " &rarr; trustee " + fmt(r.matched.trustee) + " (&minus;" + r.matched.drop.toFixed(1) + "%)</div>";
            tip.hidden = false;
            var gb = g.getBoundingClientRect(), pb = plot.getBoundingClientRect(), tw = tip.offsetWidth;
            // beside the group (right if it fits, else left); on narrow screens, above the plot
            var right = gb.right - pb.left + 8, left = gb.left - pb.left - tw - 8;
            if (right + tw <= pb.width) { tip.style.left = right + "px"; tip.style.top = "8px"; }
            else if (left >= 0) { tip.style.left = left + "px"; tip.style.top = "8px"; }
            else { tip.style.left = Math.max(0, Math.min(pb.width - tw, gb.left - pb.left + gb.width / 2 - tw / 2)) + "px"; tip.style.top = (-tip.offsetHeight - 4) + "px"; }
          }
          function hide() { tip.hidden = true; }
          g.addEventListener("mouseenter", show); g.addEventListener("mouseleave", hide);
          g.addEventListener("focus", show); g.addEventListener("blur", hide);
          g.addEventListener("click", show);
        });
      }
      draw();
      if (window.ResizeObserver) new ResizeObserver(function () { tip.hidden = true; draw(); }).observe(plot);

      // table view (all districts + pooled)
      var tw = box.querySelector(".sd-ro-tablewrap"), btn = box.querySelector(".sd-ro-toggle");
      tw.innerHTML = "<table><thead><tr><th>Election</th><th>Mayor blank</th><th>Council blank</th><th>Trustee blank</th><th>Mayor votes</th><th>Council votes</th><th>Trustee votes</th><th>Mayor&rarr;trustee</th></tr></thead><tbody>" +
        rows.map(function (r) {
          return '<tr class="' + (r.district === "ALL" ? "pooled" : "") + '"><td>' + r.year + " " + (r.district === "ALL" ? "all races" : "District " + r.district) + "</td><td>" +
            r.mayor.toFixed(1) + "%</td><td>" + r.council.toFixed(1) + "%</td><td>" + r.trustee.toFixed(1) + "%</td><td>" + fmt(r.matched.mayor) + "</td><td>" +
            fmt(r.matched.council) + "</td><td>" + fmt(r.matched.trustee) + "</td><td>&minus;" + r.matched.drop.toFixed(1) + "%</td></tr>";
        }).join("") + "</tbody></table>";
      btn.addEventListener("click", function () {
        tw.hidden = !tw.hidden; btn.textContent = tw.hidden ? "Show table" : "Hide table"; btn.setAttribute("aria-expanded", tw.hidden ? "false" : "true");
      });
    }).catch(function (e) { console.error("SAISD drop-off chart:", e); box.innerHTML = ""; });
  }
  rolloff();

  loadLeaflet(start);
})();
