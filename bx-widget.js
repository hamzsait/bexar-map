/*!
 * Bexar County public map widget — https://github.com/hamzsait/bexar-map
 *
 * This is the real widget. Sites embed bx-map.js (a tiny, never-changing
 * bootstrap) which loads this file + the GeoJSON from GitHub Pages so updates
 * reach visitors within ~10 minutes. Data files are loaded from the same
 * location this script was loaded from.
 */
(function () {
  var LEAFLET_CSS = { href: "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css", integrity: "sha256-p4NxAoJBhIIN+hmNHrzRCf9tD/miZyoHS5obTRR9BMY=" };
  var LEAFLET_JS  = { src:  "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js",  integrity: "sha256-20nQCchB9co0qIjJZRGuk2/Z9VM+kNiyxNV1lvTlZBo=" };

  // Where am I loaded from? Data lives next to this file.
  var me = document.currentScript || (function () { var s = document.getElementsByTagName("script"); return s[s.length - 1]; })();
  var DATA_BASE = (me && me.src ? me.src.replace(/\/[^\/]*$/, "") : "");

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

  // ---- styles + markup -----------------------------------------
  var style = document.createElement("style");
  style.textContent = '#bx-wrap { font-family: inherit; color: #fff; background:#ec1f27; border-radius:20px; padding:18px; box-sizing:border-box; width:100%; }\n  #bx-map .leaflet-container { font: 13px/1.4 "Prompt", Roboto, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }\n  #bx-wrap .bx-input { width:100%; box-sizing:border-box; padding:12px 16px; border:2px solid #1a1a1a; border-radius:999px; font-size:16px; font-family:inherit; color:#1a1a1a; background:#fff; outline:none; }\n  #bx-wrap .bx-input:focus { box-shadow:0 0 0 3px rgba(255,255,255,.55); }\n  #bx-wrap .bx-input::placeholder { color:#777777; }\n  #bx-wrap .bx-btn { padding:12px 22px; border-radius:999px; font-size:15px; font-weight:600; font-family:inherit; cursor:pointer; letter-spacing:.02em; white-space:nowrap; }\n  #bx-wrap .bx-btn-primary { background:#1a1a1a; color:#fff; border:2px solid #1a1a1a; }\n  #bx-wrap .bx-btn-primary:hover { background:#000; }\n  #bx-wrap .bx-btn-secondary { background:#fff; color:#1a1a1a; border:2px solid #1a1a1a; }\n  #bx-wrap .bx-btn-secondary:hover { background:#fdeceb; }\n  #bx-wrap .bx-sugg { position:absolute; left:12px; right:12px; top:calc(100% + 4px); z-index:2000; background:#fff; border:2px solid #1a1a1a; border-radius:14px; box-shadow:0 6px 18px rgba(0,0,0,.15); margin:0; padding:6px 0; list-style:none; max-height:280px; overflow-y:auto; }\n  #bx-wrap .bx-sugg li { padding:9px 16px; cursor:pointer; font-size:15px; line-height:1.3; color:#1a1a1a; }\n  #bx-wrap .bx-sugg li small { display:block; color:#666666; font-size:12.5px; }\n  #bx-wrap .bx-sugg li:hover, #bx-wrap .bx-sugg li.active { background:#fdeceb; }\n  #bx-map .precinct-tip { background:#1a1a1a; color:#fff; border:0; border-radius:8px; padding:5px 10px; font-weight:600; box-shadow:0 2px 8px rgba(0,0,0,.3); }\n  #bx-map .precinct-tip::before { display:none; }\n  #bx-map .bx-legend { background:#fff; color:#1a1a1a; padding:10px 12px; border-radius:10px; border:2px solid #1a1a1a; line-height:1.7; font-size:13px; }\n  #bx-map .bx-legend .sw { display:inline-block; width:22px; height:13px; vertical-align:middle; margin-right:7px; border-radius:3px; box-sizing:border-box; }\n  #bx-map .leaflet-popup-content-wrapper { border-radius:12px; border:2px solid #1a1a1a; box-shadow:0 6px 18px rgba(0,0,0,.18); color:#1a1a1a; }\n  #bx-map .leaflet-popup-tip { background:#1a1a1a; }\n  #bx-map .leaflet-bar a { color:#1a1a1a; }\n  #bx-map.leaflet-container:focus:not(:focus-visible) { outline:none; }\n  #bx-map .leaflet-tile-pane { filter: grayscale(1) contrast(.9) brightness(1.04); }\n  #bx-map .leaflet-control-attribution a { color:#1a1a1a; }\n  #bx-wrap .bx-cta, #bx-map .bx-cta { display:inline-block; margin-top:8px; padding:7px 14px; border-radius:999px; background:#ec1f27; color:#fff !important; font-weight:600; font-size:13px; text-decoration:none !important; border:2px solid #fff; box-shadow:0 0 0 2px #ec1f27; }\n  #bx-wrap .bx-cta:hover, #bx-map .bx-cta:hover { background:#c4161d; }\n  #bx-wrap .bx-tab { padding:9px 20px; border-radius:999px; font-size:14px; font-weight:600; font-family:inherit; cursor:pointer; background:#fff; color:#1a1a1a; border:2px solid #1a1a1a; }\n  #bx-wrap .bx-tab.active { background:#1a1a1a; border-color:#1a1a1a; color:#fff; }\n  #bx-wrap .bx-sugg li .bx-badge { display:inline-block; font-size:11px; font-weight:700; padding:1px 8px; border-radius:999px; margin-left:6px; vertical-align:1px; }\n  #bx-wrap .bx-badge-active { background:#e7f5ec; color:#177245; }\n  #bx-wrap .bx-badge-susp { background:#fdeee3; color:#c2410c; }\n  #bx-wrap .bx-note { font-size:12.5px; color:rgba(255,255,255,.92); margin:6px 4px 0; }\n  #bx-result .bx-note { color:#666666; }\n  #bx-result:not(:empty) { background:#fff; color:#1a1a1a; border-radius:14px; padding:12px 14px; }\n  #bx-wrap .bx-header { display:flex; align-items:center; gap:16px; color:#fff; margin:0 0 16px; }\n  #bx-wrap .bx-logo { flex:0 0 88px; width:88px; height:88px; border-radius:50%; background:#fff; display:flex; align-items:center; justify-content:center; box-shadow:0 2px 8px rgba(0,0,0,.18); }\n  #bx-wrap .bx-logo img { width:70px; height:auto; display:block; }\n  #bx-wrap .bx-title { font-size:26px; font-weight:800; letter-spacing:-.01em; line-height:1.15; text-transform:uppercase; }\n  #bx-wrap .bx-sub { font-size:13.5px; opacity:.92; margin-top:2px; }\n  @media (max-width:520px) { #bx-wrap .bx-title { font-size:19px; } #bx-wrap .bx-logo { width:60px; height:60px; flex-basis:60px; } #bx-wrap .bx-logo img { width:46px; } }';
  document.head.appendChild(style);

  var TAB_LABELS = { voter: "Voter lookup", address: "Address search", polling: "Polling places" };
  var FORMS = {
    voter: '<form id="bx-vform" style="display:none;margin:0 0 10px">\n    <div style="position:relative">\n      <input id="bx-vq" class="bx-input" type="text" placeholder="Type a name to check voter registration (e.g. Garcia Maria)…" autocomplete="off" />\n      <ul id="bx-vsugg" class="bx-sugg" hidden></ul>\n    </div>\n    <div class="bx-note">Searches the Bexar County voter roll (county list as of February 2026 &mdash; newer registrations won&rsquo;t appear).</div>\n  </form>',
    address: '<form id="bx-search" style="display:none;gap:10px;flex-wrap:wrap;margin:0 0 10px">\n    <div style="flex:1 1 260px;min-width:0;position:relative">\n      <input id="bx-q" class="bx-input" type="text" placeholder="Start typing a Bexar County address…" autocomplete="off" />\n      <ul id="bx-sugg" class="bx-sugg" hidden></ul>\n    </div>\n    <button type="submit" class="bx-btn bx-btn-primary">Search</button>\n    <button type="button" id="bx-locate" class="bx-btn bx-btn-secondary">&#9673; Use my location</button>\n  </form>',
    polling: '<form id="bx-pform" style="display:none;gap:10px;flex-wrap:wrap;margin:0 0 10px">\n    <div style="flex:1 1 260px;min-width:0;position:relative">\n      <input id="bx-pq" class="bx-input" type="text" placeholder="Your address — we&rsquo;ll find your closest place to vote…" autocomplete="off" />\n      <ul id="bx-psugg" class="bx-sugg" hidden></ul>\n    </div>\n    <button type="submit" class="bx-btn bx-btn-primary">Find</button>\n    <button type="button" id="bx-plocate" class="bx-btn bx-btn-secondary">&#9673; Use my location</button>\n  </form>'
  };
  var tabBar = MODES.length > 1
    ? '<div style="display:flex;gap:8px;flex-wrap:wrap;margin:0 0 10px">' + MODES.map(function (m, i) {
        return '<button type="button" class="bx-tab' + (i === 0 ? " active" : "") + '" data-tab="' + m + '">' + TAB_LABELS[m] + "</button>";
      }).join("") + "</div>"
    : "";
  // Red header band with a rose. data-title="..." changes the heading; data-header="off" hides the band.
  // San Antonio DSA chapter logo (from sanantoniodsa.org), on a white disc so the red rose reads on the red panel.
  var LOGO = '<span class="bx-logo"><img src="' + (DATA_BASE ? DATA_BASE.replace(/\/$/, "") + "/" : "") + 'sa-dsa-logo.png" alt="San Antonio DSA" /></span>';
  var TITLE = root.getAttribute("data-title") || "Bexar County Voter Map";
  var header = root.getAttribute("data-header") === "off" ? "" :
    '<div class="bx-header">' + LOGO + '<div><div class="bx-title">' + TITLE.replace(/[<>&]/g, "") + "</div>" +
    '<div class="bx-sub">Check your registration &middot; find your precinct &middot; find where to vote</div></div></div>';
  root.innerHTML = '<div id="bx-wrap">\n  ' + header + tabBar + "\n  " +
    MODES.map(function (m) { return FORMS[m]; }).join("\n  ") +
    '\n  <div id="bx-result" style="margin:0 0 12px;font-size:16px"></div>\n  <div id="bx-map" style="height:560px;width:100%;border-radius:16px;overflow:hidden;background:#f2f2f2;border:3px solid #fff"></div>\n</div>';

  // ---- load Leaflet (once), then boot ---------------------------
  function loadLeaflet(cb) {
    if (!document.querySelector('link[href="' + LEAFLET_CSS.href + '"]')) {
      var l = document.createElement("link"); l.rel = "stylesheet"; l.href = LEAFLET_CSS.href;
      l.integrity = LEAFLET_CSS.integrity; l.crossOrigin = ""; document.head.appendChild(l);
    }
    if (window.L && L.geoJSON) return cb();
    var s = document.createElement("script"); s.src = LEAFLET_JS.src; s.integrity = LEAFLET_JS.integrity;
    s.crossOrigin = ""; s.onload = cb;
    s.onerror = function () { document.getElementById("bx-map").innerHTML = '<p style="padding:1em;color:#b91c1c">Map library failed to load.</p>'; };
    document.head.appendChild(s);
  }

function start(DATA_BASE) {
  var INK = "#1a1a1a", RED = "#ec1f27";
  // ------------------------------------------------------------

  function base(p) { return (DATA_BASE ? DATA_BASE.replace(/\/$/, "") + "/" : "") + p; }

  var map = L.map("bx-map", { scrollWheelZoom: false, zoomControl: true, zoomSnap: 0.25 })
    .setView([29.45, -98.52], 10);

  L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 18,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &middot; Boundaries, addresses &amp; voter roll: Bexar County'
  }).addTo(map);

  var precinctLayer, outlineLayer;

  Promise.all([
    fetch(base("bx-precincts.geojson")).then(function (r) { return r.json(); }),
    fetch(base("bx-outline.geojson")).then(function (r) { return r.json(); }),
    fetch(base("bx-voters.json")).then(function (r) { return r.json(); }).catch(function () { return {}; })
  ]).then(function (res) {
    var precincts = res[0], outline = res[1], voterCounts = res[2];

    // 1) Light county shading underneath everything
    L.geoJSON(outline, { style: { stroke: false, fillColor: RED, fillOpacity: 0.06 }, interactive: false }).addTo(map);

    // 2) Precinct boundaries (hover to highlight in orange)
    // One canvas for all 806 precincts: hover hit-testing stays reliable (SVG paths
    // re-ordered by bringToFront can swallow mouseout, leaving stale highlights).
    // Only one precinct is ever highlighted; any new hover/tap clears the old one.
    var hovered = null;
    function unhighlight() { if (hovered) { precinctLayer.resetStyle(hovered); hovered.closeTooltip(); hovered = null; } }
    function highlight(layer) {
      if (hovered === layer) return;
      unhighlight();
      hovered = layer;
      layer.setStyle({ fillColor: RED, fillOpacity: 0.35, color: RED, weight: 2.5, opacity: 1 });
      layer.bringToFront();
    }
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

    map.on("click", unhighlight);                                  // tap empty map clears
    map.getContainer().addEventListener("mouseleave", unhighlight);

    // 3) Bold county outline on top
    outlineLayer = L.geoJSON(outline, { style: { color: RED, weight: 3.5, opacity: 1, fill: false }, interactive: false }).addTo(map);
    outlineLayer.bringToFront();

    function fit() { map.invalidateSize(); map.fitBounds(outlineLayer.getBounds(), { padding: [12, 12] }); }
    fit();
    setTimeout(fit, 300);
    window.addEventListener("load", fit);

    var legend = L.control({ position: "bottomleft" });
    legend.onAdd = function () {
      var d = L.DomUtil.create("div", "bx-legend");
      d.innerHTML =
        '<div><span class="sw" style="border:2px solid ' + RED + ';background:rgba(236,31,39,.08)"></span><strong>Bexar County</strong></div>' +
        '<div><span class="sw" style="border:1px solid ' + INK + ';opacity:.7"></span>Voting precinct</div>';
      return d;
    };
    legend.addTo(map);
    enableLookup(precincts, outline);
  }).catch(function (err) {
    document.getElementById("bx-map").innerHTML =
      '<p style="padding:1em;color:#b91c1c">Map data failed to load.</p>';
    console.error("Bexar map:", err);
  });

  // Squarespace sometimes lays the block out after Leaflet measures it.
  setTimeout(function () { map.invalidateSize(); }, 300);

  // ---- Address search + geolocation --------------------------
  var form = document.getElementById("bx-search"),
      input = document.getElementById("bx-q"),
      locateBtn = document.getElementById("bx-locate"),
      resultEl = document.getElementById("bx-result"),
      resultLayer = L.layerGroup().addTo(map),   // every search pin / polling pin lives here
      gen = 0;                                   // bumped on each new search or tab switch

  // Clear everything a previous search put on the map.
  function clearResults() { resultLayer.clearLayers(); map.closePopup(); }
  // Start a new search: invalidates any older in-flight one. Returns isCurrent().
  function begin() { var mine = ++gen; return function () { return mine === gen; }; }

  // Ray-casting point-in-polygon for GeoJSON Polygon / MultiPolygon ([lng, lat]).
  function inRing(pt, ring) {
    var x = pt[0], y = pt[1], inside = false;
    for (var i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      var xi = ring[i][0], yi = ring[i][1], xj = ring[j][0], yj = ring[j][1];
      if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) inside = !inside;
    }
    return inside;
  }
  function inPolygon(pt, polyCoords) {           // outer ring + holes
    if (!inRing(pt, polyCoords[0])) return false;
    for (var h = 1; h < polyCoords.length; h++) if (inRing(pt, polyCoords[h])) return false;
    return true;
  }
  function inFeature(pt, f) {
    var g = f.geometry;
    if (g.type === "Polygon") return inPolygon(pt, g.coordinates);
    if (g.type === "MultiPolygon") return g.coordinates.some(function (p) { return inPolygon(pt, p); });
    return false;
  }

  function setResult(html, isErr) {
    resultEl.innerHTML = html;
    resultEl.style.color = isErr ? "#c4161d" : "#1a1a1a";
  }

  function enableLookup(precincts, outline) {
    function showPoint(lat, lng, label, info) {
      var pt = [lng, lat];
      var inCounty = inFeature(pt, outline.features[0]);
      var pct = null;
      for (var i = 0; i < precincts.features.length; i++) {
        if (inFeature(pt, precincts.features[i])) { pct = precincts.features[i].properties.p; break; }
      }
      clearResults();
      var marker = L.circleMarker([lat, lng], { radius: 9, color: "#fff", weight: 3, fillColor: RED, fillOpacity: 1 }).addTo(resultLayer);
      var msg = inCounty
        ? '<strong style="color:#ec1f27">&#10003; In Bexar County</strong>' + (pct != null ? ' <span style="color:#1a1a1a">&middot; Precinct ' + pct + "</span>" : "")
        : '<strong style="color:#1a1a1a">Outside Bexar County</strong>';
      if (info) msg = info + "<br>" + msg;
      if (label) msg += '<div style="font-size:13px;color:#666666">' + label + "</div>";
      marker.bindPopup(msg).openPopup();
      setResult(msg);
      map.flyTo([lat, lng], Math.max(map.getZoom(), 13.5));
    }

    // ---- Bexar County address locator (typeahead + house-number interpolation)
    var GEO = "https://maps.bexar.org/arcgis/rest/services/Locators/BeCoMultiRole/GeocodeServer";
    var suggEl = document.getElementById("bx-sugg"),
        suggestions = [], activeIdx = -1, debounceT = null, lastReq = 0;

    function titleCase(t) {
      return t.replace(/\w\S*/g, function (w) {
        var core = w.replace(/[^A-Za-z]/g, "");
        if (/^\d+(ST|ND|RD|TH)\b/i.test(w)) return w.toLowerCase();          // 11TH -> 11th
        return /^(TX|NE|NW|SE|SW|N|S|E|W|IH|US|FM|RM|RR)$/.test(core) || /\d/.test(w) ? w : w.charAt(0) + w.slice(1).toLowerCase();
      });
    }
    function suggest(q) {
      var url = GEO + "/suggest?f=json&maxSuggestions=6&text=" + encodeURIComponent(q);
      return fetch(url).then(function (r) { return r.json(); }).then(function (j) { return j.suggestions || []; });
    }
    function geocode(text, magicKey) {
      var url = GEO + "/findAddressCandidates?f=json&outSR=4326&maxLocations=1&SingleLine=" + encodeURIComponent(text) +
                (magicKey ? "&magicKey=" + encodeURIComponent(magicKey) : "");
      return fetch(url).then(function (r) { return r.json(); }).then(function (j) {
        var c = (j.candidates || [])[0];
        return c && c.score >= 60 ? c : null;
      });
    }
    function labelOf(sg) {
      var parts = sg.text.split(","), main = titleCase(parts[0].trim());
      return { main: main, sub: parts.slice(1).join(",").replace(/^\s+/, "").replace(/\b(\w)(\w*)/g, function (_, a, b) { return a + b.toLowerCase(); }).replace(/\bTx\b/, "TX") };
    }
    function hideSugg() { suggEl.hidden = true; suggEl.innerHTML = ""; suggestions = []; activeIdx = -1; }
    function renderSugg(list) {
      suggestions = list; activeIdx = -1; suggEl.innerHTML = "";
      if (!list.length) { hideSugg(); return; }
      list.forEach(function (sg, i) {
        var l = labelOf(sg), li = document.createElement("li");
        li.innerHTML = l.main + (l.sub ? "<small>" + l.sub + "</small>" : "");
        li.addEventListener("mousedown", function (e) { e.preventDefault(); choose(i); });
        suggEl.appendChild(li);
      });
      suggEl.hidden = false;
    }
    function setActive(i) {
      activeIdx = i;
      Array.prototype.forEach.call(suggEl.children, function (li, k) { li.classList.toggle("active", k === i); });
    }
    function locate(text, magicKey) {
      var isCurrent = begin();
      setResult("Searching&hellip;");
      geocode(text, magicKey).then(function (c) {
        if (!isCurrent()) return;
        if (!c) { setResult("Couldn't find that address. Try adding the street name or ZIP code.", true); return; }
        input.value = titleCase(c.address);
        showPoint(c.location.y, c.location.x, titleCase(c.address));
      }).catch(function () { if (isCurrent()) setResult("Address lookup failed. Please try again.", true); });
    }
    function choose(i) {
      var sg = suggestions[i]; if (!sg) return;
      hideSugg();
      // If the user typed a house number but the suggestion is just a street, keep their number.
      var num = (input.value.trim().match(/^\d+[A-Za-z]?\b/) || [])[0];
      if (num && !/^\d/.test(sg.text)) locate(num + " " + sg.text, null);
      else locate(sg.text, sg.magicKey);
    }

    if (form) {
    input.addEventListener("input", function () {
      var q = input.value.trim();
      clearTimeout(debounceT);
      if (q.length < 3) { hideSugg(); return; }
      debounceT = setTimeout(function () {
        var reqId = ++lastReq;
        suggest(q).then(function (list) { if (reqId === lastReq) renderSugg(list); })
                  .catch(function () {});
      }, 250);
    });
    input.addEventListener("keydown", function (e) {
      if (suggEl.hidden) return;
      if (e.key === "ArrowDown") { e.preventDefault(); setActive(Math.min(activeIdx + 1, suggestions.length - 1)); }
      else if (e.key === "ArrowUp") { e.preventDefault(); setActive(Math.max(activeIdx - 1, 0)); }
      else if (e.key === "Enter" && activeIdx >= 0) { e.preventDefault(); choose(activeIdx); }
      else if (e.key === "Escape") { hideSugg(); }
    });
    input.addEventListener("blur", function () { setTimeout(hideSugg, 150); });

    form.addEventListener("submit", function (e) {
      e.preventDefault();
      clearTimeout(debounceT);
      var q = input.value.trim();
      if (!q) return;
      if (!suggEl.hidden && suggestions.length) { choose(activeIdx >= 0 ? activeIdx : 0); return; }
      hideSugg();
      locate(q, null);
    });

    locateBtn.addEventListener("click", function () {
      if (!navigator.geolocation) { setResult("Your browser doesn't support location.", true); return; }
      var isCurrent = begin();
      setResult("Getting your location&hellip;");
      navigator.geolocation.getCurrentPosition(
        function (pos) { if (isCurrent()) showPoint(pos.coords.latitude, pos.coords.longitude, "Your current location"); },
        function (err) {
          if (isCurrent()) setResult(err.code === 1 ? "Location access was denied. You can type an address instead." : "Couldn't get your location.", true);
        },
        { enableHighAccuracy: true, timeout: 10000 }
      );
    });
    }   // end if (form)

    // ---- Tabs ---------------------------------------------------
    var vform = document.getElementById("bx-vform"),
        vinput = document.getElementById("bx-vq"),
        vsuggEl = document.getElementById("bx-vsugg"),
        pform = document.getElementById("bx-pform"),
        pinput = document.getElementById("bx-pq"),
        psuggEl = document.getElementById("bx-psugg"),
        tabBtns = document.querySelectorAll("#bx-wrap .bx-tab");
    var tabForms = { voter: vform, address: form, polling: pform };
    var tabInputs = { voter: vinput, address: input, polling: pinput };
    function showTab(m, focus) {
      Object.keys(tabForms).forEach(function (k) {
        if (tabForms[k]) tabForms[k].style.display = (k === m) ? (k === "voter" ? "block" : "flex") : "none";
      });
      Array.prototype.forEach.call(tabBtns, function (b) { b.classList.toggle("active", b.getAttribute("data-tab") === m); });
      begin();              // drop any search still in flight
      clearResults();
      setResult("");
      if (focus && tabInputs[m]) tabInputs[m].focus();
    }
    Array.prototype.forEach.call(tabBtns, function (btn) {
      btn.addEventListener("click", function () { showTab(btn.getAttribute("data-tab"), true); });
    });
    showTab(MODES[0], false);

    // ---- Voter lookup (Bexar County voter roll, sharded) ------
    // bx-voters/XX.json holds every voter whose last name (or any part of a
    // hyphenated/compound last name) starts with XX. We load the shard for the
    // first two letters of each word typed, so word order doesn't matter.
    var shardCache = {}, vDebounce = null, vMatches = [], vActive = -1;
    var V_SHOW = 12, V_CAP = 100;

    function queryTokens(q) { return q.toUpperCase().split(/[\s,]+/).filter(Boolean); }
    function loadShard(k) {
      if (!shardCache[k]) {
        shardCache[k] = fetch(base("bx-voters/" + k + ".json"))
          .then(function (r) { return r.ok ? r.json() : []; })   // no shard = no last names start with k
          .catch(function () { delete shardCache[k]; throw new Error("shard " + k); });
      }
      return shardCache[k];
    }
    function loadVoters(q) {
      var keys = {};
      queryTokens(q).forEach(function (t) { if (/^[A-Z]{2}/.test(t)) keys[t.slice(0, 2)] = 1; });
      var ks = Object.keys(keys);
      if (!ks.length) return Promise.resolve([]);
      var slow = setTimeout(function () { setResult("Loading voter list&hellip;"); }, 400);
      return Promise.all(ks.map(loadShard))
        .then(function (lists) { clearTimeout(slow); setResult(""); return lists; })
        .catch(function () { clearTimeout(slow); setResult("Couldn't load the voter list. Please try again.", true); return []; });
    }
    function searchVoters(q, lists) {
      // Every typed word must be the start of some word in the name ("GARC MAR" matches "GARCIA, MARIA").
      // Best matches first: last name starts with a typed word AND first name starts with another.
      var toks = queryTokens(q), hits = [], seen = {};
      for (var L = 0; L < lists.length; L++) {
        var list = lists[L];
        for (var i = 0; i < list.length; i++) {
          var words = " " + list[i][0].replace(/[,\-']/g, " ");
          var ok = true;
          for (var t = 0; t < toks.length; t++) if (words.indexOf(" " + toks[t]) === -1) { ok = false; break; }
          if (!ok) continue;
          var id = list[i].join("|");
          if (seen[id]) continue;          // same voter can sit in two shards
          seen[id] = 1;
          var parts = list[i][0].split(","), last = parts[0], first = (parts[1] || "").trim();
          var score = 2;
          for (var a = 0; a < toks.length; a++) {
            if (last.indexOf(toks[a]) !== 0) continue;
            score = 1;
            if (toks.length === 1) { score = 0; break; }
            for (var b = 0; b < toks.length; b++) if (b !== a && first.indexOf(toks[b]) === 0) { score = 0; break; }
            if (!score) break;
          }
          hits.push([score, list[i]]);
        }
      }
      hits.sort(function (x, y) { return x[0] - y[0]; });   // stable: keeps alphabetical order within a score
      return hits.slice(0, V_CAP).map(function (h) { return h[1]; });
    }
    function hideVsugg() { vsuggEl.hidden = true; vsuggEl.innerHTML = ""; vMatches = []; vActive = -1; }
    function markV() { Array.prototype.forEach.call(vsuggEl.children, function (li, k) { li.classList.toggle("active", k === vActive); }); }
    function renderVoters(list) {
      vMatches = list; vActive = -1; vsuggEl.innerHTML = "";
      if (!list.length) {
        vsuggEl.innerHTML = '<li style="cursor:default;color:#666666">No matching Bexar County voters found</li>';
        vsuggEl.hidden = false; return;
      }
      list.slice(0, V_SHOW).forEach(function (v, i) {
        var li = document.createElement("li");
        var addr = v[3].indexOf("***") !== -1 ? "<em>Address confidential</em>" : titleCase(v[3]);
        li.innerHTML = titleCase(v[0]) +
          '<span class="bx-badge ' + (v[2] ? 'bx-badge-active">Active' : 'bx-badge-susp">Suspense') + "</span>" +
          "<small>" + addr + " &middot; Precinct " + v[1] + "</small>";
        li.addEventListener("mousedown", function (e) { e.preventDefault(); chooseVoter(i); });
        vsuggEl.appendChild(li);
      });
      if (list.length > V_SHOW) {
        var more = document.createElement("li");
        more.style.cursor = "default"; more.style.color = "#666666";
        more.textContent = (list.length >= V_CAP ? V_CAP + "+" : list.length) + " matches — keep typing to narrow down";
        vsuggEl.appendChild(more);
      }
      vsuggEl.hidden = false;
    }
    function chooseVoter(i) {
      var v = vMatches[i]; if (!v) return;
      hideVsugg();
      vinput.value = titleCase(v[0]);
      var info = "<strong>" + titleCase(v[0]) + "</strong> " +
        '<span style="font-weight:600;color:' + (v[2] ? '#177245">Active' : '#c2410c">Suspense') + "</span>" +
        ' <span style="color:#1a1a1a">&middot; Registered in Precinct ' + v[1] + "</span>";
      if (v[3].indexOf("***") !== -1) {   // county-redacted (address confidentiality program)
        setResult(info + '<div style="font-size:13px;color:#666666">This voter&rsquo;s address is confidential in the county&rsquo;s public records, so it can&rsquo;t be shown on the map.</div>');
        return;
      }
      var isCurrent = begin();
      setResult("Locating&hellip;");
      geocode(v[3], null).then(function (c) {
        if (!isCurrent()) return;
        if (c) showPoint(c.location.y, c.location.x, titleCase(c.address), info);
        else setResult(info + '<div style="font-size:13px;color:#666666">' + titleCase(v[3]) + " (couldn&rsquo;t place on the map)</div>");
      }).catch(function () { if (isCurrent()) setResult(info); });
    }

    if (vform) {
    vinput.addEventListener("input", function () {
      var q = vinput.value.trim();
      clearTimeout(vDebounce);
      if (q.length < 3) { hideVsugg(); return; }
      vDebounce = setTimeout(function () {
        loadVoters(q).then(function (lists) { if (vinput.value.trim() === q) renderVoters(searchVoters(q, lists)); });
      }, 200);
    });
    vinput.addEventListener("keydown", function (e) {
      if (vsuggEl.hidden) return;
      var n = Math.min(vMatches.length, V_SHOW);
      if (e.key === "ArrowDown") { e.preventDefault(); vActive = Math.min(vActive + 1, n - 1); markV(); }
      else if (e.key === "ArrowUp") { e.preventDefault(); vActive = Math.max(vActive - 1, 0); markV(); }
      else if (e.key === "Enter") { e.preventDefault(); if (vMatches.length) chooseVoter(vActive >= 0 ? vActive : 0); }
      else if (e.key === "Escape") hideVsugg();
    });
    vinput.addEventListener("blur", function () { setTimeout(hideVsugg, 150); });
    vform.addEventListener("submit", function (e) {
      e.preventDefault();
      if (vMatches.length) chooseVoter(vActive >= 0 ? vActive : 0);
    });
    }   // end if (vform)

    // ---- Polling place finder ----------------------------------
    // Bexar County uses countywide vote centers: any registered Bexar
    // County voter may vote at ANY location. We show the closest ones.
    if (pform) {
    var pollData = null, pollLoading = null, pDebounce = null, pSuggs = [], pActive = -1;

    function loadPolling() {
      if (pollLoading) return pollLoading;
      pollLoading = fetch(base("bx-polling.json"))
        .then(function (r) { return r.json(); })
        .then(function (d) { pollData = d; return d; })
        .catch(function () { pollLoading = null; setResult("Couldn't load polling locations. Please try again.", true); return null; });
      return pollLoading;
    }
    function milesBetween(aLat, aLng, bLat, bLng) {
      var R = 3958.8, dLat = (bLat - aLat) * Math.PI / 180, dLng = (bLng - aLng) * Math.PI / 180;
      var h = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
              Math.cos(aLat * Math.PI / 180) * Math.cos(bLat * Math.PI / 180) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
      return 2 * R * Math.asin(Math.sqrt(h));
    }
    function nearest(lat, lng, kind) {
      var best = null, bestD = Infinity;
      for (var i = 0; i < pollData.length; i++) {
        var s = pollData[i];
        if (s.k !== kind && s.k !== "both") continue;
        var d = milesBetween(lat, lng, s.lat, s.lng);
        if (d < bestD) { bestD = d; best = s; }
      }
      return best ? { site: best, mi: bestD } : null;
    }
    function dirLink(fromLat, fromLng, site) {
      return "https://www.google.com/maps/dir/?api=1&origin=" + fromLat + "," + fromLng +
        "&destination=" + encodeURIComponent(site.a) + "&travelmode=driving";
    }
    // Hours from the county's Nov 3, 2026 early-voting notice.
    var EV_HOURS = {
      full: "Oct 19&ndash;23 8am&ndash;6pm &middot; Sat Oct 24 7am&ndash;7pm &middot; Sun Oct 25 noon&ndash;6pm &middot; Oct 26&ndash;30 7am&ndash;7pm",
      branch: "Weekdays only (Oct 19&ndash;23, 26&ndash;30), 8am&ndash;6pm"
    };
    function siteCard(title, hours, hit, fromLat, fromLng) {
      var s = hit.site;
      return '<div style="flex:1 1 240px;border:2px solid #1a1a1a;border-radius:14px;padding:12px 14px;background:#fff">' +
        '<div style="font-size:12px;font-weight:700;letter-spacing:.05em;text-transform:uppercase;color:#ec1f27">' + title + "</div>" +
        '<div style="font-weight:700;margin:2px 0">' + s.n + "</div>" +
        '<div style="font-size:13px;color:#666666">' + (s.r ? s.r + " &middot; " : "") + s.a + "</div>" +
        '<div style="font-size:13px;margin-top:4px">' + hit.mi.toFixed(1) + " mi away &middot; " + hours +
        (s.note ? "<br><em>" + s.note + "</em>" : "") + "</div>" +
        '<a class="bx-cta" href="' + dirLink(fromLat, fromLng, s) + '" target="_blank" rel="noopener">Directions &rarr;</a></div>';
    }
    function showPolling(lat, lng, label, isCurrent) {
      loadPolling().then(function (d) {
        if (!d || (isCurrent && !isCurrent())) return;
        var ev = nearest(lat, lng, "ev"), ed = nearest(lat, lng, "ed");
        clearResults();
        L.circleMarker([lat, lng], { radius: 9, color: "#fff", weight: 3, fillColor: RED, fillOpacity: 1 })
          .addTo(resultLayer).bindPopup(label || "You are here");
        var pts = [[lat, lng]];
        [{ hit: ev, t: "Early voting" }, { hit: ed, t: "Election day" }].forEach(function (x) {
          if (!x.hit) return;
          var s = x.hit.site;
          var m = L.circleMarker([s.lat, s.lng], { radius: 8, color: "#fff", weight: 3, fillColor: INK, fillOpacity: 1 })
            .addTo(resultLayer).bindPopup("<strong>" + s.n + "</strong><br>" + x.t + " &middot; " + x.hit.mi.toFixed(1) + " mi<br>" + s.a +
              '<br><a class="bx-cta" href="' + dirLink(lat, lng, s) + '" target="_blank" rel="noopener">Directions &rarr;</a>');
          pts.push([s.lat, s.lng]);
        });
        var html = '<div style="display:flex;gap:10px;flex-wrap:wrap">' +
          (ev ? siteCard("Closest early voting &middot; Oct 19&ndash;30", EV_HOURS[ev.site.h] || "", ev, lat, lng) : "") +
          (ed ? siteCard("Closest on election day &middot; Tue Nov 3", "7am&ndash;7pm", ed, lat, lng)
              : '<div style="flex:1 1 240px;border:2px dashed #1a1a1a;border-radius:14px;padding:12px 14px;background:#fff">' +
                '<div style="font-size:12px;font-weight:700;letter-spacing:.05em;text-transform:uppercase;color:#ec1f27">Election day &middot; Tue Nov 3</div>' +
                '<div style="font-size:13px;margin-top:4px">Open 7am&ndash;7pm. The county hasn&rsquo;t posted its Election Day vote centers yet &mdash; they&rsquo;ll appear here once published.</div></div>') + "</div>" +
          '<div class="bx-note">Bexar County uses vote centers &mdash; you can vote at <strong>any</strong> location in the county; these are just the closest to you.</div>';
        setResult(html);
        map.flyToBounds(L.latLngBounds(pts).pad(0.3), { maxZoom: 15 });
      });
    }

    function pHideSugg() { psuggEl.hidden = true; psuggEl.innerHTML = ""; pSuggs = []; pActive = -1; }
    function pRenderSugg(list) {
      pSuggs = list; pActive = -1; psuggEl.innerHTML = "";
      if (!list.length) { pHideSugg(); return; }
      list.forEach(function (sg, i) {
        var l = labelOf(sg), li = document.createElement("li");
        li.innerHTML = l.main + (l.sub ? "<small>" + l.sub + "</small>" : "");
        li.addEventListener("mousedown", function (e) { e.preventDefault(); pChoose(i); });
        psuggEl.appendChild(li);
      });
      psuggEl.hidden = false;
    }
    function pLocate(text, magicKey) {
      var isCurrent = begin();
      setResult("Searching&hellip;");
      loadPolling();                                  // start the data fetch in parallel
      geocode(text, magicKey).then(function (c) {
        if (!isCurrent()) return;
        if (!c) { setResult("Couldn't find that address. Try adding the street name or ZIP code.", true); return; }
        pinput.value = titleCase(c.address);
        showPolling(c.location.y, c.location.x, titleCase(c.address), isCurrent);
      }).catch(function () { if (isCurrent()) setResult("Address lookup failed. Please try again.", true); });
    }
    function pChoose(i) {
      var sg = pSuggs[i]; if (!sg) return;
      pHideSugg();
      var num = (pinput.value.trim().match(/^\d+[A-Za-z]?\b/) || [])[0];
      if (num && !/^\d/.test(sg.text)) pLocate(num + " " + sg.text, null);
      else pLocate(sg.text, sg.magicKey);
    }
    pinput.addEventListener("input", function () {
      var q = pinput.value.trim();
      clearTimeout(pDebounce);
      if (q.length < 3) { pHideSugg(); return; }
      pDebounce = setTimeout(function () {
        suggest(q).then(function (list) { if (pinput.value.trim() === q) pRenderSugg(list); }).catch(function () {});
      }, 250);
    });
    pinput.addEventListener("keydown", function (e) {
      if (psuggEl.hidden) return;
      if (e.key === "ArrowDown") { e.preventDefault(); pActive = Math.min(pActive + 1, pSuggs.length - 1); }
      else if (e.key === "ArrowUp") { e.preventDefault(); pActive = Math.max(pActive - 1, 0); }
      else if (e.key === "Enter" && pActive >= 0) { e.preventDefault(); pChoose(pActive); return; }
      else if (e.key === "Escape") { pHideSugg(); return; }
      Array.prototype.forEach.call(psuggEl.children, function (li, k) { li.classList.toggle("active", k === pActive); });
    });
    pinput.addEventListener("blur", function () { setTimeout(pHideSugg, 150); });
    pform.addEventListener("submit", function (e) {
      e.preventDefault();
      clearTimeout(pDebounce);
      var q = pinput.value.trim();
      if (!q) return;
      if (!psuggEl.hidden && pSuggs.length) { pChoose(pActive >= 0 ? pActive : 0); return; }
      pHideSugg();
      pLocate(q, null);
    });
    document.getElementById("bx-plocate").addEventListener("click", function () {
      if (!navigator.geolocation) { setResult("Your browser doesn't support location.", true); return; }
      var isCurrent = begin();
      setResult("Getting your location&hellip;");
      loadPolling();
      navigator.geolocation.getCurrentPosition(
        function (pos) { if (isCurrent()) showPolling(pos.coords.latitude, pos.coords.longitude, "Your current location", isCurrent); },
        function (err) {
          if (isCurrent()) setResult(err.code === 1 ? "Location access was denied. You can type an address instead." : "Couldn't get your location.", true);
        },
        { enableHighAccuracy: true, timeout: 10000 }
      );
    });
    }   // end if (pform)
  }
}

  loadLeaflet(function () { start(DATA_BASE); });
})();
