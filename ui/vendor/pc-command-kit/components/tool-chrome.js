/**
 * Standalone tool frameless chrome — inject title bar + wire drag/resize.
 * Requires pywebview js_api: window_start_drag, window_start_resize,
 * window_minimize, window_toggle_maximize, window_close.
 * Skips when ?embed=1 / body.pcd-embed (in-hub iframe).
 */
(function () {
  "use strict";

  function isEmbed() {
    try {
      if (document.documentElement.classList.contains("pcd-embed")) return true;
      if (document.body && document.body.classList.contains("pcd-embed")) return true;
      return /(?:^|[?&])embed=1(?:&|$)/.test(location.search || "");
    } catch (_) {
      return false;
    }
  }

  function toolLabel() {
    const fromData = (document.body && document.body.getAttribute("data-tool-title")) || "";
    if (fromData.trim()) return fromData.trim();
    const raw = (document.title || "").trim();
    if (!raw) return "Outil";
    const parts = raw.split(/\s+[—–-]\s+/);
    return (parts[0] || raw).trim();
  }

  function ensureChrome() {
    if (isEmbed()) return null;
    document.body.classList.add("frameless");

    let bar = document.getElementById("toolTitlebar");
    if (!bar) {
      bar = document.createElement("header");
      bar.className = "tool-titlebar";
      bar.id = "toolTitlebar";
      bar.innerHTML =
        '<div class="tool-title pywebview-drag-region" id="toolTitleText"></div>' +
        '<div class="win-controls" role="group" aria-label="Fenêtre">' +
        '<button type="button" class="win-btn" id="toolWinMin" title="Réduire" aria-label="Réduire">─</button>' +
        '<button type="button" class="win-btn" id="toolWinMax" title="Agrandir" aria-label="Agrandir">□</button>' +
        '<button type="button" class="win-btn win-close" id="toolWinClose" title="Fermer" aria-label="Fermer">×</button>' +
        "</div>";
      document.body.insertBefore(bar, document.body.firstChild);
    }

    const titleEl = document.getElementById("toolTitleText");
    if (titleEl && !titleEl.dataset.locked) {
      const name = toolLabel();
      titleEl.innerHTML =
        name + ' <em>L\'Atelier PC Command</em>';
    }

    if (!document.querySelector(".tool-resize-edges")) {
      const edges = document.createElement("div");
      edges.className = "tool-resize-edges";
      edges.setAttribute("aria-hidden", "true");
      edges.innerHTML =
        '<div class="tool-resize-edge n" data-edge="top"></div>' +
        '<div class="tool-resize-edge s" data-edge="bottom"></div>' +
        '<div class="tool-resize-edge e" data-edge="right"></div>' +
        '<div class="tool-resize-edge w" data-edge="left"></div>' +
        '<div class="tool-resize-edge nw" data-edge="top-left"></div>' +
        '<div class="tool-resize-edge ne" data-edge="top-right"></div>' +
        '<div class="tool-resize-edge sw" data-edge="bottom-left"></div>' +
        '<div class="tool-resize-edge se" data-edge="bottom-right"></div>';
      document.body.appendChild(edges);
    }

    return bar;
  }

  function wire(bar) {
    if (!bar) return;
    let apiRef = null;

    const ensureApi = () => {
      if (apiRef) return Promise.resolve(apiRef);
      return new Promise((resolve) => {
        let tries = 0;
        const tick = () => {
          const api = window.pywebview && window.pywebview.api;
          if (api) {
            apiRef = api;
            resolve(api);
            return;
          }
          if (++tries > 80) {
            resolve(null);
            return;
          }
          setTimeout(tick, 50);
        };
        tick();
      });
    };

    const call = async (method, ...args) => {
      try {
        const api = await ensureApi();
        if (api && typeof api[method] === "function") await api[method](...args);
      } catch (_) {}
    };

    const callSync = (method, ...args) => {
      if (apiRef && typeof apiRef[method] === "function") {
        try {
          apiRef[method](...args);
          return true;
        } catch (_) {}
      }
      if (window.pywebview?.api && typeof window.pywebview.api[method] === "function") {
        try {
          window.pywebview.api[method](...args);
          apiRef = window.pywebview.api;
          return true;
        } catch (_) {}
      }
      call(method, ...args);
      return false;
    };

    ensureApi().catch(() => {});

    document.getElementById("toolWinMin")?.addEventListener("click", () => call("window_minimize"));
    document.getElementById("toolWinMax")?.addEventListener("click", () => call("window_toggle_maximize"));
    document.getElementById("toolWinClose")?.addEventListener("click", () => call("window_close"));

    bar.addEventListener("dblclick", (ev) => {
      const t = ev.target;
      if (t && t.closest("button,.win-controls,.win-btn")) return;
      call("window_toggle_maximize");
    });

    bar.addEventListener("mousedown", (ev) => {
      if (ev.button !== 0) return;
      const t = ev.target;
      if (t && t.closest("button,.win-controls,.win-btn,.tool-resize-edge")) return;
      callSync("window_start_drag");
    });

    document.querySelectorAll(".tool-resize-edge").forEach((el) => {
      el.addEventListener("mousedown", (ev) => {
        if (ev.button !== 0) return;
        ev.preventDefault();
        ev.stopPropagation();
        callSync("window_start_resize", el.getAttribute("data-edge") || "right");
      });
    });
  }

  function boot() {
    if (isEmbed()) return;
    wire(ensureChrome());
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
