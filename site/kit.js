/* ============================================================================
   KLAVITY MARKETING KIT  ·  kit.js
   Shared, dependency-free scroll-reveal + tiny helpers for every page.

   - IntersectionObserver adds `.in` to `.reveal` elements as they enter view.
   - Stagger: each element gets a `--d` delay. Set it inline (style="--d:.12s")
     for explicit control, or let an `.auto-stagger` parent space its children
     automatically (60ms apart, capped).
   - Fully gated behind prefers-reduced-motion: when motion is reduced we do
     NOTHING (content is visible by default in kit.css), so it degrades cleanly.
   - Defer-load it: <script src="/kit.js" defer></script>
   ========================================================================== */
(function () {
  "use strict";

  var prefersReduced =
    window.matchMedia &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  var supportsIO = "IntersectionObserver" in window;

  function init() {
    var reveals = document.querySelectorAll(".reveal");

    /* Reduced motion or no IO support → leave everything visible (kit.css
       keeps `.reveal` visible until armed with [data-anim]). Bail out. */
    if (prefersReduced || !supportsIO || !reveals.length) return;

    /* Auto-stagger: children of `.auto-stagger` get an incremental --d unless
       they already define one. Cap so long lists don't lag. */
    document.querySelectorAll(".auto-stagger").forEach(function (group) {
      var kids = group.querySelectorAll(":scope > .reveal");
      kids.forEach(function (el, i) {
        if (!el.style.getPropertyValue("--d")) {
          el.style.setProperty("--d", Math.min(i * 0.06, 0.42) + "s");
        }
      });
    });

    /* Arm the hidden start-state, then observe. */
    var io = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (e) {
          if (e.isIntersecting) {
            e.target.classList.add("in");
            io.unobserve(e.target);
          }
        });
      },
      { threshold: 0.14, rootMargin: "0px 0px -8% 0px" }
    );

    reveals.forEach(function (el) {
      el.setAttribute("data-anim", "");
      io.observe(el);
    });
  }

  /* Tiny shared helper: stamp the current year wherever <span data-year> sits
     (used in footers so pages don't hardcode 2026). */
  function stampYear() {
    var y = String(new Date().getFullYear());
    document.querySelectorAll("[data-year]").forEach(function (n) {
      n.textContent = y;
    });
  }

  function boot() {
    stampYear();
    init();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }

  /* Expose a minimal API for pages that build content dynamically. */
  window.KlavityKit = { reveal: init };
})();

// --- icons (mirror of @klavity/core icon()) ---
// Reads from window.KLAV_ICONS populated by /icons.generated.js.
// Extends window.KlavityKit (the existing static-site global) rather than
// introducing a separate window.Klav, following kit.js's own export pattern.
(function (K) {
  function esc(s) {
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }
  K.icon = function (name, opts) {
    opts = opts || {};
    var body = (window.KLAV_ICONS || {})[name];
    if (!body) throw new Error('Unknown icon: ' + name);
    var size = opts.size ?? 18;
    var cls = opts['class'] ? 'icon ' + opts['class'] : 'icon';
    var a11y = opts.label ? 'role="img"' : 'aria-hidden="true"';
    var title = opts.label ? '<title>' + esc(opts.label) + '</title>' : '';
    return (
      '<svg xmlns="http://www.w3.org/2000/svg" class="' + cls +
      '" width="' + size + '" height="' + size +
      '" viewBox="0 0 24 24" fill="none" stroke="currentColor"' +
      ' stroke-width="2" stroke-linecap="round" stroke-linejoin="round" ' +
      a11y + '>' + title + body + '</svg>'
    );
  };
})(window.KlavityKit = window.KlavityKit || {});
