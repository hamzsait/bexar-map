/*!
 * Bexar County map — bootstrap. https://github.com/hamzsait/bexar-map
 *
 * Embed with:
 *   <div id="bx-map-root"></div>
 *   <script src="https://hamzsait.github.io/bexar-map/bx-map.js"></script>
 *
 * This file intentionally never changes (CDNs and browsers cache it for days).
 * It loads the actual widget (bx-widget.js) from GitHub Pages, which is served
 * with a 10-minute cache, so pushes to the repo go live quickly for everyone.
 */
(function () {
  var PAGES = "https://hamzsait.github.io/bexar-map";
  var me = document.currentScript || (function () { var s = document.getElementsByTagName("script"); return s[s.length - 1]; })();
  var here = me && me.src ? me.src.replace(/\/[^\/]*$/, "") : "";
  // Served from a CDN mirror of the repo -> use Pages. Served locally / elsewhere -> stay relative (local preview).
  var base = /cdn\.jsdelivr\.net|raw\.githubusercontent\.com|statically\.io/.test(here) ? PAGES : here;
  var s = document.createElement("script");
  s.src = base + "/bx-widget.js";
  s.async = true;
  s.onerror = function () {
    if (base === PAGES && here) { var f = document.createElement("script"); f.src = here + "/bx-widget.js"; document.head.appendChild(f); }
  };
  (me && me.parentNode ? me.parentNode : document.head).appendChild(s);
})();
