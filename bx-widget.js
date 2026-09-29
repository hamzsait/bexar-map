/*!
 * Bexar County public map widget — https://github.com/hamzsait/bexar-map
 *
 * This is the real widget. Sites embed bx-map.js (a tiny, never-changing
 * bootstrap) which loads this file + the GeoJSON from GitHub Pages so updates
 * reach visitors within ~10 minutes. Data files are loaded from the same
 * location this script was loaded from.
 *
 * State rules (so nothing "sticks"):
 *   - Everything a search draws (pins, popups) lives in one layer group; reset()
 *     clears it plus the precinct highlight, all dropdowns and the result card.
 *   - Switching tabs calls reset(). Starting a search calls begin(), which
 *     invalidates any older in-flight request; async callbacks check isCurrent().
 *   - Each dropdown only renders its own latest response, and only while its
 *     input is focused.
 */
(function () {
  var LEAFLET_CSS = { href: "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css", integrity: "sha256-p4NxAoJBhIIN+hmNHrzRCf9tD/miZyoHS5obTRR9BMY=" };
  var LEAFLET_JS  = { src:  "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js",  integrity: "sha256-20nQCchB9co0qIjJZRGuk2/Z9VM+kNiyxNV1lvTlZBo=" };

  // Where am I loaded from? Data lives next to this file.
  var me = document.currentScript || (function () { var s = document.getElementsByTagName("script"); return s[s.length - 1]; })();
  var DATA_BASE = (me && me.src ? me.src.replace(/\/[^\/]*$/, "") : "");
  function base(p) { return (DATA_BASE ? DATA_BASE.replace(/\/$/, "") + "/" : "") + p; }

  var root = document.getElementById("bx-map-root") || (function () {
    var d = document.createElement("div"); d.id = "bx-map-root"; me.parentNode.insertBefore(d, me); return d;
  })();
  if (root.getAttribute("data-bx-loaded")) return;   // guard against double-inclusion
  root.setAttribute("data-bx-loaded", "1");

  // ---- which tools to show ------------------------------------
  // data-mode="voter" | "address" | "polling" | comma list, on the
  // #bx-map-root div (preferred) or the bx-map.js script tag. Default: all.
  var modeAttr = root.getAttribute("data-mode") ||
    (function () { var b = document.querySelector('script[src*="bx-map"]'); return (b && b.getAttribute("data-mode")) || ""; })();
  var MODES = modeAttr.toLowerCase().split(/[\s,]+/).filter(function (m) {
    return m === "voter" || m === "address" || m === "polling";
  });
  if (!MODES.length) MODES = ["voter", "address", "polling"];

  // ---- styles ---------------------------------------------------
  var INK = "#1a1a1a", RED = "#ec1f27", RED_DARK = "#c4161d", MUTED = "#666666", TINT = "#fdeceb";
  var CSS = [
    // panel
    "#bx-wrap { font-family: inherit; color:#fff; background:" + RED + "; border-radius:20px; padding:18px; box-sizing:border-box; width:100%; line-height:1.35; text-align:left; }",
    "#bx-wrap *, #bx-wrap *::before, #bx-wrap *::after { box-sizing:border-box; }",
    // header
    "#bx-wrap .bx-header { display:flex; align-items:center; gap:16px; margin:0 0 16px; }",
    "#bx-wrap .bx-logo { flex:0 0 88px; width:88px; height:88px; border-radius:50%; background:#fff; display:flex; align-items:center; justify-content:center; box-shadow:0 2px 8px rgba(0,0,0,.18); }",
    "#bx-wrap .bx-logo img { width:70px; height:auto; display:block; margin:0; }",
    "#bx-wrap .bx-title { font-size:26px; font-weight:800; letter-spacing:-.01em; line-height:1.15; text-transform:uppercase; margin:0; color:#fff; }",
    "#bx-wrap .bx-sub { font-size:14px; font-weight:500; margin-top:3px; color:#fff; }",
    // controls (reset host-theme styles: Squarespace sets margins/letter-spacing/text-transform on buttons)
    "#bx-wrap .bx-input, #bx-wrap .bx-btn, #bx-wrap .bx-tab { margin:0; -webkit-appearance:none; appearance:none; text-transform:none; line-height:1.2; font-family:inherit; }",
    "#bx-wrap .bx-input { width:100%; padding:12px 16px; border:2px solid " + INK + "; border-radius:999px; font-size:16px; color:" + INK + "; background:#fff; outline:none; box-shadow:none; }",
    "#bx-wrap .bx-input:focus { box-shadow:0 0 0 3px rgba(255,255,255,.6); }",
    "#bx-wrap .bx-input::placeholder { color:#777777; }",
    "#bx-wrap .bx-btn { padding:12px 22px; border-radius:999px; font-size:15px; font-weight:600; cursor:pointer; letter-spacing:.02em; white-space:nowrap; }",
    "#bx-wrap .bx-btn[disabled] { opacity:.6; cursor:progress; }",
    "#bx-wrap .bx-btn-primary { background:" + INK + "; color:#fff; border:2px solid " + INK + "; }",
    "#bx-wrap .bx-btn-primary:hover { background:#000; }",
    "#bx-wrap .bx-btn-secondary { background:#fff; color:" + INK + "; border:2px solid " + INK + "; }",
    "#bx-wrap .bx-btn-secondary:hover { background:" + TINT + "; }",
    "#bx-wrap .bx-tabs { display:flex; gap:8px; flex-wrap:wrap; margin:0 0 10px; }",
    "#bx-wrap .bx-tab { padding:9px 20px; border-radius:999px; font-size:14px; font-weight:600; letter-spacing:0; cursor:pointer; background:#fff; color:" + INK + "; border:2px solid " + INK + "; }",
    "#bx-wrap .bx-tab.active { background:" + INK + "; color:#fff; }",
    "#bx-wrap .bx-form { display:none; gap:10px; flex-wrap:wrap; margin:0 0 10px; }",
    "#bx-wrap .bx-form.active { display:flex; }",
    "#bx-wrap .bx-field { flex:1 1 260px; min-width:0; position:relative; }",
    "#bx-wrap .bx-note { flex-basis:100%; font-size:13.5px; color:#fff; margin:2px 4px 0; }",
    // dropdowns
    "#bx-wrap .bx-sugg { position:absolute; left:12px; right:12px; top:calc(100% + 4px); z-index:2000; background:#fff; border:2px solid " + INK + "; border-radius:14px; box-shadow:0 6px 18px rgba(0,0,0,.15); margin:0; padding:6px 0; list-style:none; max-height:280px; overflow-y:auto; }",
    "#bx-wrap .bx-sugg li { margin:0; padding:9px 16px; cursor:pointer; font-size:15px; line-height:1.3; color:" + INK + "; list-style:none; }",
    "#bx-wrap .bx-sugg li::before { content:none; }",
    "#bx-wrap .bx-sugg li small { display:block; color:" + MUTED + "; font-size:12.5px; }",
    "#bx-wrap .bx-sugg li.active, #bx-wrap .bx-sugg li[role=option]:hover { background:" + TINT + "; }",
    "#bx-wrap .bx-sugg li.bx-info { cursor:default; color:" + MUTED + "; }",
    "#bx-wrap .bx-sugg li.bx-err { cursor:default; color:" + RED_DARK + "; }",
    "#bx-wrap .bx-badge { display:inline-block; font-size:11px; font-weight:700; padding:1px 8px; border-radius:999px; margin-left:6px; vertical-align:1px; }",
    "#bx-wrap .bx-badge-active { background:#e7f5ec; color:#177245; }",
    "#bx-wrap .bx-badge-susp { background:#fdeee3; color:#c2410c; }",
    // result card
    "#bx-result { margin:0 0 12px; font-size:16px; }",
    "#bx-result:empty { display:none; }",
    "#bx-result { background:#fff; color:" + INK + "; border-radius:14px; padding:12px 14px; }",
    "#bx-result.bx-err { color:" + RED_DARK + "; }",
    "#bx-result .bx-note { color:" + MUTED + "; margin:8px 0 0; }",
    "#bx-wrap .bx-card { flex:1 1 240px; border:2px solid " + INK + "; border-radius:14px; padding:12px 14px; background:#fff; }",
    "#bx-wrap .bx-card.pending { border-style:dashed; }",
    "#bx-wrap .bx-kicker { font-size:12px; font-weight:700; letter-spacing:.05em; text-transform:uppercase; color:" + RED_DARK + "; }",
    "#bx-wrap .bx-cta, #bx-map .bx-cta { display:inline-block; margin-top:8px; padding:7px 14px; border-radius:999px; background:" + RED + "; color:#fff !important; font-weight:600; font-size:13px; text-decoration:none !important; border:2px solid " + RED + "; }",
    "#bx-wrap .bx-cta:hover, #bx-map .bx-cta:hover { background:" + RED_DARK + "; border-color:" + RED_DARK + "; }",
    // map
    "#bx-map { height:560px; width:100%; border-radius:16px; overflow:hidden; background:#f2f2f2; border:3px solid #fff; }",
    "#bx-map .leaflet-container, #bx-map.leaflet-container { font: 13px/1.4 Roboto, -apple-system, BlinkMacSystemFont, \"Segoe UI\", sans-serif; }",
    "#bx-map.leaflet-container:focus:not(:focus-visible) { outline:none; }",
    "#bx-map .leaflet-tile-pane { filter: grayscale(1) contrast(.9) brightness(1.04); }",
    "#bx-map .precinct-tip { background:" + INK + "; color:#fff; border:0; border-radius:8px; padding:5px 10px; font-weight:600; box-shadow:0 2px 8px rgba(0,0,0,.3); }",
    "#bx-map .precinct-tip::before { display:none; }",
    "#bx-map .bx-legend { background:#fff; color:" + INK + "; padding:8px 12px; border-radius:10px; border:2px solid " + INK + "; line-height:1.7; font-size:13px; }",
    "#bx-map .bx-legend .sw { display:inline-block; width:22px; height:13px; vertical-align:middle; margin-right:7px; border-radius:3px; }",
    "#bx-map .bx-legend .dot { display:inline-block; width:13px; height:13px; margin:0 11px 0 4px; vertical-align:middle; border-radius:50%; border:2px solid #fff; box-shadow:0 0 0 1px #999; }",
    "#bx-map .leaflet-popup-content-wrapper { border-radius:12px; border:2px solid " + INK + "; box-shadow:0 6px 18px rgba(0,0,0,.18); color:" + INK + "; }",
    "#bx-map .leaflet-popup-tip { background:" + INK + "; }",
    "#bx-map .leaflet-bar a { color:" + INK + "; }",
    "#bx-map .leaflet-control-attribution { font-size:10.5px; }",
    "#bx-map .leaflet-control-attribution a { color:" + INK + "; }",
    "#bx-map .bx-maptip { position:absolute; inset:0; z-index:1000; display:flex; align-items:center; justify-content:center; pointer-events:none; }",
    "#bx-map .bx-maptip span { background:rgba(26,26,26,.85); color:#fff; padding:8px 14px; border-radius:999px; font-size:14px; }",
    // phones
    "@media (max-width:520px) {",
    "  #bx-wrap { padding:14px; border-radius:16px; }",
    "  #bx-wrap .bx-title { font-size:19px; }",
    "  #bx-wrap .bx-logo { flex-basis:64px; width:64px; height:64px; } #bx-wrap .bx-logo img { width:50px; }",
    "  #bx-wrap .bx-sub { font-size:13px; }",
    "  #bx-wrap .bx-btn { flex:1 1 auto; }",
    "  #bx-map { height:400px; }",
    "  #bx-map .bx-legend { font-size:11px; line-height:1.5; padding:5px 8px; }",
    "  #bx-map .bx-legend .sw { width:16px; height:10px; margin-right:5px; }",
    "  #bx-map .bx-legend .dot { width:10px; height:10px; margin:0 8px 0 3px; }",
    "}"
  ].join("\n");
  var style = document.createElement("style");
  style.textContent = CSS;
  document.head.appendChild(style);

  // ---- markup ---------------------------------------------------
  var TAB_LABELS = { voter: "Voter lookup", address: "Address search", polling: "Polling places" };
  var FORMS = {
    voter:
      '<form class="bx-form" id="bx-vform" data-tab="voter" role="tabpanel" aria-label="Voter lookup" autocomplete="off">' +
        '<div class="bx-field"><input id="bx-vq" class="bx-input" type="text" inputmode="search" placeholder="Name, e.g. Garcia Maria" aria-label="Voter name" ' +
          'role="combobox" aria-autocomplete="list" aria-expanded="false" aria-controls="bx-vsugg" />' +
        '<ul id="bx-vsugg" class="bx-sugg" role="listbox" aria-label="Matching voters" hidden></ul></div>' +
        '<div class="bx-note">Searches the Bexar County voter roll (county list as of September 24, 2026).</div>' +
      "</form>",
    address:
      '<form class="bx-form" id="bx-aform" data-tab="address" role="tabpanel" aria-label="Address search" autocomplete="off">' +
        '<div class="bx-field"><input id="bx-aq" class="bx-input" type="text" inputmode="search" placeholder="Bexar County address" aria-label="Address" ' +
          'role="combobox" aria-autocomplete="list" aria-expanded="false" aria-controls="bx-asugg" />' +
        '<ul id="bx-asugg" class="bx-sugg" role="listbox" aria-label="Address suggestions" hidden></ul></div>' +
        '<button type="submit" class="bx-btn bx-btn-primary">Search</button>' +
        '<button type="button" class="bx-btn bx-btn-secondary bx-locate">&#9673; Use my location</button>' +
      "</form>",
    polling:
      '<form class="bx-form" id="bx-pform" data-tab="polling" role="tabpanel" aria-label="Polling places" autocomplete="off">' +
        '<div class="bx-field"><input id="bx-pq" class="bx-input" type="text" inputmode="search" placeholder="Your address" aria-label="Your address" ' +
          'role="combobox" aria-autocomplete="list" aria-expanded="false" aria-controls="bx-psugg" />' +
        '<ul id="bx-psugg" class="bx-sugg" role="listbox" aria-label="Address suggestions" hidden></ul></div>' +
        '<button type="submit" class="bx-btn bx-btn-primary">Find</button>' +
        '<button type="button" class="bx-btn bx-btn-secondary bx-locate">&#9673; Use my location</button>' +
      "</form>"
  };
  var tabBar = MODES.length > 1
    ? '<div class="bx-tabs" role="tablist">' + MODES.map(function (m) {
        return '<button type="button" class="bx-tab" role="tab" aria-selected="false" data-tab="' + m + '">' + TAB_LABELS[m] + "</button>";
      }).join("") + "</div>"
    : "";
  // Header: San Antonio DSA chapter logo (from sanantoniodsa.org) on a white disc so the red rose reads
  // on the red panel. data-title="..." changes the heading; data-header="off" hides it.
  var TITLE = (root.getAttribute("data-title") || "Bexar County Voter Map").replace(/[<>&"]/g, "");
  var header = root.getAttribute("data-header") === "off" ? "" :
    '<div class="bx-header"><span class="bx-logo"><img src="' + base("sa-dsa-logo.png") + '" alt="San Antonio DSA" /></span>' +
    '<div><div class="bx-title">' + TITLE + '</div><div class="bx-sub">Check your registration &middot; find your precinct &middot; find where to vote</div></div></div>';
  root.innerHTML = '<div id="bx-wrap">' + header + tabBar +
    MODES.map(function (m) { return FORMS[m]; }).join("") +
    '<div id="bx-result" role="status" aria-live="polite"></div><div id="bx-map"></div></div>';

  // ---- load Leaflet (once), then boot ---------------------------
  function loadLeaflet(cb) {
    if (!document.querySelector('link[href="' + LEAFLET_CSS.href + '"]')) {
      var l = document.createElement("link"); l.rel = "stylesheet"; l.href = LEAFLET_CSS.href;
      l.integrity = LEAFLET_CSS.integrity; l.crossOrigin = ""; document.head.appendChild(l);
    }
    if (window.L && L.geoJSON) return cb();
    var s = document.createElement("script"); s.src = LEAFLET_JS.src; s.integrity = LEAFLET_JS.integrity;
    s.crossOrigin = ""; s.onload = cb;
    s.onerror = function () { document.getElementById("bx-map").innerHTML = '<p style="padding:1em;color:#b91c1c">Map library failed to load. Please refresh the page.</p>'; };
    document.head.appendChild(s);
  }

function start() {
  var $ = function (id) { return document.getElementById(id); };
  var resultEl = $("bx-result");

  function setResult(html, isErr) {
    resultEl.innerHTML = html || "";
    resultEl.classList.toggle("bx-err", !!isErr);
  }
  function titleCase(t) {
    return t.replace(/\w\S*/g, function (w) {
      var core = w.replace(/[^A-Za-z]/g, "");
      if (/^\d+(ST|ND|RD|TH)\b/i.test(w)) return w.toLowerCase();          // 11TH -> 11th
      return /^(TX|NE|NW|SE|SW|N|S|E|W|IH|US|FM|RM|RR|ISD|UTSA)$/.test(core) || /\d/.test(w) ? w : w.charAt(0) + w.slice(1).toLowerCase();
    });
  }
  function esc(t) { return String(t).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }

  // ================================================================
  // Map
  // ================================================================
  var map = L.map("bx-map", { scrollWheelZoom: false, zoomControl: true, zoomSnap: 0.25 })
    .setView([29.45, -98.52], 10);
  map.attributionControl.setPrefix(false);
  L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 18,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &middot; Data: Bexar County'
  }).addTo(map);

  // Keep Leaflet's size in sync with the container (Squarespace reflows, orientation changes, lazy images).
  var resultLayer = L.layerGroup().addTo(map);   // every search pin / popup lives here
  var precinctLayer = null, countyBounds = null, hovered = null;
  // While nothing is searched, keep the whole county in view as the container settles.
  function onResize() { map.invalidateSize(); if (!resultLayer.getLayers().length) fitCounty(); }
  if (window.ResizeObserver) new ResizeObserver(onResize).observe($("bx-map"));
  else { window.addEventListener("resize", onResize); setTimeout(onResize, 300); }

  function unhighlight() {
    if (!hovered) return;
    precinctLayer.resetStyle(hovered); hovered.closeTooltip(); hovered = null;
  }
  function highlight(layer) {
    if (hovered === layer) return;
    unhighlight();
    hovered = layer;
    layer.setStyle({ fillColor: RED, fillOpacity: 0.35, color: RED, weight: 2.5, opacity: 1 });
    layer.bringToFront();
  }
  function fitCounty() { if (countyBounds) map.fitBounds(countyBounds, { padding: [12, 12], animate: false }); }

  setResult("Loading map&hellip;");
  var dataReady = Promise.all([
    fetch(base("bx-precincts.geojson")).then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); }),
    fetch(base("bx-outline.geojson")).then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); }),
    fetch(base("bx-voters.json")).then(function (r) { return r.json(); }).catch(function () { return {}; })
  ]).then(function (res) {
    var precincts = res[0], outline = res[1], voterCounts = res[2];

    // 1) light county shading
    L.geoJSON(outline, { style: { stroke: false, fillColor: RED, fillOpacity: 0.06 }, interactive: false }).addTo(map);

    // 2) precincts on ONE canvas; only one is ever highlighted (see unhighlight/highlight)
    precinctLayer = L.geoJSON(precincts, {
      renderer: L.canvas({ padding: 0.5, tolerance: 0 }),
      style: { color: INK, weight: 0.7, opacity: 0.35, fillColor: INK, fillOpacity: 0 },
      onEachFeature: function (f, layer) {
        var vc = voterCounts[String(f.properties.p)];
        layer.bindTooltip("Precinct " + f.properties.p +
          (vc ? '<br><span style="font-weight:400">' + vc.total.toLocaleString() + " registered &middot; " + vc.active.toLocaleString() + " active</span>" : ""),
          { sticky: true, className: "precinct-tip", direction: "top" });
        layer.on({
          mouseover: function (e) { highlight(e.target); },
          mouseout: function (e) { if (hovered === e.target) unhighlight(); },
          click: function (e) { L.DomEvent.stopPropagation(e); highlight(e.target); e.target.openTooltip(e.latlng); }  // touch
        });
      }
    }).addTo(map);
    map.on("click", unhighlight);                                   // tap empty map clears
    map.getContainer().addEventListener("mouseleave", unhighlight);

    // 3) bold county outline on top
    var outlineLayer = L.geoJSON(outline, { style: { color: RED, weight: 3.5, opacity: 1, fill: false }, interactive: false }).addTo(map);
    countyBounds = outlineLayer.getBounds();
    map.invalidateSize();
    fitCounty();

    var legend = L.control({ position: "bottomleft" });
    legend.onAdd = function () {
      var d = L.DomUtil.create("div", "bx-legend");
      d.innerHTML =
        '<div><span class="sw" style="border:2px solid ' + RED + ';background:rgba(236,31,39,.08)"></span><strong>Bexar County</strong></div>' +
        '<div><span class="sw" style="border:1px solid ' + INK + ';opacity:.7"></span>Voting precinct</div>' +
        '<div><span class="dot" style="background:' + RED + '"></span>Your search</div>' +
        (MODES.indexOf("polling") !== -1 ? '<div><span class="dot" style="background:' + INK + '"></span>Polling place</div>' : "");
      return d;
    };
    legend.addTo(map);
    if (resultEl.innerHTML === "Loading map…") setResult("");
    return { precincts: precincts, outline: outline };
  });
  dataReady.catch(function (err) {
    console.error("Bexar map:", err);
    setResult("The map data didn&rsquo;t load. Please refresh the page.", true);
  });

  // Ray-casting point-in-polygon for GeoJSON Polygon / MultiPolygon ([lng, lat]).
  function inRing(pt, ring) {
    var x = pt[0], y = pt[1], inside = false;
    for (var i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      var xi = ring[i][0], yi = ring[i][1], xj = ring[j][0], yj = ring[j][1];
      if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) inside = !inside;
    }
    return inside;
  }
  function inPolygon(pt, poly) {
    if (!inRing(pt, poly[0])) return false;
    for (var h = 1; h < poly.length; h++) if (inRing(pt, poly[h])) return false;
    return true;
  }
  function inFeature(pt, f) {
    var g = f.geometry;
    if (g.type === "Polygon") return inPolygon(pt, g.coordinates);
    if (g.type === "MultiPolygon") return g.coordinates.some(function (p) { return inPolygon(pt, p); });
    return false;
  }

  // ================================================================
  // Search state
  // ================================================================
  var gen = 0;
  // Start a new search: invalidates any older in-flight one. Returns isCurrent().
  function begin() { var mine = ++gen; return function () { return mine === gen; }; }
  var dropdowns = [];
  // Wipe everything a previous search/interaction left behind.
  function reset() {
    begin();
    dropdowns.forEach(function (d) { d.hide(); });
    var hadPins = resultLayer.getLayers().length > 0;
    resultLayer.clearLayers();
    map.closePopup();
    unhighlight();
    setResult("");
    if (hadPins) fitCounty();
  }
  function pin(lat, lng, color, popupHtml) {
    return L.circleMarker([lat, lng], { radius: color === RED ? 9 : 8, color: "#fff", weight: 3, fillColor: color, fillOpacity: 1 })
      .addTo(resultLayer).bindPopup(popupHtml);
  }

  // Show an address/point: pin + "In Bexar County · Precinct N".
  function showPoint(lat, lng, label, info, isCurrent) {
    dataReady.then(function (d) {
      if (isCurrent && !isCurrent()) return;
      var pt = [lng, lat], pct = null;
      var inCounty = inFeature(pt, d.outline.features[0]);
      for (var i = 0; i < d.precincts.features.length; i++) {
        if (inFeature(pt, d.precincts.features[i])) { pct = d.precincts.features[i].properties.p; break; }
      }
      resultLayer.clearLayers(); map.closePopup(); unhighlight();
      var msg = inCounty
        ? '<strong style="color:' + RED_DARK + '">&#10003; In Bexar County</strong>' + (pct != null ? " &middot; Precinct " + pct : "")
        : "<strong>Outside Bexar County</strong>";
      if (info) msg = info + "<br>" + msg;
      if (label) msg += '<div style="font-size:13px;color:' + MUTED + '">' + esc(label) + "</div>";
      pin(lat, lng, RED, msg).openPopup();
      setResult(msg);
      map.flyTo([lat, lng], Math.max(map.getZoom(), 13.5));
    });
  }

  // ================================================================
  // Dropdown (typeahead) — shared by all three inputs
  // ================================================================
  // opts: fetch(q) -> Promise<items>, render(item) -> html, choose(item), minLen, delay,
  //       empty (html when no results), footer(items) -> html|"", loading (html while slow)
  function Dropdown(input, list, opts) {
    var items = [], active = -1, timer = null, req = 0, slowT = null;
    var self = {
      hide: function () {
        req++;                                  // drop any response still in flight
        clearTimeout(timer); clearTimeout(slowT);
        list.hidden = true; list.innerHTML = ""; items = []; active = -1;
        input.setAttribute("aria-expanded", "false"); input.removeAttribute("aria-activedescendant");
      },
      open: function () { return !list.hidden && items.length > 0; },
      chooseActive: function () { if (items.length) { var it = items[active >= 0 ? active : 0]; self.hide(); opts.choose(it); return true; } return false; }
    };
    function info(html, cls) {
      items = []; active = -1;
      list.innerHTML = '<li class="' + (cls || "bx-info") + '">' + html + "</li>";
      list.hidden = false; input.setAttribute("aria-expanded", "true");
    }
    function render(list_) {
      items = list_; active = -1; list.innerHTML = "";
      if (!items.length) { if (opts.empty) info(opts.empty); else self.hide(); return; }
      items.forEach(function (it, i) {
        var li = document.createElement("li");
        li.id = list.id + "-" + i; li.setAttribute("role", "option"); li.setAttribute("aria-selected", "false");
        li.innerHTML = opts.render(it);
        li.addEventListener("mousedown", function (e) { e.preventDefault(); });   // keep focus in the input
        li.addEventListener("click", function () { self.hide(); opts.choose(it); });
        list.appendChild(li);
      });
      var foot = opts.footer ? opts.footer(items) : "";
      if (foot) { var f = document.createElement("li"); f.className = "bx-info"; f.innerHTML = foot; list.appendChild(f); }
      list.hidden = false; input.setAttribute("aria-expanded", "true");
    }
    function setActive(i) {
      active = i;
      Array.prototype.forEach.call(list.querySelectorAll("li[role=option]"), function (li, k) {
        var on = k === i;
        li.classList.toggle("active", on); li.setAttribute("aria-selected", on ? "true" : "false");
        if (on) { li.scrollIntoView({ block: "nearest" }); input.setAttribute("aria-activedescendant", li.id); }
      });
    }
    input.addEventListener("input", function () {
      var q = input.value.trim();
      if (q.length < (opts.minLen || 3)) { self.hide(); return; }
      // Keep showing the previous list until the new one arrives (no flicker), but make
      // sure only this keystroke's response can render.
      req++; clearTimeout(timer); clearTimeout(slowT);
      var mine = req;
      timer = setTimeout(function () {
        if (opts.loading) slowT = setTimeout(function () { if (mine === req && document.activeElement === input) info(opts.loading); }, 400);
        opts.fetch(q).then(function (res) {
          clearTimeout(slowT);
          if (mine === req && document.activeElement === input) render(res);
        }, function () {
          clearTimeout(slowT);
          if (mine === req && document.activeElement === input) info("Couldn&rsquo;t load suggestions. Please try again.", "bx-err");
        });
      }, opts.delay || 250);
    });
    input.addEventListener("keydown", function (e) {
      if (e.key === "Escape") { self.hide(); return; }
      if (!self.open()) return;
      if (e.key === "ArrowDown") { e.preventDefault(); setActive(Math.min(active + 1, items.length - 1)); }
      else if (e.key === "ArrowUp") { e.preventDefault(); setActive(Math.max(active - 1, 0)); }
    });
    input.addEventListener("blur", function () { setTimeout(function () { if (document.activeElement !== input) self.hide(); }, 150); });
    dropdowns.push(self);
    return self;
  }

  // ================================================================
  // Bexar County address locator (typeahead + house-number interpolation)
  // ================================================================
  var GEO = "https://maps.bexar.org/arcgis/rest/services/Locators/BeCoMultiRole/GeocodeServer";
  function suggest(q) {
    return fetch(GEO + "/suggest?f=json&maxSuggestions=6&text=" + encodeURIComponent(q))
      .then(function (r) { return r.json(); }).then(function (j) { return j.suggestions || []; });
  }
  function geocode(text, magicKey) {
    var url = GEO + "/findAddressCandidates?f=json&outSR=4326&maxLocations=1&SingleLine=" + encodeURIComponent(text) +
              (magicKey ? "&magicKey=" + encodeURIComponent(magicKey) : "");
    return fetch(url).then(function (r) { return r.json(); }).then(function (j) {
      var c = (j.candidates || [])[0];
      return c && c.score >= 60 ? c : null;
    });
  }
  function renderAddress(sg) {
    var parts = sg.text.split(","), main = titleCase(parts[0].trim());
    var sub = parts.slice(1).join(",").replace(/^\s+/, "").replace(/\b(\w)(\w*)/g, function (_, a, b) { return a + b.toLowerCase(); }).replace(/\bTx\b/, "TX");
    return esc(main) + (sub ? "<small>" + esc(sub) + "</small>" : "");
  }
  // If the user typed a house number but the suggestion is just a street, keep their number.
  function suggestionQuery(input, sg) {
    var num = (input.value.trim().match(/^\d+[A-Za-z]?\b/) || [])[0];
    return num && !/^\d/.test(sg.text) ? { text: num + " " + sg.text, key: null } : { text: sg.text, key: sg.magicKey };
  }
  // Shared "address -> result" flow used by the address and polling tabs.
  function wireAddressForm(formEl, input, list, onFound) {
    function run(text, key) {
      var isCurrent = begin();
      setResult("Searching&hellip;");
      geocode(text, key).then(function (c) {
        if (!isCurrent()) return;
        if (!c) { setResult("Couldn&rsquo;t find that address in Bexar County. Try adding the street type or ZIP code.", true); return; }
        input.value = titleCase(c.address);
        onFound(c.location.y, c.location.x, titleCase(c.address), isCurrent);
      }).catch(function () { if (isCurrent()) setResult("Address lookup failed. Please try again.", true); });
    }
    var dd = Dropdown(input, list, {
      fetch: suggest, render: renderAddress,
      choose: function (sg) { var q = suggestionQuery(input, sg); run(q.text, q.key); }
    });
    formEl.addEventListener("submit", function (e) {
      e.preventDefault();
      if (dd.chooseActive()) return;          // Enter picks the highlighted (or first) suggestion
      var q = input.value.trim();
      dd.hide();
      if (q) run(q, null);
    });
    var btn = formEl.querySelector(".bx-locate");
    btn.addEventListener("click", function () {
      dd.hide();
      if (!navigator.geolocation) { setResult("Your browser doesn&rsquo;t support location.", true); return; }
      var isCurrent = begin();
      btn.disabled = true;
      setResult("Getting your location&hellip;");
      navigator.geolocation.getCurrentPosition(
        function (pos) { btn.disabled = false; if (isCurrent()) onFound(pos.coords.latitude, pos.coords.longitude, "Your current location", isCurrent); },
        function (err) {
          btn.disabled = false;
          if (isCurrent()) setResult(err.code === 1 ? "Location access was denied. You can type an address instead." : "Couldn&rsquo;t get your location.", true);
        },
        { enableHighAccuracy: true, timeout: 10000 }
      );
    });
  }

  // ================================================================
  // Address tab
  // ================================================================
  if ($("bx-aform")) {
    wireAddressForm($("bx-aform"), $("bx-aq"), $("bx-asugg"), function (lat, lng, label, isCurrent) {
      showPoint(lat, lng, label, null, isCurrent);
    });
  }

  // ================================================================
  // Voter lookup (Bexar County voter roll, sharded)
  // ================================================================
  // bx-voters/XX.json holds every voter whose last name (or any part of a
  // compound/hyphenated/apostrophe last name) starts with XX. We load the shard
  // for the first two letters of each word typed, so word order doesn't matter.
  if ($("bx-vform")) {
    var vinput = $("bx-vq"), shardCache = {}, V_SHOW = 12, V_CAP = 100;
    // O'Brien -> OBRIEN; Garcia-Lopez -> GARCIA LOPEZ
    function norm(t) { return t.toUpperCase().replace(/'/g, "").replace(/[,\-.]/g, " "); }
    function queryTokens(q) { return norm(q).split(/\s+/).filter(Boolean); }
    function loadShard(k) {
      if (!shardCache[k]) {
        shardCache[k] = fetch(base("bx-voters/" + k + ".json"))
          .then(function (r) { if (r.status === 404) return []; if (!r.ok) throw new Error(r.status); return r.json(); })
          .catch(function (e) { delete shardCache[k]; throw e; });
      }
      return shardCache[k];
    }
    function searchVoters(q) {
      var toks = queryTokens(q), keys = {};
      toks.forEach(function (t) { if (/^[A-Z]{2}/.test(t)) keys[t.slice(0, 2)] = 1; });
      var ks = Object.keys(keys);
      if (!ks.length) return Promise.resolve([]);
      return Promise.all(ks.map(loadShard)).then(function (lists) {
        // Every typed word must start some word of the name. Best first: last name starts
        // with one typed word AND first name starts with another.
        var hits = [], seen = {};
        lists.forEach(function (list) {
          for (var i = 0; i < list.length; i++) {
            var nm = list[i][0];
            var words = " " + norm(nm) + " " + nm.replace(/[,\-'.]/g, " ");   // O'BRIEN matches "obrien" and "brien"
            var ok = true;
            for (var t = 0; t < toks.length; t++) if (words.indexOf(" " + toks[t]) === -1) { ok = false; break; }
            if (!ok) continue;
            var id = list[i].join("|");
            if (seen[id]) continue;          // same voter can sit in two shards
            seen[id] = 1;
            var comma = nm.indexOf(",");
            var last = norm(comma === -1 ? nm : nm.slice(0, comma)).trim(), first = comma === -1 ? "" : norm(nm.slice(comma + 1)).trim();
            var score = 2;
            for (var a = 0; a < toks.length && score; a++) {
              if (last.indexOf(toks[a]) !== 0) continue;
              score = 1;
              if (toks.length === 1) { score = 0; break; }
              for (var b = 0; b < toks.length; b++) if (b !== a && first.indexOf(toks[b]) === 0) { score = 0; break; }
            }
            hits.push([score, list[i]]);
          }
        });
        hits.sort(function (x, y) { return x[0] - y[0]; });   // stable: alphabetical within a score
        var all = hits.slice(0, V_CAP).map(function (h) { return h[1]; });
        var shown = all.slice(0, V_SHOW); shown.total = all.length;
        return shown;
      });
    }
    var vdd = Dropdown(vinput, $("bx-vsugg"), {
      delay: 200,
      fetch: searchVoters,
      loading: "Loading voter list&hellip;",
      empty: "No matching Bexar County voters found. Try just the last name.",
      footer: function (items) {
        return items.total > items.length ? (items.total >= V_CAP ? V_CAP + "+" : items.total) + " matches &mdash; keep typing to narrow down" : "";
      },
      render: function (v) {
        var addr = v[3].indexOf("***") !== -1 ? "<em>Address confidential</em>" : esc(titleCase(v[3]));
        return esc(titleCase(v[0])) +
          '<span class="bx-badge ' + (v[2] ? 'bx-badge-active">Active' : 'bx-badge-susp">Suspense') + "</span>" +
          "<small>" + addr + " &middot; Precinct " + v[1] + "</small>";
      },
      choose: function (v) {
        vinput.value = titleCase(v[0]);
        var info = "<strong>" + esc(titleCase(v[0])) + "</strong> " +
          '<span style="font-weight:600;color:' + (v[2] ? '#177245">Active' : '#c2410c">Suspense') + "</span>" +
          " &middot; Registered in Precinct " + v[1];
        var isCurrent = begin();
        resultLayer.clearLayers(); map.closePopup();
        if (v[3].indexOf("***") !== -1) {   // county-redacted (address confidentiality program)
          setResult(info + '<div style="font-size:13px;color:' + MUTED + '">This voter&rsquo;s address is confidential in the county&rsquo;s records, so it can&rsquo;t be shown on the map.</div>');
          return;
        }
        setResult(info + '<div style="font-size:13px;color:' + MUTED + '">Locating&hellip;</div>');
        geocode(v[3], null).then(function (c) {
          if (!isCurrent()) return;
          if (c) showPoint(c.location.y, c.location.x, titleCase(c.address), info, isCurrent);
          else setResult(info + '<div style="font-size:13px;color:' + MUTED + '">' + esc(titleCase(v[3])) + " (couldn&rsquo;t place on the map)</div>");
        }).catch(function () { if (isCurrent()) setResult(info); });
      }
    });
    $("bx-vform").addEventListener("submit", function (e) {
      e.preventDefault();
      vdd.chooseActive();
    });
  }

  // ================================================================
  // Polling place finder
  // ================================================================
  // Bexar County uses countywide vote centers: any registered Bexar County voter
  // may vote at ANY location. We show the closest ones.
  if ($("bx-pform")) {
    var pollLoading = null;
    function loadPolling() {
      if (!pollLoading) {
        pollLoading = fetch(base("bx-polling.json")).then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); })
          .catch(function (e) { pollLoading = null; throw e; });
      }
      return pollLoading;
    }
    function miles(aLat, aLng, bLat, bLng) {
      var R = 3958.8, dLat = (bLat - aLat) * Math.PI / 180, dLng = (bLng - aLng) * Math.PI / 180;
      var h = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
              Math.cos(aLat * Math.PI / 180) * Math.cos(bLat * Math.PI / 180) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
      return 2 * R * Math.asin(Math.sqrt(h));
    }
    function nearest(sites, lat, lng, test) {
      var best = null, bestD = Infinity;
      sites.forEach(function (s) {
        if (!test(s)) return;
        var d = miles(lat, lng, s.lat, s.lng);
        if (d < bestD) { bestD = d; best = s; }
      });
      return best ? { site: best, mi: bestD } : null;
    }
    function dirLink(fromLat, fromLng, site) {
      return "https://www.google.com/maps/dir/?api=1&origin=" + fromLat + "," + fromLng +
        "&destination=" + encodeURIComponent(site.a) + "&travelmode=driving";
    }
    // Hours from the county's Nov 3, 2026 early-voting notice.
    var EV_HOURS = {
      full: "Oct 19&ndash;23 8am&ndash;6pm &middot; Sat Oct 24 7am&ndash;7pm &middot; Sun Oct 25 noon&ndash;6pm &middot; Oct 26&ndash;30 7am&ndash;7pm",
      branch: "Weekdays only (Oct 19&ndash;23, 26&ndash;30), 8am&ndash;6pm &mdash; closed weekends"
    };
    function siteCard(title, hours, hit, lat, lng) {
      var s = hit.site;
      return '<div class="bx-card"><div class="bx-kicker">' + title + "</div>" +
        '<div style="font-weight:700;margin:2px 0">' + esc(s.n) + "</div>" +
        '<div style="font-size:13px;color:' + MUTED + '">' + (s.r ? esc(s.r) + " &middot; " : "") + esc(s.a) + "</div>" +
        '<div style="font-size:13px;margin-top:4px">' + hit.mi.toFixed(1) + " mi away &middot; " + hours + "</div>" +
        '<a class="bx-cta" href="' + dirLink(lat, lng, s) + '" target="_blank" rel="noopener">Directions &rarr;</a></div>';
    }
    function showPolling(lat, lng, label, isCurrent) {
      loadPolling().then(function (sites) {
        if (!isCurrent()) return;
        var isEv = function (s) { return s.k === "ev" || s.k === "both"; };
        var ev = nearest(sites, lat, lng, isEv);
        // Closest site is a weekday-only branch? Also offer the closest one open on the weekend.
        var evFull = ev && ev.site.h === "branch" ? nearest(sites, lat, lng, function (s) { return isEv(s) && s.h !== "branch"; }) : null;
        var ed = nearest(sites, lat, lng, function (s) { return s.k === "ed" || s.k === "both"; });

        resultLayer.clearLayers(); map.closePopup(); unhighlight();
        pin(lat, lng, RED, esc(label || "You are here"));
        var pts = [[lat, lng]];
        [[ev, "Early voting"], [evFull, "Early voting &middot; weekend hours"], [ed, "Election day"]].forEach(function (x) {
          if (!x[0]) return;
          var s = x[0].site;
          pin(s.lat, s.lng, INK, "<strong>" + esc(s.n) + "</strong><br>" + x[1] + " &middot; " + x[0].mi.toFixed(1) + " mi<br>" + esc(s.a) +
            '<br><a class="bx-cta" href="' + dirLink(lat, lng, s) + '" target="_blank" rel="noopener">Directions &rarr;</a>');
          pts.push([s.lat, s.lng]);
        });
        setResult('<div style="display:flex;gap:10px;flex-wrap:wrap">' +
          (ev ? siteCard("Closest early voting &middot; Oct 19&ndash;30", EV_HOURS[ev.site.h] || "", ev, lat, lng) : "") +
          (evFull ? siteCard("Closest with weekend hours", EV_HOURS.full, evFull, lat, lng) : "") +
          (ed ? siteCard("Closest on election day &middot; Tue Nov 3", "7am&ndash;7pm", ed, lat, lng)
              : '<div class="bx-card pending"><div class="bx-kicker">Election day &middot; Tue Nov 3</div>' +
                '<div style="font-size:13px;margin-top:4px">Open 7am&ndash;7pm. The county hasn&rsquo;t posted its Election Day vote centers yet &mdash; they&rsquo;ll appear here once published.</div></div>') +
          "</div>" +
          '<div class="bx-note">Bexar County uses vote centers &mdash; you can vote at <strong>any</strong> location in the county; these are just the closest to you.</div>');
        map.flyToBounds(L.latLngBounds(pts).pad(0.3), { maxZoom: 15 });
      }, function () {
        if (isCurrent()) setResult("Couldn&rsquo;t load polling locations. Please try again.", true);
      });
    }
    wireAddressForm($("bx-pform"), $("bx-pq"), $("bx-psugg"), function (lat, lng, label, isCurrent) {
      showPolling(lat, lng, label, isCurrent);
    });
    $("bx-pq").addEventListener("focus", function () { loadPolling().catch(function () {}); }, { once: true });  // prefetch
  }

  // ================================================================
  // Tabs (wired immediately — forms work while the map data is still loading)
  // ================================================================
  var tabBtns = document.querySelectorAll("#bx-wrap .bx-tab");
  var forms = document.querySelectorAll("#bx-wrap .bx-form");
  var current = null;
  function showTab(m, focus) {
    if (m === current) return;
    current = m;
    Array.prototype.forEach.call(forms, function (f) { f.classList.toggle("active", f.getAttribute("data-tab") === m); });
    Array.prototype.forEach.call(tabBtns, function (b) {
      var on = b.getAttribute("data-tab") === m;
      b.classList.toggle("active", on); b.setAttribute("aria-selected", on ? "true" : "false");
    });
    var loading = resultEl.innerHTML === "Loading map…";
    reset();
    if (loading) setResult("Loading map&hellip;");
    if (focus) { var inp = document.querySelector('#bx-wrap .bx-form.active .bx-input'); if (inp) inp.focus(); }
  }
  Array.prototype.forEach.call(tabBtns, function (btn) {
    btn.addEventListener("click", function () { showTab(btn.getAttribute("data-tab"), true); });
  });
  showTab(MODES[0], false);
}

  loadLeaflet(start);
})();
