/**
 * Standalone tool frameless chrome — inject title bar + wire drag/resize.
 * Requires pywebview js_api: window_start_drag, window_start_resize,
 * get_window_bounds, set_window_bounds, window_minimize, window_toggle_maximize,
 * window_close.
 * Skips when ?embed=1 / body.pcd-embed (in-hub iframe).
 *
 * Resize prefers pointer-driven SetWindowPos (async-bridge safe). WM_NCLBUTTONDOWN
 * alone fails on FormBorderStyle.None / delayed bridge — same as PC Command hub.
 */
(function () {
  "use strict";

  // Match HostHelpers TOOL_MIN_SIZE; host also clamps via set_window_bounds.
  const MIN_W = 1200;
  const MIN_H = 780;

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
      // data-tool-subtitle="" → no subtitle (hubs use full title alone).
      // Absent attribute → default brand for standalone tools.
      const rawSubAttr =
        document.body && document.body.hasAttribute("data-tool-subtitle")
          ? document.body.getAttribute("data-tool-subtitle")
          : null;
      const versionAttr =
        (document.body && document.body.getAttribute("data-tool-version")) || "";
      const ver = String(versionAttr || "").trim();
      let displayName = name;
      if (ver && !/\[v?\d/i.test(name)) {
        const norm = ver.charAt(0).toLowerCase() === "v" ? ver : "v" + ver;
        displayName = name + " [" + norm + "]";
      }
      const sub =
        rawSubAttr === null ? "PC Command" : String(rawSubAttr || "").trim();
      if (sub) {
        const safeSub = String(sub)
          .replace(/&/g, "&amp;")
          .replace(/</g, "&lt;")
          .replace(/>/g, "&gt;")
          .replace(/"/g, "&quot;");
        titleEl.innerHTML = displayName + " <em>" + safeSub + "</em>";
      } else {
        titleEl.textContent = displayName;
      }
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

    // Pointer-driven frameless resize — async js_api safe (SetWindowPos per move).
    const applyEdgeDelta = (edge, geo, dx, dy) => {
      let x = geo.x;
      let y = geo.y;
      let w = geo.w;
      let h = geo.h;
      if (edge === "right" || edge === "top-right" || edge === "bottom-right") w = geo.w + dx;
      if (edge === "left" || edge === "top-left" || edge === "bottom-left") {
        x = geo.x + dx;
        w = geo.w - dx;
      }
      if (edge === "bottom" || edge === "bottom-left" || edge === "bottom-right") h = geo.h + dy;
      if (edge === "top" || edge === "top-left" || edge === "top-right") {
        y = geo.y + dy;
        h = geo.h - dy;
      }
      if (w < MIN_W) {
        if (edge.includes("left")) x = geo.x + geo.w - MIN_W;
        w = MIN_W;
      }
      if (h < MIN_H) {
        if (edge.includes("top")) y = geo.y + geo.h - MIN_H;
        h = MIN_H;
      }
      return { x, y, w, h };
    };

    let resizeSession = null;
    const endResize = () => {
      if (!resizeSession) return;
      const s = resizeSession;
      resizeSession = null;
      try {
        if (s.pointerId != null) s.el.releasePointerCapture(s.pointerId);
      } catch (_) {}
      window.removeEventListener("pointermove", onResizeMove);
      window.removeEventListener("pointerup", endResize);
      window.removeEventListener("pointercancel", endResize);
    };
    const onResizeMove = (ev) => {
      if (!resizeSession || !resizeSession.geo) return;
      const dx = ev.screenX - resizeSession.startX;
      const dy = ev.screenY - resizeSession.startY;
      const next = applyEdgeDelta(resizeSession.edge, resizeSession.geo, dx, dy);
      const api = apiRef || window.pywebview?.api;
      if (api && typeof api.set_window_bounds === "function") {
        try {
          api.set_window_bounds(next.x, next.y, next.w, next.h);
        } catch (_) {}
      }
    };

    document.querySelectorAll(".tool-resize-edge").forEach((el) => {
      el.addEventListener("pointerdown", (ev) => {
        if (ev.button !== 0) return;
        ev.preventDefault();
        ev.stopPropagation();
        const edge = el.getAttribute("data-edge") || "right";
        try {
          el.setPointerCapture(ev.pointerId);
        } catch (_) {}
        resizeSession = {
          el,
          edge,
          geo: null,
          startX: ev.screenX,
          startY: ev.screenY,
          pointerId: ev.pointerId,
        };
        window.addEventListener("pointermove", onResizeMove);
        window.addEventListener("pointerup", endResize);
        window.addEventListener("pointercancel", endResize);
        ensureApi()
          .then((api) => (api && api.get_window_bounds ? api.get_window_bounds() : null))
          .then((res) => {
            if (!resizeSession || resizeSession.el !== el) return;
            if (res?.ok) {
              resizeSession.geo = { x: res.x, y: res.y, w: res.w, h: res.h };
              return;
            }
            // Fallback: best-effort native HT* (needs WS_THICKFRAME)
            callSync("window_start_resize", edge);
            endResize();
          })
          .catch(() => {
            callSync("window_start_resize", edge);
            endResize();
          });
      });
    });
  }

  function boot() {
    if (isEmbed()) return;
    wire(ensureChrome());
  }

  function setTitle(title, opts) {
    const t = String(title || "").trim();
    if (!t) return;
    try {
      document.body && document.body.setAttribute("data-tool-title", t);
      if (opts && Object.prototype.hasOwnProperty.call(opts, "subtitle")) {
        document.body.setAttribute("data-tool-subtitle", String(opts.subtitle || ""));
      }
      if (opts && opts.version != null) {
        document.body.setAttribute("data-tool-version", String(opts.version || ""));
      }
      const el = document.getElementById("toolTitleText");
      if (el) {
        el.dataset.locked = "1";
        el.textContent = t;
      }
    } catch (_) {}
  }

  window.PcToolChrome = {
    setTitle,
    refresh() {
      const el = document.getElementById("toolTitleText");
      if (el) delete el.dataset.locked;
      ensureChrome();
    },
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
